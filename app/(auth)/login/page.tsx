"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Moon, Mail, Lock, ArrowRight, AlertCircle } from "lucide-react";
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
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "1.5rem",
      position: "relative",
      zIndex: 1,
    }}>
      <div style={{
        width: "100%",
        maxWidth: "420px",
      }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: "2.5rem" }}>
          <img src="/logo.png" alt="AutoPost" style={{ width: "64px", height: "64px", borderRadius: "16px", objectFit: "cover", marginBottom: "1rem" }} />
          <h1 style={{
            fontSize: "1.75rem",
            fontWeight: 800,
            color: "#fff",
            letterSpacing: "-0.03em",
            marginBottom: "0.4rem",
          }}>
            <span style={{ color: "var(--accent-gold)" }}>Auto</span>Post
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>
            Acesse sua conta para continuar
          </p>
        </div>

        {/* Card */}
        <div style={{
          background: "rgba(12, 16, 24, 0.85)",
          backdropFilter: "blur(20px)",
          border: "1px solid rgba(201, 162, 39, 0.15)",
          borderRadius: "16px",
          padding: "2rem",
          boxShadow: "0 24px 64px rgba(0, 0, 0, 0.5)",
        }}>
          {error && (
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "0.6rem",
              padding: "0.85rem 1rem",
              borderRadius: "10px",
              background: "rgba(239, 68, 68, 0.08)",
              border: "1px solid rgba(239, 68, 68, 0.2)",
              marginBottom: "1.5rem",
            }}>
              <AlertCircle size={16} color="#f87171" />
              <p style={{ fontSize: "0.875rem", color: "#f87171" }}>{error}</p>
            </div>
          )}

          <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "1.2rem" }}>
            <div>
              <label style={{
                display: "block",
                fontSize: "0.8rem",
                fontWeight: 600,
                color: "var(--text-secondary)",
                marginBottom: "0.5rem",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}>
                Email
              </label>
              <div style={{ position: "relative" }}>
                <Mail size={16} color="var(--text-muted)" style={{
                  position: "absolute", left: "0.9rem", top: "50%", transform: "translateY(-50%)",
                }} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="seu@email.com"
                  style={{
                    width: "100%",
                    padding: "0.75rem 0.9rem 0.75rem 2.5rem",
                    background: "rgba(255, 255, 255, 0.04)",
                    border: "1px solid rgba(201, 162, 39, 0.15)",
                    borderRadius: "10px",
                    color: "#fff",
                    fontSize: "0.9rem",
                    outline: "none",
                    transition: "border-color 0.2s",
                  }}
                  onFocus={(e) => e.target.style.borderColor = "rgba(201, 162, 39, 0.45)"}
                  onBlur={(e) => e.target.style.borderColor = "rgba(201, 162, 39, 0.15)"}
                />
              </div>
            </div>

            <div>
              <label style={{
                display: "block",
                fontSize: "0.8rem",
                fontWeight: 600,
                color: "var(--text-secondary)",
                marginBottom: "0.5rem",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}>
                Senha
              </label>
              <div style={{ position: "relative" }}>
                <Lock size={16} color="var(--text-muted)" style={{
                  position: "absolute", left: "0.9rem", top: "50%", transform: "translateY(-50%)",
                }} />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  style={{
                    width: "100%",
                    padding: "0.75rem 0.9rem 0.75rem 2.5rem",
                    background: "rgba(255, 255, 255, 0.04)",
                    border: "1px solid rgba(201, 162, 39, 0.15)",
                    borderRadius: "10px",
                    color: "#fff",
                    fontSize: "0.9rem",
                    outline: "none",
                    transition: "border-color 0.2s",
                  }}
                  onFocus={(e) => e.target.style.borderColor = "rgba(201, 162, 39, 0.45)"}
                  onBlur={(e) => e.target.style.borderColor = "rgba(201, 162, 39, 0.15)"}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.5rem",
                padding: "0.85rem",
                background: loading
                  ? "rgba(201, 162, 39, 0.3)"
                  : "linear-gradient(135deg, #c9a227 0%, #a8851f 100%)",
                border: "none",
                borderRadius: "10px",
                color: loading ? "rgba(255,255,255,0.5)" : "#0a0c12",
                fontSize: "0.9rem",
                fontWeight: 700,
                cursor: loading ? "not-allowed" : "pointer",
                transition: "all 0.2s",
                marginTop: "0.4rem",
              }}
            >
              {loading ? "Entrando..." : (
                <>Entrar <ArrowRight size={16} /></>
              )}
            </button>
          </form>
        </div>

        <p style={{ textAlign: "center", marginTop: "1.5rem", color: "var(--text-secondary)", fontSize: "0.875rem" }}>
          Não tem conta?{" "}
          <Link href="/signup" style={{ color: "var(--accent-gold)", fontWeight: 600 }}>
            Criar conta
          </Link>
        </p>
      </div>
    </div>
  );
}
