"use client";

import Link from "next/link";
import { Users, Film, CalendarClock, CheckCircle, TrendingUp, Send, Search } from "lucide-react";

interface StatsProps {
  accounts: number;
  videos: number;
  pending: number;
  done: number;
}

export function StatCards({ accounts, videos, pending, done }: StatsProps) {
  const stats = [
    { label: "Contas Conectadas", value: accounts, icon: Users, href: "/accounts", color: "#c9a227" },
    { label: "Vídeos na Biblioteca", value: videos, icon: Film, href: "/library", color: "#818cf8" },
    { label: "Posts Pendentes", value: pending, icon: CalendarClock, href: "/schedule", color: "#f59e0b" },
    { label: "Publicados", value: done, icon: CheckCircle, href: "/schedule", color: "#4ade80" },
  ];

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
      gap: "1rem",
      marginBottom: "2rem",
    }}>
      {stats.map((stat) => (
        <Link key={stat.label} href={stat.href} style={{ textDecoration: "none" }}>
          <div className="glass-panel stat-card" style={{ padding: "1.4rem", borderRadius: "14px", cursor: "pointer" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
              <div style={{
                width: "38px", height: "38px", borderRadius: "10px",
                background: `${stat.color}18`, border: `1px solid ${stat.color}30`,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <stat.icon size={18} color={stat.color} />
              </div>
              <TrendingUp size={14} color="var(--text-muted)" />
            </div>
            <p style={{ fontSize: "2.2rem", fontWeight: 800, lineHeight: 1, marginBottom: "0.4rem", color: "#fff" }}>
              {stat.value}
            </p>
            <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: 500 }}>
              {stat.label}
            </p>
          </div>
        </Link>
      ))}
      <style>{`.stat-card { transition: transform 0.2s; } .stat-card:hover { transform: translateY(-2px); border-color: rgba(201,162,39,0.25) !important; }`}</style>
    </div>
  );
}

export function QuickActions() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "2rem" }}>
      <Link href="/postagem-massa" style={{ textDecoration: "none" }}>
        <div className="quick-action-gold" style={{
          padding: "1.25rem 1.5rem", borderRadius: "14px",
          background: "linear-gradient(135deg, rgba(201,162,39,0.15) 0%, rgba(201,162,39,0.06) 100%)",
          border: "1px solid rgba(201,162,39,0.2)",
          display: "flex", alignItems: "center", gap: "1rem", cursor: "pointer",
        }}>
          <div style={{
            width: "44px", height: "44px", borderRadius: "12px",
            background: "rgba(201,162,39,0.15)", border: "1px solid rgba(201,162,39,0.25)",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <Send size={20} color="var(--accent-gold)" />
          </div>
          <div>
            <p style={{ fontWeight: 700, marginBottom: "0.2rem" }}>Postagem em Massa</p>
            <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Poste em várias contas ao mesmo tempo</p>
          </div>
        </div>
      </Link>

      <Link href="/inspiracoes" style={{ textDecoration: "none" }}>
        <div className="quick-action-purple" style={{
          padding: "1.25rem 1.5rem", borderRadius: "14px",
          background: "rgba(129,140,248,0.06)",
          border: "1px solid rgba(129,140,248,0.15)",
          display: "flex", alignItems: "center", gap: "1rem", cursor: "pointer",
        }}>
          <div style={{
            width: "44px", height: "44px", borderRadius: "12px",
            background: "rgba(129,140,248,0.12)", border: "1px solid rgba(129,140,248,0.2)",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <Search size={20} color="#818cf8" />
          </div>
          <div>
            <p style={{ fontWeight: 700, marginBottom: "0.2rem" }}>Buscar Inspirações</p>
            <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Baixe reels de perfis públicos</p>
          </div>
        </div>
      </Link>

      <style>{`
        .quick-action-gold { transition: background 0.2s; }
        .quick-action-gold:hover { background: linear-gradient(135deg, rgba(201,162,39,0.22) 0%, rgba(201,162,39,0.1) 100%) !important; }
        .quick-action-purple { transition: background 0.2s; }
        .quick-action-purple:hover { background: rgba(129,140,248,0.1) !important; }
      `}</style>
    </div>
  );
}
