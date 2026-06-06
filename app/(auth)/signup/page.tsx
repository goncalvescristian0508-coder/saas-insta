"use client";

import { useState } from "react";
import Link from "next/link";
import { Mail, Lock, User, ArrowRight, AlertCircle, CheckCircle } from "lucide-react";

const ICON_STYLE: React.CSSProperties = {
  position: "absolute", left: "0.85rem", top: "50%", transform: "translateY(-50%)",
};

export default function SignupPage() {
  const [name,     setName]     = useState("");
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");
  const [success,  setSuccess]  = useState(false);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res  = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name }),
      });
      let data: { error?: string } = {};
      try { data = await res.json() as { error?: string }; } catch { /* HTML error page */ }
      if (!res.ok) { setError(data.error ?? `Erro ao criar conta (${res.status})`); return; }
      setSuccess(true);
    } catch {
      setError("Erro de rede. Verifique sua conexão e tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "center",
        justifyContent: "center", padding: "1.5rem",
      }}>
        <div style={{ width: "100%", maxWidth: "380px", textAlign: "center" }}>
          <div style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 52, height: 52, borderRadius: "50%",
            background: "rgba(34,197,94,0.08)",
            border: "1px solid rgba(34,197,94,0.2)",
            marginBottom: "1.5rem",
          }}>
            <CheckCircle size={24} color="#22C55E" strokeWidth={1.75} />
          </div>
          <h2 style={{ fontSize: "1.3rem", fontWeight: 600, marginBottom: "0.75rem", color: "#F4F4F5", letterSpacing: "-0.02em" }}>
            Cadastro enviado!
          </h2>
          <p style={{ color: "#71717A", marginBottom: "1.5rem", lineHeight: 1.65, fontSize: "0.9rem" }}>
            Sua conta foi criada. Aguarde a <strong style={{ color: "#A1A1AA", fontWeight: 500 }}>aprovação do administrador</strong> para acessar a plataforma.
          </p>
          <Link href="/login" style={{
            display: "inline-flex", alignItems: "center", gap: "0.5rem",
            padding: "8px 18px",
            background: "transparent",
            border: "1px solid rgba(255,255,255,0.09)",
            borderRadius: "8px",
            color: "#A1A1AA", fontWeight: 400, fontSize: "0.875rem",
          }}>
            Ir para o login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center",
      justifyContent: "center", padding: "1.5rem",
    }}>
      <div style={{ width: "100%", maxWidth: "400px" }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <div style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 44, height: 44, borderRadius: 12, overflow: "hidden", marginBottom: "1rem",
          }}>
            <img src="/logo.png" alt="AutoPost" style={{ width: 44, height: 44, objectFit: "cover" }} />
          </div>
          <h1 style={{ fontSize: "1.4rem", fontWeight: 600, color: "#F4F4F5", letterSpacing: "-0.025em", marginBottom: "0.35rem" }}>
            Criar conta
          </h1>
          <p style={{ color: "#71717A", fontSize: "0.875rem" }}>Comece a automatizar seus posts</p>
        </div>

        <div style={{
          background: "#18181B",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 14, padding: "28px 28px 32px",
        }}>
          {error && (
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "9px 13px", borderRadius: 8,
              background: "rgba(239,68,68,0.07)",
              border: "1px solid rgba(239,68,68,0.18)",
              marginBottom: 18,
            }}>
              <AlertCircle size={14} color="#EF4444" />
              <p style={{ fontSize: 13, color: "#EF4444" }}>{error}</p>
            </div>
          )}

          <form onSubmit={handleSignup} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Field label="Nome">
              <User size={14} color="#52525B" strokeWidth={1.75} style={ICON_STYLE} />
              <input
                type="text" value={name} onChange={(e) => setName(e.target.value)}
                required placeholder="Seu nome"
                autoComplete="name"
                className="auth-input with-icon"
              />
            </Field>

            <Field label="Email">
              <Mail size={14} color="#52525B" strokeWidth={1.75} style={ICON_STYLE} />
              <input
                type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                required placeholder="seu@email.com"
                autoComplete="email"
                className="auth-input with-icon"
              />
            </Field>

            <Field label="Senha">
              <Lock size={14} color="#52525B" strokeWidth={1.75} style={ICON_STYLE} />
              <input
                type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                required minLength={6} placeholder="Mínimo 6 caracteres"
                autoComplete="new-password"
                className="auth-input with-icon"
              />
            </Field>

            <button
              type="submit"
              disabled={loading}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                padding: "10px",
                background: loading ? "rgba(79,131,247,0.4)" : "#4F83F7",
                border: "none", borderRadius: 8,
                color: "#fff", fontSize: "0.9rem", fontWeight: 500,
                cursor: loading ? "not-allowed" : "pointer",
                fontFamily: "inherit", marginTop: 4,
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? "Criando conta..." : <><span>Criar conta</span><ArrowRight size={15} /></>}
            </button>
          </form>
        </div>

        <p style={{ textAlign: "center", marginTop: "1.25rem", color: "#52525B", fontSize: "0.875rem" }}>
          Já tem conta?{" "}
          <Link href="/login" style={{ color: "#A1A1AA", fontWeight: 400 }}
            onMouseEnter={(e: React.MouseEvent<HTMLAnchorElement>) => { e.currentTarget.style.color = "#F4F4F5"; }}
            onMouseLeave={(e: React.MouseEvent<HTMLAnchorElement>) => { e.currentTarget.style.color = "#A1A1AA"; }}
          >
            Entrar
          </Link>
        </p>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#71717A", marginBottom: 6 }}>
        {label}
      </label>
      <div style={{ position: "relative" }}>{children}</div>
    </div>
  );
}
