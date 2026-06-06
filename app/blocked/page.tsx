"use client";

import { Ban, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function BlockedPage() {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    await createClient().auth.signOut();
    router.push("/login");
  }

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "1.5rem",
    }}>
      <div style={{ width: "100%", maxWidth: "380px", textAlign: "center" }}>
        <div style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 56, height: 56, borderRadius: "50%",
          background: "rgba(239,68,68,0.08)",
          border: "1px solid rgba(239,68,68,0.2)",
          marginBottom: "1.5rem",
        }}>
          <Ban size={24} color="#f87171" strokeWidth={1.75} />
        </div>

        <h1 style={{
          fontSize: "1.4rem", fontWeight: 600,
          color: "#F4F4F5", letterSpacing: "-0.025em",
          marginBottom: "0.75rem",
        }}>
          Conta bloqueada
        </h1>

        <p style={{ color: "#71717A", lineHeight: 1.7, marginBottom: "0.5rem", fontSize: "0.9rem" }}>
          O acesso à sua conta foi suspenso pelo administrador da plataforma.
        </p>

        <p style={{ color: "#52525B", fontSize: "0.825rem", marginBottom: "2rem" }}>
          Entre em contato com o suporte para mais informações.
        </p>

        <button
          onClick={handleLogout}
          disabled={loggingOut}
          style={{
            display: "inline-flex", alignItems: "center", gap: "0.5rem",
            padding: "8px 18px",
            background: "transparent",
            border: "1px solid rgba(255,255,255,0.09)",
            borderRadius: "8px",
            color: "#71717A", fontWeight: 400,
            fontSize: "0.875rem",
            cursor: loggingOut ? "not-allowed" : "pointer",
            fontFamily: "inherit", transition: "all 0.15s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "#A1A1AA"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.16)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "#71717A"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.09)"; }}
        >
          <LogOut size={14} />
          {loggingOut ? "Saindo..." : "Sair da conta"}
        </button>
      </div>
    </div>
  );
}
