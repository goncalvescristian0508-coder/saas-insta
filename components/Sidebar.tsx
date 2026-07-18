"use client";

import NextLink from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, Users, Clapperboard, CalendarClock,
  Send, LogOut, Shield, Copy, Menu, X,
  Flame, WifiOff, Plug, BarChart2, Camera, Activity, TrendingUp, Search, GraduationCap, UserPlus,
} from "lucide-react";
import React, { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const ADMIN_EMAIL = "goncalvescristian0508@gmail.com";

type NavItemDef = { name: string; href: string; icon: React.ElementType };

const navGroups: { label?: string; items: NavItemDef[] }[] = [
  {
    items: [{ name: "Dashboard", href: "/", icon: LayoutDashboard }],
  },
  {
    label: "Automação",
    items: [
      { name: "Contas",            href: "/accounts",       icon: Users },
      { name: "Postagem em massa", href: "/postagem-massa", icon: Send },
      { name: "Agendamento",       href: "/schedule",       icon: CalendarClock },
    ],
  },
  {
    label: "Conteúdo",
    items: [
      { name: "Biblioteca",  href: "/library",     icon: Clapperboard },
      { name: "Stories",     href: "/stories",     icon: Camera },
      { name: "Inspirações", href: "/inspiracoes", icon: Search },
    ],
  },
  {
    label: "Ferramentas",
    items: [
      { name: "Clonar Perfil",       href: "/clonar",               icon: Copy },
      { name: "Clonar TikTok",       href: "/clonar-ttk",           icon: Copy },
      { name: "Aquecimento",         href: "/aquecimento",           icon: Flame },
      { name: "Contas Off",          href: "/contas-off",            icon: WifiOff },
      { name: "Adicionar usuários",  href: "/adicionar-usuarios",    icon: UserPlus },
    ],
  },
  {
    label: "Analytics",
    items: [
      { name: "Engajamento", href: "/engajamento", icon: TrendingUp },
      { name: "Vendas",      href: "/vendas",      icon: BarChart2 },
      { name: "Saúde",       href: "/saude",       icon: Activity },
    ],
  },
  {
    label: "Sistema",
    items: [
      { name: "Integrações", href: "/integracoes", icon: Plug },
      { name: "Aprender",    href: "/aprender",    icon: GraduationCap },
    ],
  },
];

const MILESTONES = [0, 10_000, 50_000, 100_000, 500_000, 1_000_000];

function getMilestoneInfo(rev: number) {
  for (let i = 0; i < MILESTONES.length - 1; i++) {
    if (rev < MILESTONES[i + 1]) {
      const from = MILESTONES[i], to = MILESTONES[i + 1];
      return { to, pct: Math.min(((rev - from) / (to - from)) * 100, 100) };
    }
  }
  return { to: MILESTONES[MILESTONES.length - 1], pct: 100 };
}

function fmtMilestone(v: number) {
  if (v >= 1_000_000) return "R$ 1M";
  if (v >= 1_000)     return `R$ ${v / 1_000}k`;
  return `R$ ${v}`;
}

function fmtCurrencyShort(v: number) {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `R$ ${(v / 1_000).toFixed(v % 1_000 === 0 ? 0 : 1)}k`;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function hashColor(str: string) {
  const palette = ["#7c3aed","#0ea5e9","#10b981","#f59e0b","#ef4444","#ec4899","#6366f1","#14b8a6"];
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return palette[Math.abs(hash) % palette.length];
}

function SidebarItem({ item, isActive, onClose }: { item: NavItemDef; isActive: boolean; onClose: () => void }) {
  const [hov, setHov] = useState(false);
  return (
    <NextLink
      href={item.href}
      onClick={onClose}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "5px 10px 5px 8px",
        margin: "0 8px",
        borderRadius: 6,
        borderLeft: isActive ? "2px solid #FFB800" : "2px solid transparent",
        color: isActive ? "#FFB800" : hov ? "#ededed" : "#a0a0a0",
        background: isActive ? "rgba(255,184,0,0.08)" : hov ? "rgba(255,255,255,0.04)" : "transparent",
        fontWeight: isActive ? 500 : 400,
        fontSize: 13,
        transition: "background 0.1s, color 0.1s, border-color 0.1s",
        textDecoration: "none",
        lineHeight: 1,
      }}
    >
      <item.icon
        size={14}
        strokeWidth={isActive ? 2 : 1.75}
        color={isActive ? "#FFB800" : "currentColor"}
        style={{ flexShrink: 0, opacity: isActive ? 1 : hov ? 0.8 : 0.6 }}
      />
      <span style={{ flex: 1 }}>{item.name}</span>
    </NextLink>
  );
}

