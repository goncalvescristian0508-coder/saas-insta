"use client";

import NextLink from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, Users, Clapperboard, CalendarClock,
  Search, Send, LogOut, ChevronRight, Shield, Copy, Menu, X,
  Flame, WifiOff, Plug, BarChart2, Camera, Activity, TrendingUp,
} from "lucide-react";
import React, { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const ADMIN_EMAIL = "goncalvescristian0508@gmail.com";

const navItems = [
  { name: "Dashboard",         href: "/",               icon: LayoutDashboard },
  { name: "Contas",            href: "/accounts",       icon: Users },
  { name: "Postagem em massa", href: "/postagem-massa",  icon: Send },
  { name: "Inspirações",       href: "/inspiracoes",    icon: Search },
  { name: "Clonar Perfil",     href: "/clonar",         icon: Copy },
  { name: "Biblioteca",        href: "/library",        icon: Clapperboard },
  { name: "Stories",           href: "/stories",        icon: Camera },
  { name: "Saúde",             href: "/saude",          icon: Activity },
  { name: "Agendamento",       href: "/schedule",       icon: CalendarClock },
  { name: "Aquecimento",       href: "/aquecimento",    icon: Flame },
  { name: "Contas Off",        href: "/contas-off",     icon: WifiOff },
  { name: "Engajamento",        href: "/engajamento",    icon: TrendingUp },
  { name: "Vendas",            href: "/vendas",         icon: BarChart2 },
  { name: "Integrações",       href: "/integracoes",    icon: Plug },
];

const MILESTONES = [0, 10_000, 50_000, 100_000, 500_000, 1_000_000];

function getMilestoneInfo(rev: number) {
  for (let i = 0; i < MILESTONES.length - 1; i++) {
    if (rev < MILESTONES[i + 1]) {
      const from = MILESTONES[i];
      const to   = MILESTONES[i + 1];
      return { from, to, pct: Math.min(((rev - from) / (to - from)) * 100, 100) };
    }
  }
  return { from: MILESTONES[MILESTONES.length - 1], to: MILESTONES[MILESTONES.length - 1], pct: 100 };
}

function fmtMilestone(v: number) {
  if (v >= 1_000_000) return "R$ 1M";
  if (v >= 1_000)     return `R$ ${v / 1_000}k`;
  return `R$ ${v}`;
}

function fmtCurrency(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function Sidebar() {
  const pathname  = usePathname();
  const router    = useRouter();
  const [userEmail,  setUserEmail]  = useState<string | null>(null);
  const [userName,   setUserName]   = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [revenue,    setRevenue]    = useState<number>(0);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setUserEmail(data.user.email ?? null);
        setUserName(data.user.user_metadata?.name ?? null);
      }
    });
    // fetch total revenue
    fetch("/api/sales?period=maximo&limit=1")
      .then((r) => r.json())
      .then((d) => setRevenue(d?.stats?.approvedRevenue ?? 0))
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

  const allNav = [
    ...navItems,
    ...(userEmail === ADMIN_EMAIL ? [{ name: "Admin", href: "/admin", icon: Shield }] : []),
  ];

  const { to, pct } = getMilestoneInfo(revenue);

  return (
    <>
      {/* ── Mobile top bar ── */}
      <div className="mobile-topbar" style={{
        display: "none", position: "fixed",
        top: 0, left: 0, right: 0, height: "56px",
        background: "rgba(8,10,16,0.96)", backdropFilter: "blur(20px)",
        borderBottom: "1px solid var(--border-color)",
        alignItems: "center", justifyContent: "space-between",
        padding: "0 1rem", zIndex: 20,
      }}>
        <span style={{ fontWeight: 800, fontSize: "1rem", color: "#fff" }}>
          <span style={{ color: "#FFD54F" }}>Auto</span>Post
        </span>
        <button onClick={() => setMobileOpen((v) => !v)}
          style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", padding: "0.4rem" }}>
          {mobileOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {/* ── Overlay ── */}
      {mobileOpen && (
        <div className="mobile-overlay" onClick={() => setMobileOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 18, display: "none" }} />
      )}

      <aside className={mobileOpen ? "sidebar-open" : ""} style={{
        width: "260px",
        background: "linear-gradient(180deg, rgba(8,10,16,0.96) 0%, rgba(6,8,14,0.92) 100%)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        borderRight: "1px solid var(--border-color)",
        boxShadow: "4px 0 32px rgba(0,0,0,0.4)",
        height: "100vh",
        position: "fixed", left: 0, top: 0,
        display: "flex", flexDirection: "column",
        padding: "1.75rem 0.875rem",
        zIndex: 19,
      }}>

        {/* Logo */}
        <div style={{ marginBottom: "2rem", paddingLeft: "0.75rem" }}>
          <NextLink href="/" style={{ display: "flex", alignItems: "center", gap: "0.6rem", textDecoration: "none" }}>
            <img src="/logo.png" alt="AutoPost"
              style={{ width: "36px", height: "36px", borderRadius: "9px", objectFit: "cover" }} />
            <h1 style={{ fontFamily: "var(--font-sans)", fontSize: "1.2rem", fontWeight: 800, color: "#fff", letterSpacing: "-0.02em", lineHeight: 1 }}>
              <span style={{ color: "#FFD54F" }}>Auto</span>Post
            </h1>
          </NextLink>
        </div>

        {/* Section label */}
        <p style={{ fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase",
          color: "var(--text-muted)", paddingLeft: "0.75rem", marginBottom: "0.5rem" }}>
          Menu
        </p>

        {/* Nav */}
        <nav style={{ display: "flex", flexDirection: "column", gap: "0.3rem", flex: 1 }}>
          {allNav.map((item) => {
            const isActive = pathname === item.href;
            return (
              <NextLink key={item.name} href={item.href} onClick={() => setMobileOpen(false)}
                style={{
                  display: "flex", alignItems: "center", gap: "0.75rem",
                  padding: "0.7rem 0.875rem", borderRadius: "10px",
                  color: isActive ? "#fff" : "var(--text-secondary)",
                  backgroundColor: isActive ? "rgba(255,213,79,0.11)" : "transparent",
                  border: isActive ? "1px solid rgba(255,213,79,0.2)" : "1px solid transparent",
                  transition: "all 0.18s",
                  fontWeight: isActive ? 600 : 500,
                  fontSize: "0.875rem",
                  textDecoration: "none",
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = "rgba(255,213,79,0.055)";
                    e.currentTarget.style.color = "#fff";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = "transparent";
                    e.currentTarget.style.color = "var(--text-secondary)";
                  }
                }}
              >
                <item.icon size={17} color={isActive ? "#FFD54F" : "currentColor"} strokeWidth={isActive ? 2 : 1.75} />
                <span style={{ flex: 1 }}>{item.name}</span>
                {isActive && <ChevronRight size={14} color="#FFD54F" style={{ opacity: 0.6 }} />}
              </NextLink>
            );
          })}
        </nav>

        {/* ── Bottom section ── */}
        <div style={{ marginTop: "1rem", borderTop: "1px solid var(--border-color)", paddingTop: "1rem" }}>

          {/* Faturamento */}
          <div style={{ marginBottom: "0.75rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
              <span style={{ fontSize: "0.78rem", fontWeight: 500, color: "var(--text-secondary)" }}>
                Faturamento
              </span>
              <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#e0e0e0" }}>
                {fmtCurrency(revenue)} / {fmtMilestone(to)}
              </span>
            </div>
            <div style={{ height: "4px", background: "rgba(255,255,255,0.06)", borderRadius: "3px", overflow: "hidden" }}>
              <div style={{
                height: "4px", width: `${pct}%`,
                background: "linear-gradient(90deg, #FFD54F, #c9920a)",
                borderRadius: "3px", transition: "width 0.6s ease",
              }} />
            </div>
          </div>

          {/* Profile */}
          <div style={{
            display: "flex", alignItems: "center", gap: "0.7rem",
            padding: "0.6rem 0", marginBottom: "0.25rem",
          }}>
            <div style={{
              width: "32px", height: "32px", borderRadius: "8px",
              background: "linear-gradient(135deg, rgba(255,213,79,0.3), rgba(255,213,79,0.1))",
              border: "1px solid rgba(255,213,79,0.25)",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0, fontSize: "0.8rem", fontWeight: 700, color: "#FFD54F",
            }}>
              {initials}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              {userName && (
                <p style={{ fontSize: "0.8rem", fontWeight: 600, color: "#fff", lineHeight: 1.2,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {userName}
                </p>
              )}
              <p style={{ fontSize: "0.7rem", color: "var(--text-muted)",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {userEmail ?? "Carregando..."}
              </p>
            </div>
          </div>

          {/* Logout */}
          <button onClick={handleLogout} disabled={loggingOut}
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: "0.5rem",
              padding: "0.5rem 0.25rem", borderRadius: "6px",
              background: "transparent", border: "none",
              color: "var(--text-secondary)", fontSize: "0.82rem",
              cursor: loggingOut ? "not-allowed" : "pointer",
              transition: "color 0.18s", fontFamily: "var(--font-sans)",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "#f87171"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-secondary)"; }}
          >
            <LogOut size={14} />
            {loggingOut ? "Saindo..." : "Sair da conta"}
          </button>
        </div>
      </aside>
    </>
  );
}
