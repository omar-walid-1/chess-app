import { useState, useEffect } from "react";
import { db } from "./firebase";
import { ref, onValue, set, update, remove, push, get } from "firebase/database";

export default function Friends({ user, onStartGame }) {
  const [friends, setFriends] = useState([]);
  const [requests, setRequests] = useState([]); // incoming
  const [searchEmail, setSearchEmail] = useState("");
  const [searchResult, setSearchResult] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [matchHistory, setMatchHistory] = useState([]);
  const [tab, setTab] = useState("friends"); // friends | history

  // Load friends
  useEffect(() => {
    const unsub = onValue(ref(db, `users/${user.uid}/friends`), snap => {
      if (!snap.exists()) { setFriends([]); return; }
      const arr = Object.entries(snap.val()).map(([uid, data]) => ({ uid, ...data }));
      setFriends(arr);
    });
    return () => unsub();
  }, [user.uid]);

  // Load incoming friend requests
  useEffect(() => {
    const unsub = onValue(ref(db, `friendRequests/${user.uid}`), snap => {
      if (!snap.exists()) { setRequests([]); return; }
      const arr = Object.entries(snap.val())
        .filter(([, d]) => d.status === "pending")
        .map(([fromUid, d]) => ({ fromUid, ...d }));
      setRequests(arr);
    });
    return () => unsub();
  }, [user.uid]);

  // Load match history
  useEffect(() => {
    const unsub = onValue(ref(db, `users/${user.uid}/matchHistory`), snap => {
      if (!snap.exists()) { setMatchHistory([]); return; }
      const arr = Object.entries(snap.val())
        .map(([id, m]) => ({ id, ...m }))
        .sort((a, b) => b.playedAt - a.playedAt)
        .slice(0, 20);
      setMatchHistory(arr);
    });
    return () => unsub();
  }, [user.uid]);

  async function searchUser() {
    setSearchError(""); setSearchResult(null);
    if (!searchEmail.trim()) return;
    setSearchLoading(true);
    // Search by email in users
    const snap = await get(ref(db, "users"));
    if (snap.exists()) {
      const all = Object.entries(snap.val());
      const found = all.find(([uid, u]) =>
        u.email?.toLowerCase() === searchEmail.trim().toLowerCase() && uid !== user.uid
      );
      if (found) {
        const [uid, data] = found;
        // Check if already friends
        const already = friends.some(f => f.uid === uid);
        setSearchResult({ uid, ...data, already });
      } else {
        setSearchError("مش لاقيه! تأكد من الـ email");
      }
    }
    setSearchLoading(false);
  }

  async function sendFriendRequest(toUid, toName, toPhoto) {
    await set(ref(db, `friendRequests/${toUid}/${user.uid}`), {
      fromUid: user.uid,
      fromName: user.displayName,
      fromPhoto: user.photoURL,
      status: "pending",
      sentAt: Date.now()
    });
    setSearchResult(null);
    setSearchEmail("");
    alert(`اتبعت طلب صداقة لـ ${toName}! ✅`);
  }

  async function acceptRequest(fromUid, fromName, fromPhoto) {
    // Add to both sides
    await set(ref(db, `users/${user.uid}/friends/${fromUid}`), {
      name: fromName, photo: fromPhoto, addedAt: Date.now()
    });
    await set(ref(db, `users/${fromUid}/friends/${user.uid}`), {
      name: user.displayName, photo: user.photoURL, addedAt: Date.now()
    });
    // Remove request
    await remove(ref(db, `friendRequests/${user.uid}/${fromUid}`));
  }

  async function declineRequest(fromUid) {
    await remove(ref(db, `friendRequests/${user.uid}/${fromUid}`));
  }

  async function removeFriend(uid) {
    if (!confirm("تمسح الصديق ده؟")) return;
    await remove(ref(db, `users/${user.uid}/friends/${uid}`));
    await remove(ref(db, `users/${uid}/friends/${user.uid}`));
  }

  async function challengeFriend(friend) {
    // Create room and invite
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    await set(ref(db, `rooms/${code}`), {
      created: Date.now(),
      status: "waiting",
      createdBy: user.uid,
      players: {
        [user.uid]: { name: user.displayName, color: "white", joinedAt: Date.now(), photo: user.photoURL }
      },
      game: {
        fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        turn: "w", status: "waiting"
      }
    });
    // Send challenge notification
    await push(ref(db, `users/${friend.uid}/challenges`), {
      fromUid: user.uid,
      fromName: user.displayName,
      roomCode: code,
      sentAt: Date.now()
    });
    onStartGame(code, user.uid, user.displayName);
  }

  function resultLabel(m) {
    if (m.result === "draw") return { text: "تعادل", color: "#888" };
    if (m.winner === user.uid) return { text: "فزت 🏆", color: "#4CAF50" };
    return { text: "خسرت", color: "#ff6b6b" };
  }

  return (
    <div style={{
      minHeight: "100vh", background: "#0f1117",
      fontFamily: "'Cairo', sans-serif", direction: "rtl",
      maxWidth: 480, margin: "0 auto", display: "flex", flexDirection: "column"
    }}>
      {/* Tabs */}
      <div style={{ display: "flex", background: "#13151f", borderBottom: "1px solid #1e2130" }}>
        {[["friends", `👥 الأصحاب (${friends.length})`], ["history", "📜 السجل"]].map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} style={{
            flex: 1, padding: "13px", border: "none",
            background: tab === t ? "#1e2130" : "transparent",
            color: tab === t ? "#e8d5a3" : "#666",
            cursor: "pointer", fontSize: 13,
            fontFamily: "'Cairo', sans-serif", fontWeight: tab === t ? 700 : 400,
            borderBottom: tab === t ? "2px solid #c9a84c" : "2px solid transparent"
          }}>{label}</button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "16px 14px" }}>
        {tab === "friends" && (
          <>
            {/* Search */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ color: "#888", fontSize: 12, display: "block", marginBottom: 6 }}>
                🔍 ابحث عن صاحب بالـ Email
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  value={searchEmail}
                  onChange={e => setSearchEmail(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && searchUser()}
                  placeholder="example@gmail.com"
                  style={{
                    flex: 1, padding: "10px 14px", borderRadius: 12,
                    border: "1px solid #2d3044", background: "#1e2130",
                    color: "#fff", fontSize: 13, outline: "none",
                    fontFamily: "'Cairo', sans-serif", direction: "ltr"
                  }}
                />
                <button onClick={searchUser} disabled={searchLoading} style={{
                  padding: "10px 16px", borderRadius: 12,
                  background: "#c9a84c", border: "none",
                  color: "#1a1d27", fontWeight: 700, cursor: "pointer",
                  fontFamily: "'Cairo', sans-serif", fontSize: 13
                }}>{searchLoading ? "..." : "بحث"}</button>
              </div>
              {searchError && <p style={{ color: "#ff6b6b", fontSize: 12, marginTop: 6 }}>{searchError}</p>}
              {searchResult && (
                <div style={{
                  marginTop: 10, background: "#1e2130", borderRadius: 12,
                  padding: "12px 14px", display: "flex", alignItems: "center",
                  justifyContent: "space-between", gap: 10
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Avatar photo={searchResult.photo} name={searchResult.name} size={36} />
                    <div>
                      <div style={{ color: "#e8d5a3", fontSize: 14, fontWeight: 700 }}>{searchResult.name}</div>
                      <div style={{ color: "#555", fontSize: 11 }}>{searchResult.email}</div>
                    </div>
                  </div>
                  {searchResult.already
                    ? <span style={{ color: "#4CAF50", fontSize: 12 }}>✅ صديق</span>
                    : <button onClick={() => sendFriendRequest(searchResult.uid, searchResult.name, searchResult.photo)} style={{
                        padding: "7px 14px", borderRadius: 10,
                        background: "linear-gradient(135deg,#c9a84c,#e8d5a3)",
                        border: "none", color: "#1a1d27",
                        fontSize: 12, fontWeight: 700, cursor: "pointer",
                        fontFamily: "'Cairo', sans-serif"
                      }}>+ إضافة</button>
                  }
                </div>
              )}
            </div>

            {/* Incoming requests */}
            {requests.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ color: "#c9a84c", fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
                  🔔 طلبات صداقة ({requests.length})
                </div>
                {requests.map(r => (
                  <div key={r.fromUid} style={{
                    background: "#1a2a1a", border: "1px solid #2a4a2a",
                    borderRadius: 12, padding: "12px 14px",
                    display: "flex", alignItems: "center",
                    justifyContent: "space-between", marginBottom: 8
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <Avatar photo={r.fromPhoto} name={r.fromName} size={36} />
                      <span style={{ color: "#e8d5a3", fontSize: 13 }}>{r.fromName}</span>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => acceptRequest(r.fromUid, r.fromName, r.fromPhoto)} style={{
                        padding: "6px 12px", borderRadius: 8,
                        background: "#4CAF50", border: "none",
                        color: "#fff", fontSize: 12, cursor: "pointer"
                      }}>✓ قبول</button>
                      <button onClick={() => declineRequest(r.fromUid)} style={{
                        padding: "6px 12px", borderRadius: 8,
                        background: "#2d3044", border: "none",
                        color: "#888", fontSize: 12, cursor: "pointer"
                      }}>✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Friends list */}
            <div>
              <div style={{ color: "#666", fontSize: 12, marginBottom: 10 }}>
                {friends.length === 0 ? "مفيش أصحاب لسه، ابحث وضيف!" : `${friends.length} صاحب`}
              </div>
              {friends.map(f => (
                <div key={f.uid} style={{
                  background: "#1e2130", borderRadius: 12,
                  padding: "12px 14px", display: "flex",
                  alignItems: "center", justifyContent: "space-between",
                  marginBottom: 8, gap: 10
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Avatar photo={f.photo} name={f.name} size={40} />
                    <div>
                      <div style={{ color: "#e8d5a3", fontSize: 14, fontWeight: 700 }}>{f.name}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => challengeFriend(f)} style={{
                      padding: "8px 14px", borderRadius: 10,
                      background: "linear-gradient(135deg,#c9a84c,#e8d5a3)",
                      border: "none", color: "#1a1d27",
                      fontSize: 12, fontWeight: 700, cursor: "pointer",
                      fontFamily: "'Cairo', sans-serif"
                    }}>♟ تحدي</button>
                    <button onClick={() => removeFriend(f.uid)} style={{
                      padding: "8px 10px", borderRadius: 10,
                      background: "#2d3044", border: "none",
                      color: "#ff6b6b", fontSize: 12, cursor: "pointer"
                    }}>🗑</button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {tab === "history" && (
          <div>
            {matchHistory.length === 0 && (
              <div style={{ textAlign: "center", color: "#444", marginTop: 40, fontSize: 14 }}>
                مفيش مباريات لسه! ابدأ العب 🎮
              </div>
            )}
            {matchHistory.map(m => {
              const res = resultLabel(m);
              return (
                <div key={m.id} style={{
                  background: "#1e2130", borderRadius: 12,
                  padding: "14px 16px", marginBottom: 10,
                  display: "flex", alignItems: "center", justifyContent: "space-between"
                }}>
                  <div>
                    <div style={{ color: "#e8d5a3", fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
                      ضد {m.opponentName}
                    </div>
                    <div style={{ color: "#555", fontSize: 11 }}>
                      {new Date(m.playedAt).toLocaleDateString("ar", {
                        day: "numeric", month: "short", year: "numeric"
                      })}
                      {m.timerMins ? ` · ${m.timerMins} دقيقة` : " · بلا وقت"}
                    </div>
                  </div>
                  <div style={{
                    color: res.color, fontSize: 14, fontWeight: 700,
                    background: res.color + "22", padding: "4px 12px",
                    borderRadius: 8
                  }}>{res.text}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Avatar({ photo, name, size = 36 }) {
  return photo
    ? <img src={photo} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover" }} alt={name} />
    : <div style={{
        width: size, height: size, borderRadius: "50%",
        background: "#c9a84c", display: "flex", alignItems: "center",
        justifyContent: "center", fontSize: size * 0.4, fontWeight: 700, color: "#1a1d27"
      }}>{name?.charAt(0)}</div>;
}
