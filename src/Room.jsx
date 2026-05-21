import { useState, useEffect, useRef } from "react";
import { db } from "./firebase";
import { ref, onValue, update, push, remove } from "firebase/database";
import { Chess } from "chess.js";
import ChessBoard from "./ChessBoard";
import Chat from "./Chat";
import { playTimerLow, playTimerEnd } from "./sounds";

const TIMER_OPTIONS = [1, 3, 5, 10];

export default function Room({ roomCode, playerId, playerName, onGoHome }) {
  const [room, setRoom] = useState(null);
  const [myColor, setMyColor] = useState("spectator");
  const [chatOpen, setChatOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [lastSeenTs, setLastSeenTs] = useState(Date.now());
  const [whiteTime, setWhiteTime] = useState(null);
  const [blackTime, setBlackTime] = useState(null);
  const [undoRequest, setUndoRequest] = useState(null); // { fromColor }
  const timerRef = useRef(null);

  useEffect(() => {
    const unsub = onValue(ref(db, `rooms/${roomCode}`), snap => {
      if (!snap.exists()) return;
      const data = snap.val();
      setRoom(data);
      const me = data.players?.[playerId];
      if (me) setMyColor(me.color);
      if (data.game?.whiteTime !== undefined) setWhiteTime(data.game.whiteTime);
      if (data.game?.blackTime !== undefined) setBlackTime(data.game.blackTime);
      // Undo request
      if (data.undoRequest) setUndoRequest(data.undoRequest);
      else setUndoRequest(null);
    });
    return () => unsub();
  }, [roomCode, playerId]);

  // Timer countdown
  useEffect(() => {
    clearInterval(timerRef.current);
    const game = room?.game;
    if (!game || game.status !== "playing" || game.whiteTime === undefined) return;
    const turn = game.turn || "w";
    timerRef.current = setInterval(() => {
      const setter = turn === "w" ? setWhiteTime : setBlackTime;
      setter(t => {
        const next = (t ?? 0) - 1;
        if (next <= 10 && next > 0) playTimerLow();
        if (next <= 0) {
          clearInterval(timerRef.current);
          playTimerEnd();
          update(ref(db, `rooms/${roomCode}/game`), {
            status: "timeout", winner: turn === "w" ? "black" : "white"
          });
          return 0;
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [room?.game?.status, room?.game?.turn, roomCode]);

  useEffect(() => {
    if (chatOpen) { setUnread(0); setLastSeenTs(Date.now()); return; }
    const unsub = onValue(ref(db, `rooms/${roomCode}/messages`), snap => {
      if (!snap.exists()) return;
      const count = Object.values(snap.val()).filter(m => m.timestamp > lastSeenTs).length;
      setUnread(count);
    });
    return () => unsub();
  }, [chatOpen, roomCode, lastSeenTs]);

  async function handleMove(newFen, moveResult) {
    const chess = new Chess(newFen);
    let status = "playing";
    if (chess.isCheckmate()) status = "checkmate";
    else if (chess.isDraw()) status = "draw";

    const updateData = {
      fen: newFen, turn: chess.turn(), status,
      lastMove: { from: moveResult.from, to: moveResult.to }
    };
    if (room?.game?.whiteTime !== undefined) {
      updateData.whiteTime = whiteTime;
      updateData.blackTime = blackTime;
    }

    // Save move to history
    await push(ref(db, `rooms/${roomCode}/moveHistory`), {
      fen: newFen, san: moveResult.san,
      from: moveResult.from, to: moveResult.to,
      color: moveResult.color, flags: moveResult.flags,
      captured: moveResult.captured || null,
      movedAt: Date.now()
    });

    // Clear any undo request on new move
    await remove(ref(db, `rooms/${roomCode}/undoRequest`));

    // Save match result when game ends
    if (status === "checkmate" || status === "draw") {
      await saveMatchHistory(status, chess, moveResult);
    }

    await update(ref(db, `rooms/${roomCode}/game`), updateData);
  }

  async function saveMatchHistory(status, chess, moveResult) {
    const players = room?.players || {};
    const playersList = Object.entries(players).map(([id, p]) => ({ id, ...p }));
    const whiteP = playersList.find(p => p.color === "white");
    const blackP = playersList.find(p => p.color === "black");
    if (!whiteP || !blackP) return;

    let winnerId = null;
    if (status === "checkmate") {
      // الي كان دوره يعني خسر
      winnerId = chess.turn() === "w" ? blackP.id : whiteP.id;
    }

    const matchData = {
      roomCode,
      result: status === "draw" ? "draw" : "checkmate",
      winner: winnerId,
      playedAt: Date.now(),
      timerMins: room?.game?.timerMins || null,
    };

    // Save for white player
    await push(ref(db, `users/${whiteP.id}/matchHistory`), {
      ...matchData,
      opponentName: blackP.name,
      opponentId: blackP.id,
      myColor: "white"
    });
    // Save for black player
    await push(ref(db, `users/${blackP.id}/matchHistory`), {
      ...matchData,
      opponentName: whiteP.name,
      opponentId: whiteP.id,
      myColor: "black"
    });
  }

  async function startGame(timerMins = null) {
    const updateData = { status: "playing" };
    if (timerMins) {
      updateData.whiteTime = timerMins * 60;
      updateData.blackTime = timerMins * 60;
      updateData.timerMins = timerMins;
    }
    await update(ref(db, `rooms/${roomCode}/game`), updateData);
  }

  async function resetGame() {
    const timerMins = room?.game?.timerMins;
    const updateData = {
      fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      turn: "w", status: "playing", lastMove: null
    };
    if (timerMins) {
      updateData.whiteTime = timerMins * 60;
      updateData.blackTime = timerMins * 60;
    }
    await update(ref(db, `rooms/${roomCode}/game`), updateData);
    await remove(ref(db, `rooms/${roomCode}/moveHistory`));
    await remove(ref(db, `rooms/${roomCode}/undoRequest`));
  }

  async function requestUndo() {
    await update(ref(db, `rooms/${roomCode}/undoRequest`), {
      fromColor: myColor, requestedAt: Date.now()
    });
  }

  async function acceptUndo() {
    // Go back 2 moves (one full round) in history
    const snap = await new Promise(res => {
      const unsubOnce = onValue(ref(db, `rooms/${roomCode}/moveHistory`), s => { res(s); unsubOnce(); });
    });
    if (!snap.exists()) return;
    const moves = Object.entries(snap.val()).sort((a, b) => a[1].movedAt - b[1].movedAt);
    if (moves.length < 2) return;
    // Remove last 2 moves and restore previous fen
    const targetMove = moves[moves.length - 2];
    const prevFen = targetMove[1].fen;
    // Delete last 2 move entries
    await remove(ref(db, `rooms/${roomCode}/moveHistory/${moves[moves.length - 1][0]}`));
    await remove(ref(db, `rooms/${roomCode}/moveHistory/${moves[moves.length - 2][0]}`));
    const chess = new Chess(prevFen);
    await update(ref(db, `rooms/${roomCode}/game`), {
      fen: prevFen, turn: chess.turn(), status: "playing", lastMove: null
    });
    await remove(ref(db, `rooms/${roomCode}/undoRequest`));
  }

  async function declineUndo() {
    await remove(ref(db, `rooms/${roomCode}/undoRequest`));
  }

  if (!room) return (
    <div style={{
      minHeight: "100vh", background: "#0f1117",
      display: "flex", alignItems: "center", justifyContent: "center",
      color: "#e8d5a3", fontFamily: "'Cairo', sans-serif"
    }}>جاري التحميل...</div>
  );

  const players = room.players || {};
  const playersList = Object.entries(players).map(([id, p]) => ({ id, ...p }));
  const game = room.game || {};
  const gameStatus = game.status || "waiting";
  const whitePlayer = playersList.find(p => p.color === "white");
  const blackPlayer = playersList.find(p => p.color === "black");
  const spectators = playersList.filter(p => p.color === "spectator");
  const canStart = myColor === "white" && gameStatus === "waiting"
    && playersList.some(p => p.color === "black");
  const hasTimer = game.whiteTime !== undefined && game.whiteTime !== null;
  const isPlayer = myColor === "white" || myColor === "black";
  // Undo: show accept/decline if the OTHER player requested it
  const canAcceptUndo = undoRequest && undoRequest.fromColor !== myColor && isPlayer;
  const iRequestedUndo = undoRequest && undoRequest.fromColor === myColor;

  const CHAT_H = 340;

  return (
    <div style={{
      height: "100dvh", background: "#0f1117",
      display: "flex", flexDirection: "column",
      fontFamily: "'Cairo', sans-serif", direction: "rtl",
      maxWidth: 480, margin: "0 auto", position: "relative", overflow: "hidden"
    }}>
      {/* Header */}
      <div style={{
        padding: "10px 14px", background: "#13151f",
        borderBottom: "1px solid #1e2130",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexShrink: 0
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={onGoHome} style={{
            background: "none", border: "none", color: "#666",
            fontSize: 18, cursor: "pointer", padding: "0 4px"
          }}>←</button>
          <button onClick={() => navigator.clipboard.writeText(roomCode)} style={{
            background: "#1e2130", border: "1px solid #2d3044",
            color: "#c9a84c", padding: "2px 8px", borderRadius: 6,
            cursor: "pointer", fontSize: 11, fontFamily: "monospace", letterSpacing: 2
          }}>{roomCode} 📋</button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {playersList.map(p => (
            <div key={p.id} title={`${p.name} (${p.color})`} style={{
              width: 30, height: 30, borderRadius: "50%", overflow: "hidden",
              border: "2px solid " + (p.color === "white" ? "#f0d9b5" : p.color === "black" ? "#555" : "#333"),
              background: "#1e2130"
            }}>
              {p.photo
                ? <img src={p.photo} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" />
                : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: p.id === playerId ? "#c9a84c" : "#888" }}>{p.name?.charAt(0)}</div>
              }
            </div>
          ))}
        </div>
      </div>

      {/* Players strip */}
      <div style={{
        display: "flex", gap: 8, padding: "7px 14px",
        background: "#13151f", borderBottom: "1px solid #1e2130", flexShrink: 0
      }}>
        <PlayerTag player={blackPlayer} label="⬛" isMe={blackPlayer?.id === playerId}
          time={hasTimer ? blackTime : null} isActive={gameStatus === "playing" && game.turn === "b"} />
        <PlayerTag player={whitePlayer} label="⬜" isMe={whitePlayer?.id === playerId}
          time={hasTimer ? whiteTime : null} isActive={gameStatus === "playing" && game.turn === "w"} />
        {spectators.length > 0 && (
          <div style={{ fontSize: 11, color: "#444", alignSelf: "center" }}>
            👁 {spectators.map(s => s.name).join(", ")}
          </div>
        )}
      </div>

      {/* Game area */}
      <div style={{
        flex: 1, overflowY: "auto", display: "flex",
        flexDirection: "column", alignItems: "center",
        padding: "10px 12px", gap: 10,
        paddingBottom: chatOpen ? CHAT_H + 60 : 70
      }}>
        {/* Start buttons */}
        {canStart && (
          <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ color: "#888", fontSize: 12, textAlign: "center" }}>اختار وقت اللعبة</div>
            <div style={{ display: "flex", gap: 6 }}>
              {TIMER_OPTIONS.map(m => (
                <button key={m} onClick={() => startGame(m)} style={{
                  flex: 1, padding: "10px 4px", borderRadius: 10,
                  background: "#1e2130", border: "1px solid #2d3044",
                  color: "#e8d5a3", fontSize: 13, cursor: "pointer",
                  fontFamily: "'Cairo', sans-serif", fontWeight: 700
                }}>{m}د</button>
              ))}
              <button onClick={() => startGame(null)} style={{
                flex: 1, padding: "10px 4px", borderRadius: 10,
                background: "linear-gradient(135deg,#c9a84c,#e8d5a3)",
                border: "none", color: "#1a1d27", fontSize: 12,
                cursor: "pointer", fontFamily: "'Cairo', sans-serif", fontWeight: 700
              }}>∞</button>
            </div>
          </div>
        )}

        {gameStatus === "waiting" && !canStart && myColor !== "spectator" && (
          <div style={{
            background: "#1e2130", borderRadius: 12, padding: "11px 18px",
            color: "#888", fontSize: 13, textAlign: "center", width: "100%"
          }}>⏳ في انتظار لاعب تاني...</div>
        )}

        {/* Undo notification */}
        {canAcceptUndo && (
          <div style={{
            width: "100%", background: "#1a2a3a", border: "1px solid #2a4a6a",
            borderRadius: 12, padding: "12px 14px",
            display: "flex", alignItems: "center", justifyContent: "space-between"
          }}>
            <span style={{ color: "#7ab8f5", fontSize: 13 }}>
              🔄 {undoRequest.fromColor === "white" ? "الأبيض" : "الأسود"} بيطلب تراجع
            </span>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={acceptUndo} style={{
                padding: "6px 12px", borderRadius: 8, background: "#4CAF50",
                border: "none", color: "#fff", fontSize: 12, cursor: "pointer"
              }}>✓ قبول</button>
              <button onClick={declineUndo} style={{
                padding: "6px 12px", borderRadius: 8, background: "#2d3044",
                border: "none", color: "#888", fontSize: 12, cursor: "pointer"
              }}>✕ رفض</button>
            </div>
          </div>
        )}
        {iRequestedUndo && (
          <div style={{
            width: "100%", background: "#1e2130", borderRadius: 12,
            padding: "10px 14px", color: "#888", fontSize: 13, textAlign: "center"
          }}>⏳ في انتظار موافقة الخصم على التراجع...</div>
        )}

        <ChessBoard
          fen={game.fen || "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"}
          onMove={handleMove}
          myColor={myColor}
          gameStatus={gameStatus}
        />

        {/* Captured pieces + move history */}
        <CapturedAndHistory roomCode={roomCode} myColor={myColor} />

        {/* In-game controls */}
        {isPlayer && gameStatus === "playing" && !iRequestedUndo && !undoRequest && (
          <button onClick={requestUndo} style={{
            padding: "9px 20px", borderRadius: 10,
            background: "#1e2130", border: "1px solid #2d3044",
            color: "#888", fontSize: 13, cursor: "pointer",
            fontFamily: "'Cairo', sans-serif"
          }}>↩ طلب تراجع</button>
        )}

        {/* End game */}
        {(gameStatus === "checkmate" || gameStatus === "draw" || gameStatus === "timeout") && (
          <div style={{ textAlign: "center" }}>
            <div style={{ color: "#e8d5a3", fontSize: 20, fontWeight: 700, marginBottom: 10 }}>
              {gameStatus === "checkmate" && "🏆 كش مات!"}
              {gameStatus === "draw" && "🤝 تعادل!"}
              {gameStatus === "timeout" && `⏰ انتهى الوقت! فاز ${game.winner === "white" ? "الأبيض" : "الأسود"}`}
            </div>
            {isPlayer && (
              <button onClick={resetGame} style={{
                padding: "11px 28px", borderRadius: 12,
                background: "#1e2130", border: "1px solid #2d3044",
                color: "#e8d5a3", fontSize: 14, cursor: "pointer",
                fontFamily: "'Cairo', sans-serif", fontWeight: 700
              }}>🔄 لعبة جديدة</button>
            )}
          </div>
        )}
      </div>

      {/* Chat drawer */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0,
        height: chatOpen ? CHAT_H + 44 : 44,
        transition: "height 0.3s cubic-bezier(.4,0,.2,1)",
        display: "flex", flexDirection: "column",
        background: "#13151f", borderTop: "1px solid #1e2130",
        borderRadius: chatOpen ? "16px 16px 0 0" : "12px 12px 0 0",
        boxShadow: chatOpen ? "0 -8px 40px #000a" : "none", zIndex: 10
      }}>
        <button onClick={() => { if (!chatOpen) { setUnread(0); setLastSeenTs(Date.now()); } setChatOpen(o => !o); }} style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 16px", height: 44, background: "transparent",
          border: "none", cursor: "pointer", flexShrink: 0,
          fontFamily: "'Cairo', sans-serif", width: "100%"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 16 }}>💬</span>
            <span style={{ color: "#e8d5a3", fontSize: 14, fontWeight: 700 }}>الشات</span>
            {unread > 0 && (
              <span style={{ background: "#ff4444", color: "#fff", borderRadius: 10, padding: "1px 7px", fontSize: 11, fontWeight: 700 }}>{unread}</span>
            )}
          </div>
          <span style={{ color: "#666", fontSize: 18, transform: chatOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.3s" }}>⌃</span>
        </button>
        {chatOpen && (
          <div style={{ flex: 1, minHeight: 0 }}>
            <Chat roomCode={roomCode} playerId={playerId} playerName={playerName} compact={true} />
          </div>
        )}
      </div>
    </div>
  );
}

// Captured pieces + move history component
function CapturedAndHistory({ roomCode, myColor }) {
  const [moves, setMoves] = useState([]);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    const unsub = onValue(ref(db, `rooms/${roomCode}/moveHistory`), snap => {
      if (!snap.exists()) { setMoves([]); return; }
      const arr = Object.values(snap.val()).sort((a, b) => a.movedAt - b.movedAt);
      setMoves(arr);
    });
    return () => unsub();
  }, [roomCode]);

  // Calculate captured pieces from move history
  const whiteCaptured = moves.filter(m => m.color === "w" && m.captured).map(m => m.captured);
  const blackCaptured = moves.filter(m => m.color === "b" && m.captured).map(m => m.captured);

  const pieceSymbols = { p: "♟", n: "♞", b: "♝", r: "♜", q: "♛" };

  if (moves.length === 0) return null;

  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 6 }}>
      {/* Captured pieces */}
      <div style={{ display: "flex", gap: 8 }}>
        {[{ label: "⬜ أكل", pieces: whiteCaptured }, { label: "⬛ أكل", pieces: blackCaptured }].map(({ label, pieces }) => (
          pieces.length > 0 && (
            <div key={label} style={{
              flex: 1, background: "#1e2130", borderRadius: 10,
              padding: "6px 10px", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap"
            }}>
              <span style={{ color: "#555", fontSize: 11 }}>{label}:</span>
              <span style={{ fontSize: 14, letterSpacing: 1 }}>
                {pieces.map(p => pieceSymbols[p] || "").join("")}
              </span>
            </div>
          )
        ))}
      </div>

      {/* Move history toggle */}
      <button onClick={() => setShowHistory(h => !h)} style={{
        background: "#1e2130", border: "none", borderRadius: 10,
        padding: "7px 12px", color: "#666", fontSize: 12,
        cursor: "pointer", fontFamily: "'Cairo', sans-serif",
        display: "flex", alignItems: "center", justifyContent: "space-between"
      }}>
        <span>📋 الحركات ({moves.length})</span>
        <span style={{ transform: showHistory ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>⌃</span>
      </button>

      {showHistory && (
        <div style={{
          background: "#1e2130", borderRadius: 10, padding: "10px",
          maxHeight: 160, overflowY: "auto",
          display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 12px"
        }}>
          {Array.from({ length: Math.ceil(moves.length / 2) }, (_, i) => {
            const w = moves[i * 2];
            const b = moves[i * 2 + 1];
            return (
              <div key={i} style={{ display: "contents" }}>
                <span style={{ color: "#555", fontSize: 11 }}>
                  <span style={{ color: "#444", marginLeft: 4 }}>{i + 1}.</span>
                  <span style={{ color: "#e8d5a3", fontFamily: "monospace" }}> {w?.san}</span>
                </span>
                <span style={{ color: "#888", fontSize: 11, fontFamily: "monospace" }}>{b?.san}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function formatTime(s) {
  if (s === null || s === undefined) return null;
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
}

function PlayerTag({ player, label, isMe, time, isActive }) {
  const t = formatTime(time);
  const isLow = time !== null && time <= 10;
  return (
    <div style={{
      flex: 1, background: isActive ? "#1e2a1e" : "#1e2130",
      borderRadius: 8, padding: "6px 10px",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      border: isActive ? "1px solid #3a6b3a" : "1px solid transparent",
      transition: "all 0.3s"
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 13 }}>{label}</span>
        {player?.photo
          ? <img src={player.photo} style={{ width: 20, height: 20, borderRadius: "50%" }} alt="" />
          : null}
        <span style={{
          color: isMe ? "#c9a84c" : "#ccc", fontSize: 12,
          fontWeight: isMe ? 700 : 400, maxWidth: 70,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
        }}>
          {player ? player.name + (isMe ? " ◀" : "") : "..."}
        </span>
      </div>
      {t && (
        <span style={{
          fontFamily: "monospace", fontSize: 13, fontWeight: 700,
          color: isLow ? "#ff4444" : isActive ? "#4CAF50" : "#666",
          animation: isLow && isActive ? "blink 0.5s infinite" : "none"
        }}>{t}</span>
      )}
      <style>{`@keyframes blink{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
    </div>
  );
}
