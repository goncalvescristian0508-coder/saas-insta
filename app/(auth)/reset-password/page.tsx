"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle, Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Supabase sets the session from the URL hash after the reset link is clicked
    const supabase = createClient();
    supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setError("As senhas não coincidem."); return; }
    if (password.length < 6) { setError("A senha deve ter no mínimo 6 caracteres."); return; }

    setLoading(true);
    setError("");

    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setDone(true);
    setTimeout(() => router.push("/"), 2000);
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "11px 14px",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.09)",
    borderRadius: 10, color: "#ddd",
    fontSize: 13.5, fontFamily: "inherit",
    outline: "none", transition: "border-color 0.2s",
  };

  return (
    <div style={{
      position: "relative", zIndex: 1,
      display: "flex", alignItems: "center", justifyContent: "center",
      minHeight: "100vh", padding: "24px",
    }}>
      <div style={{ width: "100%", maxWidth: "420px" }}>
        <div style={{
          background: "#111",
          border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: "20px",
          padding: "40px 40px 44px",
          boxShadow: "0 32px 80px rgba(0,0,0,0.6)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 32 }}>
            <img src="/logo.png" alt="AutoPost" style={{ width: 36, height: 36, borderRadius: 9, objectFit: "cover" }} />
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1 }}>
                Auto<span style={{ color: "#FFD54F" }}>Post</span>
              </div>
              <div style={{ fontSize: 11, color: "#444", letterSpacing: "0.07em", textTransform: "uppercase", marginTop: 3 }}>
                Automação Instagram
              </div>
            </div>
          </div>

          {done ? (
            <div style={{ textAlign: "center", padding: "1rem 0" }}>
              <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 56, height: 56, borderRadius: "50%", background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)", marginBottom: 20 }}>
                <CheckCircle size={26} color="#4ade80" />
              </div>
              <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>Senha redefinida!</h2>
              <p style={{ fontSize: 13.5, color: "#555" }}>Redirecionando para o painel...</p>
            </div>
          ) : (
            <>
              <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 48, height: 48, borderRadius: "50%", background: "rgba(255,213,79,0.08)", border: "1px solid rgba(255,213,79,0.2)", marginBottom: 20 }}>
                <Lock size={22} color="#FFD54F" />
              </div>
              <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 6 }}>Nova senha</h1>
              <p style={{ fontSize: 13.5, color: "#555", marginBottom: 28 }}>Digite e confirme sua nova senha</p>

              {error && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 10, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", marginBottom: 20 }}>
                  <AlertCircle size={15} color="#ef4444" />
                  <p style={{ fontSize: 13, color: "#ef4444" }}>{error}</p>
                </div>
              )}

              <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#555", letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 7 }}>Nova senha</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    placeholder="Mínimo 6 caracteres"
                    style={inputStyle}
                    onFocus={(e) => e.target.style.borderColor = "rgba(255,213,79,0.4)"}
                    onBlur={(e) => e.target.style.borderColor = "rgba(255,255,255,0.09)"}
                  />
                </div>
                <div style={{ marginBottom: 24 }}>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#555", letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 7 }}>Confirmar senha</label>
                  <input
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    placeholder="Repita a senha"
                    style={inputStyle}
                    onFocus={(e) => e.target.style.borderColor = "rgba(255,213,79,0.4)"}
                    onBlur={(e) => e.target.style.borderColor = "rgba(255,255,255,0.09)"}
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading || !ready}
                  style={{
                    width: "100%", padding: "12px", borderRadius: 10, border: "none",
                    background: (loading || !ready) ? "rgba(255,213,79,0.3)" : "linear-gradient(135deg,#FFD54F,#c9920a)",
                    color: "#000", fontSize: 14, fontWeight: 700, fontFamily: "inherit",
                    cursor: (loading || !ready) ? "not-allowed" : "pointer", opacity: (loading || !ready) ? 0.7 : 1,
                  }}
                >
                  {loading ? "Salvando..." : !ready ? "Aguardando sessão..." : "Salvar nova senha"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
