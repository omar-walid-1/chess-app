import { useState, useEffect, useRef } from "react";
import { db } from "./firebase";
import { ref, push, onValue } from "firebase/database";

export default function Chat({ roomCode, playerId, playerName, compact }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const messagesEndRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const recordingTimeRef = useRef(0); // fix: ref بدل state للـ closure

  useEffect(() => {
    const msgsRef = ref(db, `rooms/${roomCode}/messages`);
    const unsub = onValue(msgsRef, snap => {
      if (!snap.exists()) { setMessages([]); return; }
      const arr = Object.entries(snap.val()).map(([id, msg]) => ({ id, ...msg }));
      arr.sort((a, b) => a.timestamp - b.timestamp);
      setMessages(arr);
    });
    return () => unsub();
  }, [roomCode]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendText() {
    if (!text.trim()) return;
    const t = text.trim();
    setText("");
    await push(ref(db, `rooms/${roomCode}/messages`), {
      type: "text", text: t,
      sender: playerName, senderId: playerId,
      timestamp: Date.now()
    });
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // جرب formats مختلفة
      const mimeTypes = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
      const supported = mimeTypes.find(t => MediaRecorder.isTypeSupported(t)) || "";
      
      const mr = new MediaRecorder(stream, supported ? { mimeType: supported } : {});
      chunksRef.current = [];
      
      mr.ondataavailable = e => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const mimeType = mr.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: mimeType });
        
        if (blob.size < 100) { alert("التسجيل فاضي، جرب تاني!"); return; }
        if (blob.size > 800 * 1024) { alert("التسجيل كبير أوي! سجل أقل من 30 ثانية."); return; }
        
        // استخدم FileReader بشكل صح
        const reader = new FileReader();
        reader.onload = async () => {
          const base64 = reader.result; // data:audio/webm;base64,XXXXX
          const duration = recordingTimeRef.current; // استخدم الـ ref مش الـ state
          await push(ref(db, `rooms/${roomCode}/messages`), {
            type: "voice",
            audio: base64,
            mimeType,
            duration,
            sender: playerName,
            senderId: playerId,
            timestamp: Date.now()
          });
        };
        reader.onerror = () => alert("فيه مشكلة في التسجيل، جرب تاني");
        reader.readAsDataURL(blob);
      };
      
      mr.start(100); // timeslice بـ 100ms عشان نضمن البيانات
      mediaRecorderRef.current = mr;
      setRecording(true);
      recordingTimeRef.current = 0;
      setRecordingTime(0);
      timerRef.current = setInterval(() => {
        recordingTimeRef.current += 1;
        setRecordingTime(t => t + 1);
      }, 1000);
    } catch (err) {
      console.error(err);
      alert("مش قادر يوصل للمايك! تأكد إنك أديت permission.");
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    clearInterval(timerRef.current);
    setRecording(false);
  }

  function fmt(s) {
    return `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
  }

  return (
    <div style={{
      display: "flex", flexDirection: "column",
      height: "100%", background: compact ? "#0d0f18" : "#0f1117",
      fontFamily: "'Cairo', sans-serif", direction: "rtl",
      borderRadius: compact ? "0 0 12px 12px" : 0
    }}>
      {/* Messages */}
      <div style={{
        flex: 1, overflowY: "auto", padding: "8px 8px",
        display: "flex", flexDirection: "column", gap: 4
      }}>
        {messages.length === 0 && (
          <div style={{ textAlign: "center", color: "#444", marginTop: 20, fontSize: 12 }}>
            ابدأ المحادثة! 👋
          </div>
        )}
        {messages.map(msg => {
          const isMe = msg.senderId === playerId;
          return (
            <div key={msg.id} style={{
              display: "flex", flexDirection: "column",
              alignItems: isMe ? "flex-end" : "flex-start"
            }}>
              {!isMe && (
                <span style={{ fontSize: 10, color: "#555", marginBottom: 1, marginRight: 8 }}>
                  {msg.sender}
                </span>
              )}
              <div style={{
                maxWidth: "78%",
                background: isMe ? "linear-gradient(135deg,#c9a84c,#e8d5a3)" : "#1e2130",
                color: isMe ? "#1a1d27" : "#e0e0e0",
                padding: msg.type === "voice" ? "7px 10px" : "8px 12px",
                borderRadius: isMe ? "16px 16px 3px 16px" : "16px 16px 16px 3px",
                fontSize: compact ? 13 : 14, lineHeight: 1.4,
                boxShadow: "0 2px 6px #0004", wordBreak: "break-word"
              }}>
                {msg.type === "text" && msg.text}
                {msg.type === "voice" && (
                  <VoiceMessage audio={msg.audio} mimeType={msg.mimeType} duration={msg.duration} isMe={isMe} />
                )}
              </div>
              <span style={{ fontSize: 9, color: "#3a3f55", marginTop: 1 }}>
                {new Date(msg.timestamp).toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input bar */}
      <div style={{
        padding: "8px 8px",
        background: "#13151f",
        borderTop: "1px solid #1a1d2a",
        display: "flex", alignItems: "center", gap: 6
      }}>
        {recording ? (
          <div style={{
            flex: 1, display: "flex", alignItems: "center", gap: 8,
            padding: "8px 12px", background: "#1e2130", borderRadius: 20
          }}>
            <div style={{
              width: 8, height: 8, borderRadius: "50%",
              background: "#ff4444", animation: "blink 1s infinite"
            }} />
            <span style={{ color: "#ff7070", fontSize: 13 }}>{fmt(recordingTime)} جاري التسجيل...</span>
          </div>
        ) : (
          <input
            value={text} onChange={e => setText(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendText()}
            placeholder="اكتب رسالة..."
            style={{
              flex: 1, padding: "9px 14px", borderRadius: 20,
              border: "1px solid #2a2d40", background: "#1e2130",
              color: "#fff", fontSize: 13, outline: "none",
              fontFamily: "'Cairo', sans-serif"
            }}
          />
        )}

        {recording ? (
          <button onClick={stopRecording} style={btnStyle("#ff4444")}>⏹</button>
        ) : text.trim() ? (
          <button onClick={sendText} style={btnStyle("linear-gradient(135deg,#c9a84c,#e8d5a3)", "#1a1d27")}>
            ➤
          </button>
        ) : (
          <button
            onMouseDown={startRecording}
            onTouchStart={e => { e.preventDefault(); startRecording(); }}
            style={btnStyle("#1e2130", "#e8d5a3", "1px solid #2d3044")}
          >
            🎙
          </button>
        )}
      </div>

      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.2} }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #2d3044; border-radius: 2px; }
      `}</style>
    </div>
  );
}

