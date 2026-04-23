"use client";

import NextLink from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, Users, Clapperboard, CalendarClock,
  Search, Send, LogOut, ChevronRight, Shield, Copy, Menu, X,
} from "lucide-react";
import React, { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const ADMIN_EMAIL = "goncalvescristian0508@gmail.com";

const navItems = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Contas", href: "/accounts", icon: Users },
  { name: "Postagem em massa", href: "/postagem-massa", icon: Send },
  { name: "Inspirações", href: "/inspiracoes", icon: Search },
  { name: "Clonar Perfil", href: "/clonar", icon: Copy },
  { name: "Biblioteca", href: "/library", icon: Clapperboard },
  { name: "Agendamento", href: "/schedule", icon: CalendarClock },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setUserEmail(data.user.email ?? null);
        setUserName(data.user.user_metadata?.name ?? null);
      }
    });
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
    : userEmail?.[0]?.toUpperCase() ?? "W";

  return (
    <>
      {/* Mobile top bar */}
      <div style={{
        display: "none",
        position: "fixed",
        top: 0, left: 0, right: 0,
        height: "56px",
        background: "rgba(8,10,16,0.96)",
        backdropFilter: "blur(20px)",
        borderBottom: "1px solid var(--border-color)",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 1rem",
        zIndex: 20,
        // shown via CSS media query
      }} className="mobile-topbar">
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <img src="/logo.png" alt="AutoPost" style={{ width: "28px", height: "28px", borderRadius: "7px" }} />
          <span style={{ fontWeight: 800, fontSize: "1rem", color: "#fff" }}>
            <span style={{ color: "var(--accent-gold)" }}>Auto</span>Post
          </span>
        </div>
        <button
          onClick={() => setMobileOpen((v) => !v)}
          style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", padding: "0.4rem" }}
        >
          {mobileOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {/* Overlay */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
            zIndex: 18, display: "none",
          }}
          className="mobile-overlay"
        />
      )}

    <aside className={mobileOpen ? "sidebar-open" : ""} style={{
      width: "260px",
      background: "linear-gradient(180deg, rgba(8, 10, 16, 0.96) 0%, rgba(6, 8, 14, 0.92) 100%)",
      backdropFilter: "blur(24px)",
      borderRight: "1px solid var(--border-color)",
      boxShadow: "4px 0 32px rgba(0, 0, 0, 0.4)",
      height: "100vh",
      position: "fixed",
      left: 0,
      top: 0,
      display: "flex",
      flexDirection: "column",
      padding: "1.75rem 0.875rem",
      zIndex: 19,
    }}>
      {/* Logo */}
      <div style={{ marginBottom: "2rem", paddingLeft: "0.75rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <img
            src="/logo.png"
            alt="AutoPost"
            style={{ width: "36px", height: "36px", borderRadius: "9px", objectFit: "cover" }}
          />
          <h1 style={{
            fontFamily: "var(--font-sans)",
            fontSize: "1.2rem",
            fontWeight: 800,
            color: "#fff",
            letterSpacing: "-0.02em",
            lineHeight: 1,
          }}>
            <span style={{ color: "var(--accent-gold)" }}>Auto</span>Post
          </h1>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ display: "flex", flexDirection: "column", gap: "0.3rem", flex: 1 }}>
        <p style={{
          fontSize: "0.65rem",
          fontWeight: 700,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--text-muted)",
          paddingLeft: "0.75rem",
          marginBottom: "0.5rem",
        }}>
          Menu
        </p>
        {[...navItems, ...(userEmail === ADMIN_EMAIL ? [{ name: "Admin", href: "/admin", icon: Shield }] : [])].map((item) => {
          const isActive = pathname === item.href;
          return (
            <NextLink
              key={item.name}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                padding: "0.7rem 0.875rem",
                borderRadius: "10px",
                color: isActive ? "#fff" : "var(--text-secondary)",
                backgroundColor: isActive ? "rgba(201, 162, 39, 0.11)" : "transparent",
                border: isActive ? "1px solid rgba(201, 162, 39, 0.2)" : "1px solid transparent",
                transition: "all 0.18s",
                fontWeight: isActive ? 600 : 500,
                fontSize: "0.875rem",
                textDecoration: "none",
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.backgroundColor = "rgba(201, 162, 39, 0.055)";
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
              <item.icon size={17} color={isActive ? "var(--accent-gold)" : "currentColor"} strokeWidth={isActive ? 2 : 1.75} />
              <span style={{ flex: 1 }}>{item.name}</span>
              {isActive && <ChevronRight size={14} color="var(--accent-gold)" style={{ opacity: 0.6 }} />}
            </NextLink>
          );
        })}
      </nav>

      {/* User */}
      <div style={{
        marginTop: "auto",
        paddingTop: "1rem",
        borderTop: "1px solid var(--border-color)",
      }}>
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "0.7rem",
          padding: "0.75rem",
          borderRadius: "10px",
          background: "rgba(255,255,255,0.03)",
          marginBottom: "0.5rem",
        }}>
          <div style={{
            width: "34px", height: "34px", borderRadius: "8px",
            background: "linear-gradient(135deg, rgba(201,162,39,0.3), rgba(201,162,39,0.1))",
            border: "1px solid rgba(201,162,39,0.25)",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
            fontSize: "0.85rem",
            fontWeight: 700,
            color: "var(--accent-gold)",
          }}>
            {initials}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            {userName && (
              <p style={{ fontSize: "0.82rem", fontWeight: 600, color: "#fff", lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {userName}
              </p>
            )}
            <p style={{
              fontSize: "0.72rem",
              color: "var(--text-muted)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
              {userEmail ?? "Carregando..."}
            </p>
          </div>
        </div>

        <button
          onClick={handleLogout}
          disabled={loggingOut}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: "0.6rem",
            padding: "0.6rem 0.875rem",
            borderRadius: "8px",
            background: "transparent",
            border: "1px solid transparent",
            color: "var(--text-secondary)",
            fontSize: "0.82rem",
            cursor: loggingOut ? "not-allowed" : "pointer",
            transition: "all 0.18s",
            fontFamily: "var(--font-sans)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(239,68,68,0.07)";
            e.currentTarget.style.borderColor = "rgba(239,68,68,0.15)";
            e.currentTarget.style.color = "#f87171";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.borderColor = "transparent";
            e.currentTarget.style.color = "var(--text-secondary)";
          }}
        >
          <LogOut size={15} />
          {loggingOut ? "Saindo..." : "Sair da conta"}
        </button>
      </div>
    </aside>
    </>
  );
}
