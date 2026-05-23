"use client";

import Link from "next/link";
import { Users, Film, CalendarClock, CheckCircle, Send, Search } from "lucide-react";
import { useState } from "react";

interface StatsProps {
  accounts: number;
  videos: number;
  pending: number;
  done: number;
}

export function StatCards({ accounts, videos, pending, done }: StatsProps) {
  const stats = [
    { label: "Contas Conectadas",   value: accounts, icon: Users,        href: "/accounts" },
    { label: "Vídeos na Biblioteca", value: videos,   icon: Film,        href: "/library" },
    { label: "Posts Pendentes",      value: pending,  icon: CalendarClock, href: "/schedule" },
    { label: "Publicados",           value: done,     icon: CheckCircle,  href: "/schedule" },
  ];

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
      gap: 10, marginBottom: 14,
    }}>
      {stats.map((stat) => (
        <StatCard key={stat.label} stat={stat} />
      ))}
    </div>
  );
}

function StatCard({ stat }: { stat: { label: string; value: number; icon: React.ElementType; href: string } }) {
  const [hovered, setHovered] = useState(false);
  return (
    <Link href={stat.href} style={{ textDecoration: "none" }}>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          background: "#18181B",
          border: `1px solid ${hovered ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.07)"}`,
          borderRadius: 10,
          padding: "18px 20px",
          cursor: "pointer",
          transition: "border-color 0.15s",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <span style={{ fontSize: 12, color: "#71717A", fontWeight: 500 }}>{stat.label}</span>
          <stat.icon size={13} color="#3F3F46" strokeWidth={1.75} />
        </div>
        <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.025em", color: "#F4F4F5", lineHeight: 1 }}>
          {stat.value}
        </div>
      </div>
    </Link>
  );
}

export function QuickActions() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
      <QuickActionCard
        href="/postagem-massa"
        icon={Send}
        title="Postagem em Massa"
        description="Poste em várias contas ao mesmo tempo"
      />
      <QuickActionCard
        href="/inspiracoes"
        icon={Search}
        title="Buscar Inspirações"
        description="Baixe reels de perfis públicos"
      />
    </div>
  );
}

function QuickActionCard({
  href, icon: Icon, title, description,
}: {
  href: string; icon: React.ElementType; title: string; description: string;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <Link href={href} style={{ textDecoration: "none" }}>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          padding: "16px 18px", borderRadius: 10,
          background: hovered ? "rgba(255,255,255,0.04)" : "transparent",
          border: `1px solid ${hovered ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.07)"}`,
          display: "flex", alignItems: "center", gap: 14,
          cursor: "pointer", transition: "all 0.15s",
        }}
      >
        <div style={{
          width: 36, height: 36, borderRadius: 9,
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.08)",
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <Icon size={16} color="#A1A1AA" strokeWidth={1.75} />
        </div>
        <div>
          <p style={{ fontWeight: 500, fontSize: 13.5, color: "#E4E4E7", marginBottom: 2 }}>{title}</p>
          <p style={{ fontSize: 12, color: "#71717A" }}>{description}</p>
        </div>
      </div>
    </Link>
  );
}
