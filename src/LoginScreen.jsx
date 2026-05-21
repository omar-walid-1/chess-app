import { useAuth } from "./AuthContext";

export default function LoginScreen() {
  const { login } = useAuth();

  return (
    <div style={{
      minHeight: "100vh", background: "#0f1117",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'Cairo', sans-serif", direction: "rtl", padding: 20
    }}>
      <div style={{
        background: "#1a1d27", borderRadius: 24, padding: "52px 40px",
        width: "100%", maxWidth: 380, textAlign: "center",
        boxShadow: "0 8px 64px #000a"
      }}>
        <div style={{ fontSize: 64, marginBottom: 12 }}>♟️</div>
        <h1 style={{ color: "#e8d5a3", fontSize: 26, margin: "0 0 8px", fontWeight: 800 }}>
          Chess مع صحابك
        </h1>
        <p style={{ color: "#555", fontSize: 14, marginBottom: 40, lineHeight: 1.6 }}>
          العب شطرنج، تكلم، وتحدى صحابك
        </p>

        <button onClick={login} style={{
          width: "100%", padding: "14px 20px", borderRadius: 14,
          background: "#fff", border: "none", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
          fontSize: 15, fontWeight: 700, fontFamily: "'Cairo', sans-serif",
          color: "#1a1a1a", boxShadow: "0 2px 12px #0004",
          transition: "transform 0.15s, box-shadow 0.15s"
        }}
          onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 4px 20px #0006"; }}
          onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = "0 2px 12px #0004"; }}
        >
          <GoogleIcon />
          دخول بـ Google
        </button>

        <p style={{ color: "#333", fontSize: 11, marginTop: 24 }}>
          بياناتك محفوظة عندك بس ومش بتتباع لحد 🔒
        </p>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48">
      <path fill="#FFC107" d="M43.6 20H24v8h11.3C33.6 33.1 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 19.7-8 19.7-20 0-1.3-.1-2.7-.1-4z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 16 19 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4c-7.5 0-14 4.1-17.7 10.7z"/>
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-1.9 13.5-5l-6.2-5.2C29.4 35.6 26.8 36.5 24 36.5c-5.2 0-9.6-3.5-11.2-8.2l-6.5 5C9.7 39.6 16.4 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20H24v8h11.3c-.8 2.3-2.3 4.3-4.3 5.8l6.2 5.2C41 35.4 44 30.1 44 24c0-1.3-.1-2.7-.4-4z"/>
    </svg>
  );
}
