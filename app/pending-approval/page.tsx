"use client";

import { Clock, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function PendingApprovalPage() {
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
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "1.5rem",
      background: "#0a0c12",
    }}>
      <div style={{ width: "100%", maxWidth: "420px", textAlign: "center" }}>
        <div style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: "72px",
          height: "72px",
          borderRadius: "50%",
          background: "rgba(255, 213, 79, 0.08)",
          border: "1px solid rgba(255, 213, 79, 0.25)",
          marginBottom: "1.75rem",
        }}>
          <Clock size={32} color="#FFD54F" />
        </div>

        <h1 style={{
          fontSize: "1.6rem",
          fontWeight: 800,
          color: "#fff",
          letterSpacing: "-0.03em",
          marginBottom: "0.75rem",
        }}>
          Aguardando aprovação
        </h1>

        <p style={{
          color: "#6b7280",
          lineHeight: 1.7,
          marginBottom: "0.75rem",
          fontSize: "0.95rem",
        }}>
          Sua conta foi criada com sucesso. Um administrador precisa aprovar seu acesso antes que você possa usar a plataforma.
        </p>

        <p style={{
          color: "#4b5563",
          fontSize: "0.85rem",
          marginBottom: "2rem",
        }}>
          Você receberá acesso em breve. Se demorar, entre em contato com o suporte.
        </p>

        <button
          onClick={handleLogout}
          disabled={loggingOut}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.75rem 1.5rem",
            background: "rgba(255, 255, 255, 0.05)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            borderRadius: "10px",
            color: "#9ca3af",
            fontWeight: 600,
            fontSize: "0.875rem",
            cursor: loggingOut ? "not-allowed" : "pointer",
          }}
        >
          <LogOut size={15} />
          {loggingOut ? "Saindo..." : "Sair da conta"}
        </button>
      </div>
    </div>
  );
}
