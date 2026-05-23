"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertCircle, CheckCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const INPUT: React.CSSProperties = {
  width: "100%", padding: "10px 13px",
  background: "#18181B",
  border: "1px solid rgba(255,255,255,0.09)",
  borderRadius: 8, color: "#F4F4F5",
  fontSize: 13.5, fontFamily: "inherit",
  outline: "none", transition: "border-color 0.15s",
};
const INPUT_FOCUS = "rgba(255,255,255,0.22)";
const INPUT_BLUR  = "rgba(255,255,255,0.09)";

export default function LoginPage() {
  const router = useRouter();
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");

  const [resetMode,    setResetMode]    = useState(false);
  const [resetEmail,   setResetEmail]   = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSent,    setResetSent]    = useState(false);
  const [resetError,   setResetError]   = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setError("Email ou senha incorretos."); setLoading(false); return; }
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
    if (error) { setResetError(error.message); setResetLoading(false); return; }
    setResetSent(true);
    setResetLoading(false);
  }

  const Card = ({ children }: { children: React.ReactNode }) => (
    <div style={{
      background: "#18181B",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 14,
      padding: "36px 36px 40px",
    }}>
      {children}
    </div>
  );

  const Logo = () => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 28 }}>
      <img src="/logo.png" alt="AutoPost" style={{ width: 30, height: 30, borderRadius: 8, objectFit: "cover" }} />
      <span style={{ fontSize: 16, fontWeight: 600, color: "#F4F4F5", letterSpacing: "-0.02em" }}>AutoPost</span>
    </div>
  );

  const FieldLabel = ({ children }: { children: React.ReactNode }) => (
    <label style={{
      display: "block", fontSize: 12, fontWeight: 500,
      color: "#71717A", marginBottom: 6,
    }}>
      {children}
    </label>
  );

  const PrimaryBtn = ({ disabled, children }: { disabled: boolean; children: React.ReactNode }) => (
    <button
      type="submit"
      disabled={disabled}
      style={{
        width: "100%", padding: "10px",
        borderRadius: 8, border: "none",
        background: disabled ? "rgba(79,131,247,0.4)" : "#4F83F7",
        color: "#fff",
        fontSize: 13.5, fontWeight: 500,
        fontFamily: "inherit",
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "opacity 0.15s",
        opacity: disabled ? 0.7 : 1,
      }}
    >
      {children}
    </button>
  );

  if (resetMode) {
    return (
      <Wrapper>
        <Card>
          <Logo />
          {resetSent ? (
            <div style={{ textAlign: "center", padding: "8px 0" }}>
              <div style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                width: 48, height: 48, borderRadius: "50%",
                background: "rgba(34,197,94,0.08)",
                border: "1px solid rgba(34,197,94,0.2)",
                marginBottom: 18,
              }}>
                <CheckCircle size={22} color="#22C55E" />
              </div>
              <h2 style={{ fontSize: 17, fontWeight: 600, marginBottom: 10, color: "#F4F4F5" }}>Email enviado</h2>
              <p style={{ fontSize: 13.5, color: "#71717A", lineHeight: 1.6, marginBottom: 22 }}>
                Verifique sua caixa de entrada em{" "}
                <strong style={{ color: "#A1A1AA" }}>{resetEmail}</strong> e clique no link para redefinir sua senha.
              </p>
              <button
                onClick={() => { setResetMode(false); setResetSent(false); setResetEmail(""); }}
                style={{ fontSize: 13, color: "#A1A1AA", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}
              >
                ← Voltar ao login
              </button>
            </div>
          ) : (
            <>
              <h1 style={{ fontSize: 19, fontWeight: 600, letterSpacing: "-0.02em", marginBottom: 6, color: "#F4F4F5" }}>
                Redefinir senha
              </h1>
              <p style={{ fontSize: 13.5, color: "#71717A", marginBottom: 24 }}>
                Enviaremos um link para o seu email
              </p>
              {resetError && <ErrorAlert msg={resetError} />}
              <form onSubmit={handleReset}>
                <div style={{ marginBottom: 18 }}>
                  <FieldLabel>Email</FieldLabel>
                  <input type="email" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)}
                    required placeholder="seu@email.com" style={INPUT}
                    onFocus={(e) => { e.target.style.borderColor = INPUT_FOCUS; }}
                    onBlur={(e)  => { e.target.style.borderColor = INPUT_BLUR; }}
                  />
                </div>
                <PrimaryBtn disabled={resetLoading}>{resetLoading ? "Enviando..." : "Enviar link"}</PrimaryBtn>
              </form>
              <button
                onClick={() => setResetMode(false)}
                style={{ width: "100%", marginTop: 14, fontSize: 13, color: "#52525B", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}
              >
                ← Voltar ao login
              </button>
            </>
          )}
        </Card>
      </Wrapper>
    );
  }

  return (
    <Wrapper>
      <Card>
        <Logo />
        <h1 style={{ fontSize: 19, fontWeight: 600, letterSpacing: "-0.02em", marginBottom: 6, color: "#F4F4F5" }}>
          Entrar
        </h1>
        <p style={{ fontSize: 13.5, color: "#71717A", marginBottom: 24 }}>Acesse sua conta para continuar</p>

        {error && <ErrorAlert msg={error} />}

        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: 14 }}>
            <FieldLabel>Email</FieldLabel>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              required placeholder="seu@email.com" style={INPUT}
              onFocus={(e) => { e.target.style.borderColor = INPUT_FOCUS; }}
              onBlur={(e)  => { e.target.style.borderColor = INPUT_BLUR; }}
            />
          </div>
          <div style={{ marginBottom: 10 }}>
            <FieldLabel>Senha</FieldLabel>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              required placeholder="••••••••" style={INPUT}
              onFocus={(e) => { e.target.style.borderColor = INPUT_FOCUS; }}
              onBlur={(e)  => { e.target.style.borderColor = INPUT_BLUR; }}
            />
          </div>
          <div style={{ textAlign: "right", marginBottom: 18 }}>
            <button type="button" onClick={() => { setResetMode(true); setResetEmail(email); }}
              style={{ fontSize: 12.5, color: "#71717A", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "#A1A1AA"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "#71717A"; }}
            >
              Esqueci minha senha
            </button>
          </div>
          <PrimaryBtn disabled={loading}>{loading ? "Entrando..." : "Entrar"}</PrimaryBtn>
        </form>
      </Card>

      <p style={{ textAlign: "center", marginTop: 20, fontSize: 13, color: "#52525B" }}>
        Não tem conta?{" "}
        <Link href="/signup" style={{ color: "#A1A1AA", fontWeight: 500 }}
          onMouseEnter={(e: React.MouseEvent<HTMLAnchorElement>) => { e.currentTarget.style.color = "#F4F4F5"; }}
          onMouseLeave={(e: React.MouseEvent<HTMLAnchorElement>) => { e.currentTarget.style.color = "#A1A1AA"; }}
        >
          Criar conta
        </Link>
      </p>
    </Wrapper>
  );
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      minHeight: "100vh", padding: "24px",
    }}>
      <div style={{ width: "100%", maxWidth: "400px" }}>{children}</div>
    </div>
  );
}

function ErrorAlert({ msg }: { msg: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "9px 13px", borderRadius: 8,
      background: "rgba(239,68,68,0.07)",
      border: "1px solid rgba(239,68,68,0.18)",
      marginBottom: 18,
    }}>
      <AlertCircle size={14} color="#EF4444" />
      <p style={{ fontSize: 13, color: "#EF4444" }}>{msg}</p>
    </div>
  );
}
