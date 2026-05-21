import { useState } from "react";
import { useAuth } from "./AuthContext";
import LoginScreen from "./LoginScreen";
import Home from "./Home";
import Room from "./Room";
import Friends from "./Friends";

export default function App() {
  const { user } = useAuth();
  const [session, setSession] = useState(null); // { roomCode, playerId, playerName }
  const [page, setPage] = useState("home"); // home | friends

  // Loading
  if (user === undefined) return (
    <div style={{
      minHeight: "100vh", background: "#0f1117",
      display: "flex", alignItems: "center", justifyContent: "center"
    }}>
      <div style={{ fontSize: 48 }}>♟️</div>
    </div>
  );

  // Not logged in
  if (!user) return <LoginScreen />;

  // In a game
  if (session) return (
    <Room
      roomCode={session.roomCode}
      playerId={session.playerId}
      playerName={session.playerName}
      onGoHome={() => setSession(null)}
    />
  );

  const handleJoin = (roomCode, playerId, playerName) => {
    setPage("home");
    setSession({ roomCode, playerId, playerName });
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0f1117", display: "flex", flexDirection: "column" }}>
      {/* Nav */}
      <div style={{
        display: "flex", background: "#13151f",
        borderBottom: "1px solid #1e2130",
        maxWidth: 480, margin: "0 auto", width: "100%"
      }}>
        {[["home", "🏠 الرئيسية"], ["friends", "👥 الأصحاب"]].map(([p, label]) => (
          <button key={p} onClick={() => setPage(p)} style={{
            flex: 1, padding: "13px", border: "none",
            background: page === p ? "#1e2130" : "transparent",
            color: page === p ? "#e8d5a3" : "#666",
            cursor: "pointer", fontSize: 13,
            fontFamily: "'Cairo', sans-serif", fontWeight: page === p ? 700 : 400,
            borderBottom: page === p ? "2px solid #c9a84c" : "2px solid transparent"
          }}>{label}</button>
        ))}
      </div>

      {page === "home" && <Home onJoin={handleJoin} />}
      {page === "friends" && <Friends user={user} onStartGame={handleJoin} />}
    </div>
  );
}
