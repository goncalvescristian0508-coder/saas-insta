"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
          {/* Logo */}
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
              <label style={{
                display: "block", fontSize: 12, fontWeight: 600,
                color: "#555", letterSpacing: "0.05em", textTransform: "uppercase",
                marginBottom: 7,
              }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="seu@email.com"
                style={{
                  width: "100%", padding: "11px 14px",
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.09)",
                  borderRadius: 10, color: "#ddd",
                  fontSize: 13.5, fontFamily: "inherit",
                  outline: "none", transition: "border-color 0.2s",
                }}
                onFocus={(e) => e.target.style.borderColor = "rgba(255,213,79,0.4)"}
                onBlur={(e) => e.target.style.borderColor = "rgba(255,255,255,0.09)"}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{
                display: "block", fontSize: 12, fontWeight: 600,
                color: "#555", letterSpacing: "0.05em", textTransform: "uppercase",
                marginBottom: 7,
              }}>
                Senha
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                style={{
                  width: "100%", padding: "11px 14px",
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.09)",
                  borderRadius: 10, color: "#ddd",
                  fontSize: 13.5, fontFamily: "inherit",
                  outline: "none", transition: "border-color 0.2s",
                }}
                onFocus={(e) => e.target.style.borderColor = "rgba(255,213,79,0.4)"}
                onBlur={(e) => e.target.style.borderColor = "rgba(255,255,255,0.09)"}
              />
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
                marginTop: 8, transition: "opacity 0.15s",
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