export default function Sidebar() {
  const pathname   = usePathname();
  const router     = useRouter();
  const [userEmail,  setUserEmail]  = useState<string | null>(null);
  const [userName,   setUserName]   = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [revenue,    setRevenue]    = useState(0);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setUserEmail(data.user.email ?? null);
        setUserName(data.user.user_metadata?.name ?? null);
      }
    });
    fetch("/api/sales?period=maximo&limit=1")
      .then(r => r.json())
      .then(d => setRevenue(d?.stats?.approvedRevenue ?? 0))
      .catch(() => {});
  }, []);

  async function handleLogout() {
    setLoggingOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const initials = userName
    ? userName.split(" ").map((n: string) => n[0]).slice(0, 2).join("").toUpperCase()
    : userEmail?.[0]?.toUpperCase() ?? "U";

  const avatarColor = hashColor(userEmail ?? "user");
  const isAdmin     = userEmail === ADMIN_EMAIL;
  const { to, pct } = getMilestoneInfo(revenue);

  return (
    <>
      {/* ── Mobile top bar ── */}
      <div className="mobile-topbar" style={{
        display: "none", position: "fixed", top: 0, left: 0, right: 0,
        height: 52, background: "#0d0d0d",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
        alignItems: "center", justifyContent: "space-between",
        padding: "0 1rem", zIndex: 20,
      }}>
        <NextLink href="/" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <img src="/logo.png" alt="AutoPost" style={{ width: 22, height: 22, borderRadius: 5, objectFit: "cover" }} />
          <span style={{ fontWeight: 600, fontSize: 14, color: "#ededed", letterSpacing: "-0.02em" }}>AutoPost</span>
        </NextLink>
        <button onClick={() => setMobileOpen(v => !v)}
          style={{ background: "none", border: "none", color: "#6c6c6c", cursor: "pointer", padding: "0.4rem", display: "flex" }}>
          {mobileOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>

      {/* ── Mobile overlay ── */}
      {mobileOpen && (
        <div className="mobile-overlay" onClick={() => setMobileOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 18, display: "none" }} />
      )}

      {/* ── Sidebar ── */}
      <aside
        className={mobileOpen ? "sidebar-open" : ""}
        style={{
          width: 232,
          background: "#0d0d0d",
          borderRight: "1px solid rgba(255,255,255,0.06)",
          height: "100vh",
          position: "fixed", left: 0, top: 0,
          display: "flex", flexDirection: "column",
          zIndex: 19, overflow: "hidden",
        }}
      >
        {/* Brand */}
        <div style={{ padding: "16px 16px 10px", flexShrink: 0 }}>
          <NextLink href="/" style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <img src="/logo.png" alt="AutoPost" style={{ width: 24, height: 24, borderRadius: 6, objectFit: "cover" }} />
            <span style={{ fontWeight: 600, fontSize: 14, color: "#ededed", letterSpacing: "-0.02em" }}>AutoPost</span>
          </NextLink>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "2px 0", display: "flex", flexDirection: "column" }}>
          {navGroups.map((group, gi) => (
            <div key={gi} style={{ marginBottom: 2 }}>
              {group.label && (
                <p style={{
                  fontSize: 10.5, fontWeight: 500, letterSpacing: "0.08em",
                  textTransform: "uppercase", color: "#444",
                  padding: "10px 18px 3px", lineHeight: 1,
                }}>
                  {group.label}
                </p>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                {group.items.map(item => (
                  <SidebarItem
                    key={item.href} item={item}
                    isActive={pathname === item.href}
                    onClose={() => setMobileOpen(false)}
                  />
                ))}
              </div>
            </div>
          ))}

          {isAdmin && (
            <div style={{ marginBottom: 2 }}>
              <p style={{
                fontSize: 10.5, fontWeight: 500, letterSpacing: "0.08em",
                textTransform: "uppercase", color: "#444",
                padding: "10px 18px 3px", lineHeight: 1,
              }}>
                Admin
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <SidebarItem
                  item={{ name: "Painel Admin", href: "/admin", icon: Shield }}
                  isActive={pathname === "/admin"}
                  onClose={() => setMobileOpen(false)}
                />
              </div>
            </div>
          )}
        </nav>

        {/* ── Bottom ── */}
        <div style={{ flexShrink: 0, padding: "10px 16px 14px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          {/* Revenue progress block */}
          <div style={{
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.05)",
            borderRadius: 7, padding: "10px 12px", marginBottom: 10,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 7 }}>
              <span style={{ fontSize: 11, color: "#6c6c6c", fontWeight: 400 }}>Meta de faturamento</span>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: "#ededed", letterSpacing: "-0.01em" }}>
                {fmtCurrencyShort(revenue)}
              </span>
            </div>
            <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{
                height: 3, width: `${pct}%`, background: "#FFB800",
                borderRadius: 2, transition: "width 0.6s ease",
              }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5 }}>
              <span style={{ fontSize: 10.5, color: "#444" }}>
                {pct.toFixed(1)}% de {fmtMilestone(to)}
              </span>
              <span style={{ fontSize: 10.5, color: "#444" }}>
                {new Date().toLocaleString("pt-BR", { month: "long" })}
              </span>
            </div>
          </div>

          {/* User */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 7,
              background: avatarColor,
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0, fontSize: 11, fontWeight: 700, color: "#fff",
            }}>
              {initials}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              {userName && (
                <p style={{ fontSize: 12.5, fontWeight: 500, color: "#ededed", lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {userName}
                </p>
              )}
              <p style={{ fontSize: 10.5, color: "#444", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {userEmail ?? "Carregando..."}
              </p>
            </div>
          </div>

          {/* Logout */}
          <button onClick={handleLogout} disabled={loggingOut}
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: 6,
              padding: "4px 8px", borderRadius: 5, background: "transparent", border: "none",
              color: "#444", fontSize: 12, cursor: loggingOut ? "not-allowed" : "pointer",
              transition: "color 0.15s", fontFamily: "inherit",
            }}
            onMouseEnter={e => { e.currentTarget.style.color = "#f87171"; }}
            onMouseLeave={e => { e.currentTarget.style.color = "#444"; }}
          >
            <LogOut size={12} />
            {loggingOut ? "Saindo..." : "Sair"}
          </button>
        </div>
      </aside>
    </>
  );
}
