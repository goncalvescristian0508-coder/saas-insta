"use client";

import Link from "next/link";
import { Users, Film, CalendarClock, CheckCircle, Send, Search } from "lucide-react";

interface StatsProps {
  accounts: number;
  videos: number;
  pending: number;
  done: number;
}

export function StatCards({ accounts, videos, pending, done }: StatsProps) {
  const stats = [
    { label: "Contas Conectadas", value: accounts, icon: Users,        href: "/accounts", iconColor: "#60a5fa", iconBg: "rgba(59,130,246,0.12)" },
    { label: "Vídeos na Biblioteca", value: videos, icon: Film,        href: "/library",  iconColor: "#8b5cf6", iconBg: "rgba(139,92,246,0.12)" },
    { label: "Posts Pendentes",    value: pending,  icon: CalendarClock, href: "/schedule", iconColor: "#FFD54F", iconBg: "rgba(255,213,79,0.12)" },
    { label: "Publicados",         value: done,     icon: CheckCircle,   href: "/schedule", iconColor: "#22c55e", iconBg: "rgba(34,197,94,0.12)" },
  ];

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
      gap: 12, marginBottom: 16,
    }}>
      {stats.map((stat) => (
        <Link key={stat.label} href={stat.href} style={{ textDecoration: "none" }}>
          <div style={{
            background: "#141414",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 12, padding: "18px 20px",
            transition: "border-color 0.15s",
            cursor: "pointer",
          }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,213,79,0.15)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.06)"; }}
          >
            <div style={{
              width: 36, height: 36, borderRadius: 9,
              background: stat.iconBg,
              display: "flex", alignItems: "center", justifyContent: "center",
              marginBottom: 14,
            }}>
              <stat.icon size={17} color={stat.iconColor} />
            </div>
            <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1 }}>
              {stat.value}
            </div>
            <div style={{ fontSize: 12, color: "#555", marginTop: 6, fontWeight: 500 }}>
              {stat.label}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

export function QuickActions() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
      <Link href="/postagem-massa" style={{ textDecoration: "none" }}>
        <div style={{
          padding: "16px 18px", borderRadius: 12,
          background: "rgba(255,213,79,0.07)",
          border: "1px solid rgba(255,213,79,0.15)",
          display: "flex", alignItems: "center", gap: 14, cursor: "pointer",
          transition: "background 0.15s",
        }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "rgba(255,213,79,0.12)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "rgba(255,213,79,0.07)"; }}
        >
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: "rgba(255,213,79,0.12)", border: "1px solid rgba(255,213,79,0.2)",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <Send size={18} color="#FFD54F" />
          </div>
          <div>
            <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>Postagem em Massa</p>
            <p style={{ fontSize: 12, color: "#555" }}>Poste em várias contas ao mesmo tempo</p>
          </div>
        </div>
      </Link>

      <Link href="/inspiracoes" style={{ textDecoration: "none" }}>
        <div style={{
          padding: "16px 18px", borderRadius: 12,
          background: "rgba(139,92,246,0.06)",
          border: "1px solid rgba(139,92,246,0.15)",
          display: "flex", alignItems: "center", gap: 14, cursor: "pointer",
          transition: "background 0.15s",
        }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "rgba(139,92,246,0.1)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "rgba(139,92,246,0.06)"; }}
        >
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.2)",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <Search size={18} color="#8b5cf6" />
          </div>
          <div>
            <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>Buscar Inspirações</p>
            <p style={{ fontSize: 12, color: "#555" }}>Baixe reels de perfis públicos</p>
          </div>
        </div>
      </Link>
    </div>
  );
}
