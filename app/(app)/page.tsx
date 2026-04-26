import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { Clock, Share2 } from "lucide-react";
import Link from "next/link";
import DashboardSales from "@/components/DashboardSales";
import AdminMessageBanner from "@/components/AdminMessageBanner";

const statusConfig = {
  PENDING: { label: "Aguardando", color: "#FFD54F",  bg: "rgba(255,213,79,0.1)" },
  RUNNING: { label: "Postando",   color: "#60a5fa",  bg: "rgba(96,165,250,0.1)" },
  DONE:    { label: "Publicado",  color: "#22c55e",  bg: "rgba(34,222,128,0.1)" },
  FAILED:  { label: "Falhou",     color: "#ef4444",  bg: "rgba(248,113,113,0.1)" },
} as const;

function formatDateTime(iso: Date) {
  return iso.toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default async function Dashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id ?? "anonymous";

  const [accounts, schedules] = await Promise.all([
    prisma.instagramOAuthAccount.count({ where: { userId } }),
    prisma.scheduledPost.findMany({
      where: { userId },
      include: {
        account: { select: { username: true } },
        video:   { select: { originalName: true } },
      },
      orderBy: { scheduledAt: "asc" },
      take: 8,
    }),
  ]);

  const firstName = user?.user_metadata?.name?.split(" ")[0] ?? "Usuário";
  const adminMessage = user?.user_metadata?.adminMessage ?? null;

  return (
    <div>
      {adminMessage && <AdminMessageBanner message={adminMessage} />}
      {/* Sales section — client component renders its own header row */}
      <DashboardSales accounts={accounts} firstName={firstName} />

      {/* Scheduled posts table */}
      <div className="panel" style={{ marginTop: 16 }}>
        <div style={{
          padding: "14px 18px",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: "#e0e0e0" }}>
            Posts Recentes & Agendados
          </div>
          <Link href="/schedule" style={{ fontSize: 12, color: "#FFD54F", fontWeight: 500 }}>
            Ver todos
          </Link>
        </div>

        {schedules.length === 0 ? (
          <div style={{ padding: "40px 18px", textAlign: "center" }}>
            <p style={{ color: "#444", fontSize: 13 }}>
              Nenhum post agendado.{" "}
              <Link href="/schedule" style={{ color: "#FFD54F" }}>Criar agendamento</Link>
            </p>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Conta", "Vídeo", "Data/Hora", "Status"].map((h) => (
                    <th key={h} style={{
                      padding: "10px 16px", textAlign: "left",
                      fontSize: 11, fontWeight: 600, color: "#444",
                      textTransform: "uppercase", letterSpacing: "0.07em",
                      borderBottom: "1px solid rgba(255,255,255,0.05)",
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {schedules.map((s, i) => {
                  const cfg = statusConfig[s.status as keyof typeof statusConfig] ?? statusConfig.PENDING;
                  return (
                    <tr key={s.id} style={{ borderBottom: i < schedules.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                      <td style={{ padding: "13px 16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <Share2 size={13} color="#FFD54F" />
                          <span style={{ fontSize: 13, fontWeight: 500 }}>@{s.account.username}</span>
                        </div>
                      </td>
                      <td style={{ padding: "13px 16px" }}>
                        <span style={{ fontSize: 13, color: "#888", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>
                          {s.video?.originalName ?? (s.rawVideoUrl ? "Reel clonado" : "—")}
                        </span>
                      </td>
                      <td style={{ padding: "13px 16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <Clock size={12} color="#444" />
                          <span style={{ fontSize: 13, color: "#555" }}>{formatDateTime(s.scheduledAt)}</span>
                        </div>
                      </td>
                      <td style={{ padding: "13px 16px" }}>
                        <span style={{
                          display: "inline-flex", alignItems: "center", gap: 5,
                          padding: "3px 10px", borderRadius: 20,
                          fontSize: 11.5, fontWeight: 600,
                          color: cfg.color, background: cfg.bg,
                        }}>
                          <span style={{ width: 5, height: 5, borderRadius: "50%", background: cfg.color, display: "inline-block" }} />
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
