"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertCircle, CheckCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [resetMode, setResetMode] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetError, setResetError] = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError("Email ou senha incorretos.");
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setResetLoading(true);
    setResetError("");

    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: `${window.location.origin}/api/auth/callback?next=/reset-password`,
    });

    if (error) {
      setResetError(error.message);
      setResetLoading(false);
      return;
    }

    setResetSent(true);
    setResetLoading(false);
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "11px 14px",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.09)",
    borderRadius: 10, color: "#ddd",
    fontSize: 13.5, fontFamily: "inherit",
    outline: "none", transition: "border-color 0.2s",
  };

  if (resetMode) {
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

            {resetSent ? (
              <div style={{ textAlign: "center", padding: "1rem 0" }}>
                <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 56, height: 56, borderRadius: "50%", background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)", marginBottom: 20 }}>
                  <CheckCircle size={26} color="#4ade80" />
                </div>
                <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>Email enviado!</h2>
                <p style={{ fontSize: 13.5, color: "#555", lineHeight: 1.6, marginBottom: 24 }}>
                  Verifique sua caixa de entrada em <strong style={{ color: "#ddd" }}>{resetEmail}</strong> e clique no link para redefinir sua senha.
                </p>
                <button
                  onClick={() => { setResetMode(false); setResetSent(false); setResetEmail(""); }}
                  style={{ fontSize: 13, color: "#FFD54F", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}
                >
                  ← Voltar ao login
                </button>
              </div>
            ) : (
              <>
                <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 6 }}>Redefinir senha</h1>
                <p style={{ fontSize: 13.5, color: "#555", marginBottom: 28 }}>Enviaremos um link para o seu email</p>

                {resetError && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 10, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", marginBottom: 20 }}>
                    <AlertCircle size={15} color="#ef4444" />
                    <p style={{ fontSize: 13, color: "#ef4444" }}>{resetError}</p>
                  </div>
                )}

                <form onSubmit={handleReset}>
                  <div style={{ marginBottom: 20 }}>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#555", letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 7 }}>Email</label>
                    <input
                      type="email"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      required
                      placeholder="seu@email.com"
                      style={inputStyle}
                      onFocus={(e) => e.target.style.borderColor = "rgba(255,213,79,0.4)"}
                      onBlur={(e) => e.target.style.borderColor = "rgba(255,255,255,0.09)"}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={resetLoading}
                    style={{
                      width: "100%", padding: "12px", borderRadius: 10, border: "none",
                      background: resetLoading ? "rgba(255,213,79,0.3)" : "linear-gradient(135deg,#FFD54F,#c9920a)",
                      color: "#000", fontSize: 14, fontWeight: 700, fontFamily: "inherit",
                      cursor: resetLoading ? "not-allowed" : "pointer", opacity: resetLoading ? 0.7 : 1,
                    }}
                  >
                    {resetLoading ? "Enviando..." : "Enviar link"}
                  </button>
                </form>

                <button
                  onClick={() => setResetMode(false)}
                  style={{ width: "100%", marginTop: 16, fontSize: 13, color: "#555", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}
                >
                  ← Voltar ao login
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

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

          <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 6 }}>Entrar</h1>
          <p style={{ fontSize: 13.5, color: "#555", marginBottom: 28 }}>Acesse sua conta para continuar</p>

          {error && (
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "10px 14px", borderRadius: 10,
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.2)",
              marginBottom: 20,
            }}>
              <AlertCircle size={15} color="#ef4444" />
              <p style={{ fontSize: 13, color: "#ef4444" }}>{error}</p>
            </div>
          )}

          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#555", letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 7 }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="seu@email.com"
                style={inputStyle}
                onFocus={(e) => e.target.style.borderColor = "rgba(255,213,79,0.4)"}
                onBlur={(e) => e.target.style.borderColor = "rgba(255,255,255,0.09)"}
              />
            </div>

            <div style={{ marginBottom: 4 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#555", letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 7 }}>
                Senha
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                style={inputStyle}
                onFocus={(e) => e.target.style.borderColor = "rgba(255,213,79,0.4)"}
                onBlur={(e) => e.target.style.borderColor = "rgba(255,255,255,0.09)"}
              />
            </div>

            <div style={{ textAlign: "right", marginBottom: 20, marginTop: 8 }}>
              <button
                type="button"
                onClick={() => { setResetMode(true); setResetEmail(email); }}
                style={{ fontSize: 12.5, color: "#FFD54F", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", opacity: 0.8 }}
              >
                Esqueci minha senha
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%", padding: "12px",
                borderRadius: 10, border: "none",
                background: loading ? "rgba(255,213,79,0.3)" : "linear-gradient(135deg,#FFD54F,#c9920a)",
                color: "#000",
                fontSize: 14, fontWeight: 700,
                fontFamily: "inherit",
                cursor: loading ? "not-allowed" : "pointer",
                transition: "opacity 0.15s",
                letterSpacing: "0.01em",
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? "Entrando..." : "Entrar"}
            </button>
          </form>
        </div>

        <p style={{ textAlign: "center", marginTop: 24, fontSize: 13, color: "#555" }}>
          Não tem conta?{" "}
          <Link href="/signup" style={{ color: "#FFD54F", fontWeight: 600 }}>
            Criar conta
          </Link>
        </p>
      </div>
    </div>
  );
}
