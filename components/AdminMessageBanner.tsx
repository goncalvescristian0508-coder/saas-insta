"use client";

import { useState } from "react";
import { Info, X } from "lucide-react";

export default function AdminMessageBanner({ message }: { message: string }) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  async function dismiss() {
    setDismissed(true);
    await fetch("/api/dismiss-message", { method: "POST" }).catch(() => {});
  }

  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 12,
      padding: "12px 16px",
      background: "rgba(79,131,247,0.06)",
      border: "1px solid rgba(79,131,247,0.18)",
      borderRadius: 10,
    }}>
      <Info size={14} color="#4F83F7" style={{ flexShrink: 0, marginTop: 2 }} />
      <p style={{ flex: 1, fontSize: 13.5, color: "#D4D4D8", lineHeight: 1.55 }}>
        <strong style={{ color: "#A1A1AA", fontWeight: 500 }}>Mensagem do suporte: </strong>
        {message}
      </p>
      <button
        onClick={dismiss}
        style={{
          background: "none", border: "none", cursor: "pointer",
          color: "#52525B", padding: "2px", flexShrink: 0,
          display: "flex", alignItems: "center", transition: "color 0.15s",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = "#A1A1AA"; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = "#52525B"; }}
      >
        <X size={14} />
      </button>
    </div>
  );
}
