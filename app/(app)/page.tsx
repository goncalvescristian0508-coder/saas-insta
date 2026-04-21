import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { CalendarClock, Clock, CheckCircle, Share2 } from "lucide-react";
import Link from "next/link";
import { StatCards, QuickActions } from "@/components/DashboardCards";

const statusConfig = {
  PENDING: { label: "Aguardando", color: "#c9a227", bg: "rgba(201,162,39,0.1)" },
  RUNNING: { label: "Postando", color: "#60a5fa", bg: "rgba(96,165,250,0.1)" },
  DONE: { label: "Publicado", color: "#4ade80", bg: "rgba(74,222,128,0.1)" },
  FAILED: { label: "Falhou", color: "#f87171", bg: "rgba(248,113,113,0.1)" },
} as const;

function formatDateTime(iso: Date) {
  return iso.toLocaleString("pt-BR", {
    day: "2-digit", month: "short",
    hour: "2-digit", minute: "2-digit",
  });
}

export default async function Dashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id ?? "anonymous";

  const [accounts, videos, schedules] = await Promise.all([
    prisma.instagramOAuthAccount.count({ where: { userId } }),
    prisma.libraryVideo.count({ where: { userId } }),
    prisma.scheduledPost.findMany({
      where: { userId },
      include: {
        account: { select: { username: true } },
        video: { select: { originalName: true } },
      },
      orderBy: { scheduledAt: "asc" },
      take: 8,
    }),
  ]);

  const pending = schedules.filter((s) => s.status === "PENDING").length;
  const done = schedules.filter((s) => s.status === "DONE").length;
  const firstName = user?.user_metadata?.name?.split(" ")[0] ?? "Usuário";

  return (
    <div>
      <div style={{ marginBottom: "2rem" }}>
        <h1 className="page-title">Olá, {firstName} 👋</h1>
        <p className="page-subtitle">Visão geral das suas operações no Instagram</p>
      </div>

      <StatCards accounts={accounts} videos={videos} pending={pending} done={done} />
      <QuickActions />

      {/* Schedule Table */}
      <div className="glass-panel" style={{ padding: "1.5rem", borderRadius: "14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
          <h2 style={{ fontSize: "1rem", fontWeight: 700 }}>Posts Recentes & Agendados</h2>
          <Link href="/schedule" style={{ fontSize: "0.8rem", color: "var(--accent-gold)", fontWeight: 600 }}>
            Ver todos
          </Link>
        </div>

        {schedules.length === 0 ? (
          <div style={{ textAlign: "center", padding: "2.5rem", background: "rgba(255,255,255,0.02)", borderRadius: "10px" }}>
            <CalendarClock size={32} color="var(--text-muted)" style={{ margin: "0 auto 0.75rem" }} />
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>
              Nenhum post agendado.{" "}
              <Link href="/schedule" style={{ color: "var(--accent-gold)" }}>Criar agendamento</Link>
            </p>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border-color)" }}>
                  {["Conta", "Vídeo", "Data/Hora", "Status"].map((h) => (
                    <th key={h} style={{
                      padding: "0.75rem 1rem", textAlign: "left",
                      fontSize: "0.75rem", fontWeight: 600,
                      color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em",
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {schedules.map((s, i) => {
                  const cfg = statusConfig[s.status as keyof typeof statusConfig];
                  return (
                    <tr key={s.id} style={{ borderBottom: i < schedules.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                      <td style={{ padding: "0.9rem 1rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                          <Share2 size={13} color="var(--accent-gold)" />
                          <span style={{ fontSize: "0.875rem", fontWeight: 500 }}>@{s.account.username}</span>
                        </div>
                      </td>
                      <td style={{ padding: "0.9rem 1rem" }}>
                        <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)", maxWidth: "180px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>
                          {s.video.originalName}
                        </span>
                      </td>
                      <td style={{ padding: "0.9rem 1rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                          <Clock size={12} color="var(--text-muted)" />
                          <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                            {formatDateTime(s.scheduledAt)}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: "0.9rem 1rem" }}>
                        <span style={{ padding: "3px 8px", borderRadius: "6px", fontSize: "0.72rem", fontWeight: 600, color: cfg.color, background: cfg.bg }}>
                          {cfg.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
