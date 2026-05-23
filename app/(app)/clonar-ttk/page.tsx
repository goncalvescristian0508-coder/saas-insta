"use client";

import { Wrench, Clock } from "lucide-react";

export default function ClonarTikTokPage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "60vh", alignItems: "center", justifyContent: "center" }}>
      <div style={{
        background: "#0d0d0d",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 12,
        padding: "48px 56px",
        textAlign: "center",
        maxWidth: 440,
      }}>
        <div style={{
          width: 52, height: 52, borderRadius: 12,
          background: "rgba(255,184,0,0.08)",
          border: "1px solid rgba(255,184,0,0.15)",
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 20px",
        }}>
          <Wrench size={22} color="#FFB800" strokeWidth={1.75} />
        </div>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "#ededed", letterSpacing: "-0.02em", marginBottom: 8 }}>
          Em Manutenção
        </h2>
        <p style={{ fontSize: 13.5, color: "#6c6c6c", lineHeight: 1.6, marginBottom: 20 }}>
          O Clonar TikTok está temporariamente indisponível enquanto realizamos melhorias.
          Em breve estará de volta com novidades.
        </p>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "6px 14px", borderRadius: 6,
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.06)",
          fontSize: 12, color: "#444",
        }}>
          <Clock size={12} strokeWidth={1.75} />
          Voltamos em breve
        </div>
      </div>
    </div>
  );
}
