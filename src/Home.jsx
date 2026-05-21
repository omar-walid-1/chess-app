import { useState, useEffect } from "react";
import { db } from "./firebase";
import { ref, set, get, onValue, remove } from "firebase/database";
import { useAuth } from "./AuthContext";

export default function Home({ onJoin }) {
  const { user, logout } = useAuth();
  const [roomCode, setRoomCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [challenges, setChallenges] = useState([]);

  // Listen for incoming challenges from friends
  useEffect(() => {
    if (!user) return;
    const unsub = onValue(ref(db, `users/${user.uid}/challenges`), snap => {
      if (!snap.exists()) { setChallenges([]); return; }
      const arr = Object.entries(snap.val())
        .map(([id, c]) => ({ id, ...c }))
        .filter(c => Date.now() - c.sentAt < 5 * 60 * 1000); // أقدم من 5 دقايق
      setChallenges(arr);
    });
    return () => unsub();
  }, [user]);

  async function acceptChallenge(challenge) {
    setLoading(true);
    const code = challenge.roomCode;
    const snap = await get(ref(db, `rooms/${code}`));
    if (!snap.exists()) { alert("الـ room انتهى!"); setLoading(false); return; }
    await set(ref(db, `rooms/${code}/players/${user.uid}`), {
      name: user.displayName, color: "black", joinedAt: Date.now(), photo: user.photoURL
    });
    await remove(ref(db, `users/${user.uid}/challenges/${challenge.id}`));
    setLoading(false);
    onJoin(code, user.uid, user.displayName);
  }

  async function declineChallenge(id) {
    await remove(ref(db, `users/${user.uid}/challenges/${id}`));
  }

  function genCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  async function createRoom() {
    setLoading(true);
    const code = genCode();
    await set(ref(db, `rooms/${code}`), {
      created: Date.now(), status: "waiting",
      createdBy: user.uid,
      players: {
        [user.uid]: { name: user.displayName, color: "white", joinedAt: Date.now(), photo: user.photoURL }
      },
      game: {
        fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        turn: "w", status: "waiting"
      }
    });
    setLoading(false);
    onJoin(code, user.uid, user.displayName);
  }

  async function joinRoom() {
    setLoading(true); setError("");
    const code = roomCode.trim().toUpperCase();
    const snap = await get(ref(db, `rooms/${code}`));
    if (!snap.exists()) { setError("الـ room مش موجود!"); setLoading(false); return; }
    const room = snap.val();
    const players = room.players || {};

    if (players[user.uid]) {
      setLoading(false);
      onJoin(code, user.uid, user.displayName);
      return;
    }

    if (Object.keys(players).length >= 4) {
      setError("الـ room فيه 4 لاعبين بالفعل!");
      setLoading(false); return;
    }

    const taken = Object.values(players).map(p => p.color);
    let color = "spectator";
    if (!taken.includes("white")) color = "white";
    else if (!taken.includes("black")) color = "black";

    await set(ref(db, `rooms/${code}/players/${user.uid}`), {
      name: user.displayName, color, joinedAt: Date.now(), photo: user.photoURL
    });
    setLoading(false);
    onJoin(code, user.uid, user.displayName);
  }

  return (
    <div style={{
      minHeight: "100vh", background: "#0f1117",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'Cairo', sans-serif", direction: "rtl", padding: 20
    }}>
      <div style={{ width: "100%", maxWidth: 420 }}>
        {/* User bar */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          marginBottom: 20, background: "#1a1d27", borderRadius: 14,
          padding: "10px 16px"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {user?.photoURL
              ? <img src={user.photoURL} style={{ width: 36, height: 36, borderRadius: "50%" }} alt="" />
              : <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#c9a84c", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: "#1a1d27" }}>{user?.displayName?.charAt(0)}</div>
            }
            <div>
              <div style={{ color: "#e8d5a3", fontSize: 13, fontWeight: 700 }}>{user?.displayName}</div>
              <div style={{ color: "#555", fontSize: 11 }}>{user?.email}</div>
            </div>
          </div>
          <button onClick={logout} style={{
            background: "transparent", border: "none",
            color: "#555", cursor: "pointer", fontSize: 12,
            fontFamily: "'Cairo', sans-serif"
          }}>خروج</button>
        </div>

        {/* Incoming challenges */}
        {challenges.map(c => (
          <div key={c.id} style={{
            background: "#1a2a1a", border: "1px solid #3a6b3a",
            borderRadius: 14, padding: "14px 16px", marginBottom: 12,
            display: "flex", alignItems: "center", justifyContent: "space-between"
          }}>
            <div>
              <div style={{ color: "#4CAF50", fontSize: 13, fontWeight: 700 }}>♟ تحدي جديد!</div>
              <div style={{ color: "#888", fontSize: 12 }}>{c.fromName} بيتحداك</div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => acceptChallenge(c)} disabled={loading} style={{
                padding: "8px 14px", borderRadius: 10,
                background: "linear-gradient(135deg,#c9a84c,#e8d5a3)",
                border: "none", color: "#1a1d27", fontSize: 12,
                fontWeight: 700, cursor: "pointer", fontFamily: "'Cairo', sans-serif"
              }}>قبول ♟</button>
              <button onClick={() => declineChallenge(c.id)} style={{
                padding: "8px 10px", borderRadius: 10,
                background: "#2d3044", border: "none",
                color: "#888", fontSize: 12, cursor: "pointer"
              }}>✕</button>
            </div>
          </div>
        ))}

        {/* Main card */}
        <div style={{
          background: "#1a1d27", borderRadius: 24, padding: "36px 32px",
          boxShadow: "0 8px 64px #000a"
        }}>
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <div style={{ fontSize: 52 }}>♟️</div>
            <h1 style={{ color: "#e8d5a3", fontSize: 24, margin: "8px 0 4px", fontWeight: 800 }}>
              Chess مع صحابك
            </h1>
          </div>

          <button onClick={createRoom} disabled={loading} style={{
            width: "100%", padding: "13px", borderRadius: 12,
            background: "linear-gradient(135deg,#c9a84c,#e8d5a3)",
            border: "none", color: "#1a1d27", fontSize: 15,
            fontWeight: 700, cursor: "pointer", marginBottom: 18,
            fontFamily: "'Cairo', sans-serif",
            opacity: loading ? 0.6 : 1
          }}>
            {loading ? "..." : "➕ إنشاء room جديد"}
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
            <div style={{ flex: 1, height: 1, background: "#2d3044" }} />
            <span style={{ color: "#444", fontSize: 12 }}>أو</span>
            <div style={{ flex: 1, height: 1, background: "#2d3044" }} />
          </div>

          <input
            value={roomCode} onChange={e => setRoomCode(e.target.value.toUpperCase())}
            placeholder="كود الـ Room"
            maxLength={6}
            style={{
              width: "100%", padding: "12px 16px", borderRadius: 12,
              border: "1.5px solid #2d3044", background: "#0f1117",
              color: "#fff", fontSize: 18, fontFamily: "monospace",
              outline: "none", boxSizing: "border-box", letterSpacing: 4,
              textAlign: "center", marginBottom: 10
            }}
          />
          {error && <p style={{ color: "#ff6b6b", fontSize: 12, textAlign: "center", margin: "0 0 8px" }}>{error}</p>}
          <button onClick={joinRoom} disabled={loading || !roomCode.trim()} style={{
            width: "100%", padding: "13px", borderRadius: 12,
            background: "#2d3044", border: "1.5px solid #3d4060",
            color: "#e8d5a3", fontSize: 15, fontWeight: 700,
            cursor: "pointer", fontFamily: "'Cairo', sans-serif",
            opacity: loading || !roomCode.trim() ? 0.5 : 1
          }}>
            🚪 دخول على room
          </button>
        </div>
      </div>
    </div>
  );
}
