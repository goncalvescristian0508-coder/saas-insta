"use client";

import { useState } from "react";
import Link from "next/link";
import { Moon, Mail, Lock, User, ArrowRight, AlertCircle, CheckCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name },
        emailRedirectTo: `${window.location.origin}/api/auth/callback`,
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);
  }

  if (success) {
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
        <div style={{ width: "100%", maxWidth: "420px", textAlign: "center" }}>
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "64px",
            height: "64px",
            borderRadius: "50%",
            background: "rgba(34, 197, 94, 0.1)",
            border: "1px solid rgba(34, 197, 94, 0.25)",
            marginBottom: "1.5rem",
          }}>
            <CheckCircle size={30} color="#4ade80" />
          </div>
          <h2 style={{ fontSize: "1.4rem", fontWeight: 700, marginBottom: "0.75rem" }}>
            Conta criada!
          </h2>
          <p style={{ color: "var(--text-secondary)", marginBottom: "1.5rem", lineHeight: 1.6 }}>
            Enviamos um link de confirmação para <strong style={{ color: "#fff" }}>{email}</strong>.
            Verifique sua caixa de entrada.
          </p>
          <Link href="/login" style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.75rem 1.5rem",
            background: "rgba(201, 162, 39, 0.12)",
            border: "1px solid rgba(201, 162, 39, 0.25)",
            borderRadius: "10px",
            color: "var(--accent-gold)",
            fontWeight: 600,
            fontSize: "0.9rem",
          }}>
            Ir para o login
          </Link>
        </div>
      </div>
    );
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
      <div style={{ width: "100%", maxWidth: "420px" }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: "2.5rem" }}>
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "56px",
            height: "56px",
            borderRadius: "16px",
            marginBottom: "1rem",
            overflow: "hidden",
          }}>
            <img src="/logo.png" alt="AutoPost" style={{ width: "56px", height: "56px", objectFit: "cover" }} />
          </div>
          <h1 style={{
            fontSize: "1.75rem",
            fontWeight: 800,
            color: "#fff",
            letterSpacing: "-0.03em",
            marginBottom: "0.4rem",
          }}>
            Criar conta
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>
            Comece a automatizar seus posts
          </p>
        </div>

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

          <form onSubmit={handleSignup} style={{ display: "flex", flexDirection: "column", gap: "1.2rem" }}>
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
                Nome
              </label>
              <div style={{ position: "relative" }}>
                <User size={16} color="var(--text-muted)" style={{
                  position: "absolute", left: "0.9rem", top: "50%", transform: "translateY(-50%)",
                }} />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder="Seu nome"
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
                  minLength={6}
                  placeholder="Mínimo 6 caracteres"
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
              {loading ? "Criando conta..." : (
                <>Criar conta <ArrowRight size={16} /></>
              )}
            </button>
          </form>
        </div>

        <p style={{ textAlign: "center", marginTop: "1.5rem", color: "var(--text-secondary)", fontSize: "0.875rem" }}>
          Já tem conta?{" "}
          <Link href="/login" style={{ color: "var(--accent-gold)", fontWeight: 600 }}>
            Entrar
          </Link>
        </p>
      </div>
    </div>
  );
}