function btnStyle(bg, color = "#fff", border = "none") {
  return {
    width: 40, height: 40, borderRadius: "50%",
    background: bg, border,
    cursor: "pointer", fontSize: 16, flexShrink: 0,
    display: "flex", alignItems: "center", justifyContent: "center",
    color
  };
}

function VoiceMessage({ audio, mimeType, duration, isMe }) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(duration || 0);
  const audioRef = useRef(null);

  function getOrCreateAudio() {
    if (audioRef.current) return audioRef.current;
    
    // أهم إصلاح: تأكد إن الـ src صح
    const a = new Audio();
    a.preload = "metadata";
    
    // بعض المتصفحات محتاجة تحويل الـ base64 لـ blob URL
    try {
      const byteStr = atob(audio.split(",")[1]);
      const mime = mimeType || audio.split(";")[0].split(":")[1] || "audio/webm";
      const ab = new ArrayBuffer(byteStr.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteStr.length; i++) ia[i] = byteStr.charCodeAt(i);
      const blob = new Blob([ab], { type: mime });
      a.src = URL.createObjectURL(blob);
    } catch {
      a.src = audio; // fallback للـ base64 مباشرة
    }
    
    a.onloadedmetadata = () => {
      if (a.duration && isFinite(a.duration)) setTotalDuration(Math.round(a.duration));
    };
    a.ontimeupdate = () => {
      const p = a.duration ? (a.currentTime / a.duration) * 100 : 0;
      setProgress(p);
      setCurrentTime(Math.round(a.currentTime));
    };
    a.onended = () => { setPlaying(false); setProgress(0); setCurrentTime(0); };
    a.onerror = (e) => {
      console.error("Audio error:", e, a.error);
      setPlaying(false);
    };
    
    audioRef.current = a;
    return a;
  }

  function toggle() {
    const a = getOrCreateAudio();
    if (playing) {
      a.pause();
      setPlaying(false);
    } else {
      a.play().then(() => setPlaying(true)).catch(err => {
        console.error("Play error:", err);
        alert("مش قادر يشغل الصوت! جرب من متصفح تاني.");
      });
    }
  }

  function fmt(s) {
    if (!s || !isFinite(s)) return "0:00";
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 150 }}>
      <button onClick={toggle} style={{
        width: 32, height: 32, borderRadius: "50%",
        background: isMe ? "rgba(0,0,0,0.2)" : "#2d3044",
        border: "none", cursor: "pointer", fontSize: 12, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        color: isMe ? "#1a1d27" : "#e8d5a3"
      }}>
        {playing ? "⏸" : "▶"}
      </button>
      <div style={{ flex: 1 }}>
        <div style={{
          height: 3, background: isMe ? "rgba(0,0,0,0.25)" : "#0f1117",
          borderRadius: 2, overflow: "hidden", marginBottom: 3, cursor: "pointer"
        }}>
          <div style={{
            height: "100%", width: `${progress}%`,
            background: isMe ? "#5d4a1a" : "#c9a84c",
            transition: "width 0.1s", borderRadius: 2
          }} />
        </div>
        <span style={{ fontSize: 10, opacity: 0.65 }}>
          {playing ? fmt(currentTime) : fmt(totalDuration)}
        </span>
      </div>
      <span style={{ fontSize: 14 }}>🎵</span>
    </div>
  );
}
