"use client";

import NextLink from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  LayoutDashboard, Users, Tag, AlertTriangle,
  Activity, Megaphone, LogOut, Shield, ExternalLink, UserCheck, UserPlus,
} from "lucide-react";
import { useState, useEffect, Suspense } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

const navItems = [
  { name: "Painel Geral",    tab: "dashboard",  icon: LayoutDashboard },
  { name: "Aprovações",      tab: "aprovacoes", icon: UserPlus },
  { name: "Usuários",        tab: "usuarios",   icon: Users },
  { name: "Planos",          tab: "planos",     icon: Tag },
  { name: "Erros de Conta",  tab: "erros",      icon: AlertTriangle },
  { name: "Registros",       tab: "logs",       icon: Activity },
  { name: "Mensagem Global", tab: "mensagem",   icon: Megaphone },
  { name: "Testadores IG",   tab: "testadores", icon: UserCheck },
];

function AdminNavItem({
  href, active, icon: Icon, label,
}: {
  href: string; active: boolean; icon: React.ElementType; label: string;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <NextLink
      href={href}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "5px 10px 5px 8px", margin: "0 8px", borderRadius: 6,
        borderLeft: active ? "2px solid #FFB800" : "2px solid transparent",
        color: active ? "#FFB800" : hovered ? "#ededed" : "#a0a0a0",
        background: active ? "rgba(255,184,0,0.08)" : hovered ? "rgba(255,255,255,0.04)" : "transparent",
        fontWeight: active ? 500 : 400,
        fontSize: 13,
        transition: "background 0.1s, color 0.1s, border-color 0.1s",
        textDecoration: "none",
      }}
    >
      <Icon size={14} strokeWidth={active ? 2 : 1.75} color={active ? "#FFB800" : "currentColor"} style={{ flexShrink: 0, opacity: active ? 1 : hovered ? 0.8 : 0.6 }} />
      <span>{label}</span>
    </NextLink>
  );
}

function SidebarInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const activeTab = searchParams.get("tab") ?? "dashboard";
  const [userEmail,  setUserEmail]  = useState<string | null>(null);
  const [userName,   setUserName]   = useState<string | null>(null);
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
      width: 232,
      background: "#0d0d0d",
      borderRight: "1px solid rgba(255,255,255,0.06)",
      height: "100vh",
      position: "fixed", left: 0, top: 0,
      display: "flex", flexDirection: "column",
      zIndex: 19,
      overflow: "hidden",
    }}>
      {/* Logo */}
      <div style={{ padding: "18px 16px 10px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 7,
            background: "rgba(255,255,255,0.07)",
            border: "1px solid rgba(255,255,255,0.09)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Shield size={14} color="#A1A1AA" strokeWidth={1.75} />
          </div>
          <div>
            <span style={{ fontSize: 15, fontWeight: 600, color: "#F4F4F5", letterSpacing: "-0.02em" }}>
              Admin
            </span>
            <p style={{ fontSize: 10.5, color: "#52525B", marginTop: 1 }}>AutoPost</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{
        flex: 1, overflowY: "auto", overflowX: "hidden",
        padding: "4px 8px",
        display: "flex", flexDirection: "column",
      }}>
        <p style={{
          fontSize: 10, fontWeight: 600, letterSpacing: "0.09em",
          textTransform: "uppercase", color: "#52525B",
          padding: "10px 10px 4px", lineHeight: 1,
        }}>
          Gestão
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {navItems.map((item) => (
            <AdminNavItem
              key={item.tab}
              href={`/admin?tab=${item.tab}`}
              active={activeTab === item.tab}
              icon={item.icon}
              label={item.name}
            />
          ))}
        </div>

        <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "10px 8px" }} />

        <AdminNavItem href="/" active={false} icon={ExternalLink} label="Painel Usuário" />
      </nav>

      {/* Bottom */}
      <div style={{
        flexShrink: 0,
        padding: "12px 14px 18px",
        borderTop: "1px solid rgba(255,255,255,0.07)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 8 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 8,
            background: "rgba(255,255,255,0.07)",
            border: "1px solid rgba(255,255,255,0.09)",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0, fontSize: 11, fontWeight: 600, color: "#A1A1AA",
          }}>
            {initials}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            {userName && (
              <p style={{ fontSize: 12.5, fontWeight: 500, color: "#E4E4E7", lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {userName}
              </p>
            )}
            <p style={{ fontSize: 11, color: "#52525B", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {userEmail ?? "..."}
            </p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          style={{
            width: "100%", display: "flex", alignItems: "center", gap: 7,
            padding: "5px 8px", borderRadius: 6,
            background: "transparent", border: "none",
            color: "#52525B", fontSize: 12.5,
            cursor: loggingOut ? "not-allowed" : "pointer",
            fontFamily: "inherit", transition: "color 0.15s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "#F87171"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "#52525B"; }}
        >
          <LogOut size={13} />
          {loggingOut ? "Saindo..." : "Sair"}
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
