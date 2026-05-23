"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle, Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const INPUT: React.CSSProperties = {
  width: "100%", padding: "10px 13px",
  background: "#18181B",
  border: "1px solid rgba(255,255,255,0.09)",
  borderRadius: 8, color: "#F4F4F5",
  fontSize: 13.5, fontFamily: "inherit",
  outline: "none", transition: "border-color 0.15s",
};

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm,  setConfirm]  = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");
  const [done,     setDone]     = useState(false);
  const [ready,    setReady]    = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setError("As senhas não coincidem."); return; }
    if (password.length < 6)  { setError("A senha deve ter no mínimo 6 caracteres."); return; }
    setLoading(true);
    setError("");
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) { setError(error.message); setLoading(false); return; }
    setDone(true);
    setTimeout(() => router.push("/"), 2000);
  }

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      minHeight: "100vh", padding: "24px",
    }}>
      <div style={{ width: "100%", maxWidth: "400px" }}>
        <div style={{
          background: "#18181B",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 14,
          padding: "36px 36px 40px",
        }}>
          {/* Logo */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 28 }}>
            <img src="/logo.png" alt="AutoPost" style={{ width: 30, height: 30, borderRadius: 8, objectFit: "cover" }} />
            <span style={{ fontSize: 16, fontWeight: 600, color: "#F4F4F5", letterSpacing: "-0.02em" }}>AutoPost</span>
          </div>

          {done ? (
            <div style={{ textAlign: "center", padding: "8px 0" }}>
              <div style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                width: 48, height: 48, borderRadius: "50%",
                background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)",
                marginBottom: 18,
              }}>
                <CheckCircle size={22} color="#22C55E" strokeWidth={1.75} />
              </div>
              <h2 style={{ fontSize: 17, fontWeight: 600, marginBottom: 10, color: "#F4F4F5" }}>Senha redefinida!</h2>
              <p style={{ fontSize: 13.5, color: "#71717A" }}>Redirecionando para o painel...</p>
            </div>
          ) : (
            <>
              <div style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                width: 40, height: 40, borderRadius: "50%",
                background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
                marginBottom: 18,
              }}>
                <Lock size={18} color="#A1A1AA" strokeWidth={1.75} />
              </div>
              <h1 style={{ fontSize: 19, fontWeight: 600, letterSpacing: "-0.02em", marginBottom: 6, color: "#F4F4F5" }}>
                Nova senha
              </h1>
              <p style={{ fontSize: 13.5, color: "#71717A", marginBottom: 24 }}>
                Digite e confirme sua nova senha
              </p>

              {error && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "9px 13px", borderRadius: 8,
                  background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.18)",
                  marginBottom: 18,
                }}>
                  <AlertCircle size={14} color="#EF4444" />
                  <p style={{ fontSize: 13, color: "#EF4444" }}>{error}</p>
                </div>
              )}

              <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#71717A", marginBottom: 6 }}>
                    Nova senha
                  </label>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                    required minLength={6} placeholder="Mínimo 6 caracteres" style={INPUT}
                    onFocus={(e) => { e.target.style.borderColor = "rgba(255,255,255,0.2)"; }}
                    onBlur={(e)  => { e.target.style.borderColor = "rgba(255,255,255,0.09)"; }}
                  />
                </div>
                <div style={{ marginBottom: 22 }}>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#71717A", marginBottom: 6 }}>
                    Confirmar senha
                  </label>
                  <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
                    required placeholder="Repita a senha" style={INPUT}
                    onFocus={(e) => { e.target.style.borderColor = "rgba(255,255,255,0.2)"; }}
                    onBlur={(e)  => { e.target.style.borderColor = "rgba(255,255,255,0.09)"; }}
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading || !ready}
                  style={{
                    width: "100%", padding: "10px", borderRadius: 8, border: "none",
                    background: (loading || !ready) ? "rgba(79,131,247,0.4)" : "#4F83F7",
                    color: "#fff", fontSize: 13.5, fontWeight: 500,
                    fontFamily: "inherit",
                    cursor: (loading || !ready) ? "not-allowed" : "pointer",
                    opacity: (loading || !ready) ? 0.7 : 1,
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
