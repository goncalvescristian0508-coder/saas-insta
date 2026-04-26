"use client";

import NextLink from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  LayoutDashboard, Users, Tag, AlertTriangle,
  Activity, Megaphone, LogOut, ChevronRight, Shield, ExternalLink,
} from "lucide-react";
import { useState, useEffect, Suspense } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

const navItems = [
  { name: "Painel Geral",    tab: "dashboard", icon: LayoutDashboard },
  { name: "Usuários",        tab: "usuarios",  icon: Users },
  { name: "Planos",          tab: "planos",    icon: Tag },
  { name: "Erros de Conta",  tab: "erros",     icon: AlertTriangle },
  { name: "Registros",       tab: "logs",      icon: Activity },
  { name: "Mensagem Global", tab: "mensagem",  icon: Megaphone },
];

function SidebarInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const activeTab = searchParams.get("tab") ?? "dashboard";
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userName,  setUserName]  = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => {
      if (data.user) {
        setUserEmail(data.user.email ?? null);
        setUserName(data.user.user_metadata?.name ?? null);
      }
    });
  }, []);

  const initials = userName
    ? userName.split(" ").map((n: string) => n[0]).slice(0, 2).join("").toUpperCase()
    : userEmail?.[0]?.toUpperCase() ?? "A";

  async function handleLogout() {
    setLoggingOut(true);
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside style={{
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
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <div style={{ width: 36, height: 36, borderRadius: 9, background: "linear-gradient(135deg,rgba(255,213,79,.25),rgba(255,213,79,.08))", border: "1px solid rgba(255,213,79,.25)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Shield size={16} color="#FFD54F" />
          </div>
          <div>
            <h1 style={{ fontFamily: "var(--font-sans)", fontSize: "1rem", fontWeight: 800, color: "#fff", letterSpacing: "-0.02em", lineHeight: 1 }}>
              <span style={{ color: "#FFD54F" }}>Painel</span> Admin
            </h1>
            <p style={{ fontSize: "0.65rem", color: "#555", marginTop: 2 }}>AutoPost</p>
          </div>
        </div>
      </div>

      <p style={{ fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-muted)", paddingLeft: "0.75rem", marginBottom: "0.5rem" }}>
        Gestão
      </p>

      {/* Nav */}
      <nav style={{ display: "flex", flexDirection: "column", gap: "0.25rem", flex: 1 }}>
        {navItems.map((item) => {
          const isActive = activeTab === item.tab;
          return (
            <NextLink key={item.tab} href={`/admin?tab=${item.tab}`}
              style={{
                display: "flex", alignItems: "center", gap: "0.75rem",
                padding: "0.7rem 0.875rem", borderRadius: "10px",
                color: isActive ? "#fff" : "var(--text-secondary)",
                backgroundColor: isActive ? "rgba(255,213,79,0.11)" : "transparent",
                border: isActive ? "1px solid rgba(255,213,79,0.2)" : "1px solid transparent",
                transition: "all 0.18s", fontWeight: isActive ? 600 : 500,
                fontSize: "0.875rem", textDecoration: "none",
              }}
              onMouseEnter={e => { if (!isActive) { e.currentTarget.style.backgroundColor = "rgba(255,213,79,0.055)"; e.currentTarget.style.color = "#fff"; } }}
              onMouseLeave={e => { if (!isActive) { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = "var(--text-secondary)"; } }}
            >
              <item.icon size={17} color={isActive ? "#FFD54F" : "currentColor"} strokeWidth={isActive ? 2 : 1.75} />
              <span style={{ flex: 1 }}>{item.name}</span>
              {isActive && <ChevronRight size={14} color="#FFD54F" style={{ opacity: 0.6 }} />}
            </NextLink>
          );
        })}

        {/* Separator + link back to user app */}
        <div style={{ height: 1, background: "rgba(255,255,255,0.05)", margin: "0.5rem 0.875rem" }} />
        <NextLink href="/"
          style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.7rem 0.875rem", borderRadius: "10px", color: "var(--text-muted)", border: "1px solid transparent", fontSize: "0.875rem", textDecoration: "none", fontWeight: 500 }}
          onMouseEnter={e => { e.currentTarget.style.color = "#fff"; e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.04)"; }}
          onMouseLeave={e => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.backgroundColor = "transparent"; }}
        >
          <ExternalLink size={17} strokeWidth={1.75} />
          <span>Painel Usuário</span>
        </NextLink>
      </nav>

      {/* Bottom */}
      <div style={{ marginTop: "1rem", borderTop: "1px solid var(--border-color)", paddingTop: "1rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.7rem", padding: "0.6rem 0", marginBottom: "0.25rem" }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg,rgba(255,213,79,0.3),rgba(255,213,79,0.1))", border: "1px solid rgba(255,213,79,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.8rem", fontWeight: 700, color: "#FFD54F", flexShrink: 0 }}>
            {initials}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            {userName && <p style={{ fontSize: "0.8rem", fontWeight: 600, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{userName}</p>}
            <p style={{ fontSize: "0.7rem", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{userEmail ?? "..."}</p>
          </div>
        </div>
        <button onClick={handleLogout} disabled={loggingOut}
          style={{ width: "100%", display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.5rem 0.25rem", borderRadius: "6px", background: "transparent", border: "none", color: "var(--text-secondary)", fontSize: "0.82rem", cursor: loggingOut ? "not-allowed" : "pointer", fontFamily: "var(--font-sans)" }}
          onMouseEnter={e => { e.currentTarget.style.color = "#f87171"; }}
          onMouseLeave={e => { e.currentTarget.style.color = "var(--text-secondary)"; }}
        >
          <LogOut size={14} />
          {loggingOut ? "Saindo..." : "Sair da conta"}
        </button>
      </div>
    </aside>
  );
}

export default function AdminSidebar() {
  return (
    <Suspense fallback={null}>
      <SidebarInner />
    </Suspense>
  );
}
