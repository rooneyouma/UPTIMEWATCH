"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import api from "@/providers/api";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await api.post("/token/", { username, password });
      if (res.data.access) {
        localStorage.setItem("access_token", res.data.access);
        localStorage.setItem("refresh_token", res.data.refresh);
        router.push("/dashboard");
      }
    } catch (err) {
      setError("Handshake failed. Invalid credentials.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#070b14", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Mono', monospace" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Syne:wght@700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        input::placeholder { color: #2d3748; }
      `}</style>
      <div style={{ background: "#0a0e1a", border: "1px solid #1a1f2e", borderRadius: "12px", padding: "48px", width: "100%", maxWidth: "420px" }}>
        <h1 style={{ fontSize: "28px", color: "#00ff88", fontFamily: "'Syne', sans-serif", marginBottom: "8px", textAlign: "center" }}>PULSECHECK</h1>
        <p style={{ fontSize: "11px", color: "#4a5568", textAlign: "center", marginBottom: "40px", letterSpacing: "0.15em" }}>CORE ENGINE ACCESS GATE</p>
        
        <input 
          type="text" 
          placeholder="ADMIN IDENTIFIER"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          style={{ 
            width: "100%", background: "transparent", border: "1px solid #1a1f2e", 
            color: "#e2e8f0", padding: "14px", borderRadius: "8px", marginBottom: "16px", 
            outline: "none", fontSize: "12px", letterSpacing: "0.05em", fontFamily: "'DM Mono', monospace" 
          }} 
        />
        <div style={{ position: "relative", width: "100%", marginBottom: "32px" }}>
          <input 
            type={showPassword ? "text" : "password"} 
            placeholder="SECURITY KEY"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            style={{ 
              width: "100%", background: "transparent", border: "1px solid #1a1f2e", 
              color: "#e2e8f0", padding: "14px 44px 14px 14px", borderRadius: "8px", 
              outline: "none", fontSize: "12px", letterSpacing: "0.05em", fontFamily: "'DM Mono', monospace" 
            }} 
          />
          <button
            type="button"
            onClick={() => setShowPassword(v => !v)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            style={{
              position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)",
              background: "none", border: "none", cursor: "pointer", padding: "4px",
              color: "#4a5568", display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            {showPassword ? (
              // eye-off
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.4 18.4 0 0 1 5.06-5.94"/><path d="M9.53 9.53A3 3 0 0 0 12 15a3 3 0 0 0 2.47-1.27"/><path d="M14.12 14.12A3 3 0 0 1 9.88 9.88"/><path d="M1 1l22 22"/><path d="M10.58 10.58A3 3 0 0 0 12 15"/></svg>
            ) : (
              // eye
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            )}
          </button>
        </div>
        
        {error && (
          <div style={{ color: "#ff3b5c", fontSize: "11px", marginBottom: "16px", textAlign: "center", letterSpacing: "0.05em" }}>
            {error}
          </div>
        )}

        <button 
          onClick={handleLogin}
          disabled={loading}
          style={{ 
            width: "100%", background: "#00ff88", color: "#070b14", border: "none", 
            padding: "14px", borderRadius: "8px", fontSize: "12px", fontWeight: "700", 
            cursor: loading ? "not-allowed" : "pointer", letterSpacing: "0.1em", fontFamily: "'DM Mono', monospace",
            transition: "opacity 0.2s", opacity: loading ? 0.5 : 1
          }}
          onMouseEnter={e => { if (!loading) e.currentTarget.style.opacity = 0.8 }}
          onMouseLeave={e => { if (!loading) e.currentTarget.style.opacity = 1 }}
        >
          {loading ? "AUTHENTICATING..." : "ENTER THE CORE"}
        </button>
      </div>
    </div>
  );
}
