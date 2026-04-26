"use client";

import { useState } from "react";
import { MessageSquare, X } from "lucide-react";

export default function AdminMessageBanner({ message }: { message: string }) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  async function dismiss() {
    setDismissed(true);
    await fetch("/api/dismiss-message", { method: "POST" }).catch(() => {});
  }

  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: "0.75rem",
      padding: "0.875rem 1.1rem",
      background: "linear-gradient(135deg, rgba(255,213,79,0.1), rgba(255,213,79,0.04))",
      border: "1px solid rgba(255,213,79,0.25)",
      borderRadius: 12, marginBottom: "1.25rem",
    }}>
      <MessageSquare size={16} color="#FFD54F" style={{ flexShrink: 0, marginTop: 1 }} />
      <p style={{ flex: 1, fontSize: 13.5, color: "#e0e0e0", lineHeight: 1.5 }}>
        <strong style={{ color: "#FFD54F" }}>Mensagem do suporte: </strong>{message}
      </p>
      <button onClick={dismiss} style={{
        background: "none", border: "none", cursor: "pointer",
        color: "#666", padding: "2px", flexShrink: 0,
        display: "flex", alignItems: "center",
      }}>
        <X size={15} />
      </button>
    </div>
  );
}
