import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { Clock, CalendarClock } from "lucide-react";
import Link from "next/link";
import DashboardSales from "@/components/DashboardSales";
import AdminMessageBanner from "@/components/AdminMessageBanner";

const STATUS_CFG = {
  PENDING: { label: "Aguardando", cls: "amber" },
  RUNNING: { label: "Postando",   cls: "blue"  },
  DONE:    { label: "Publicado",  cls: "green" },
  FAILED:  { label: "Falhou",     cls: "red"   },
} as const;

const STATUS_DOTS: Record<string, string> = {
  PENDING: "#FFB800",
  RUNNING: "#60a5fa",
  DONE:    "#4ade80",
  FAILED:  "#f87171",
};

function fmtDT(iso: Date) {
  return iso.toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

const AVATAR_COLORS = ["#7c3aed","#0ea5e9","#10b981","#f59e0b","#ef4444","#ec4899","#6366f1","#14b8a6"];
function avatarColor(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

export default async function Dashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id ?? "anonymous";

  const [, schedules] = await Promise.all([
    Promise.resolve(),
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

  const firstName    = user?.user_metadata?.name?.split(" ")[0] ?? "Usuário";
  const adminMessage = user?.user_metadata?.adminMessage ?? null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {adminMessage && <AdminMessageBanner message={adminMessage} />}

      <DashboardSales firstName={firstName} />

      {/* ── Agendamentos recentes ── */}
      <div style={{
        background: "#0d0d0d",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 9, overflow: "hidden",
        marginLeft: 0,
      }}>
        <div style={{
          padding: "11px 18px",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span style={{ fontSize: 12.5, fontWeight: 500, color: "#d4d4d4" }}>Agendamentos Recentes</span>
          <Link href="/schedule" style={{ fontSize: 11, color: "#444" }}>Ver todos</Link>
        </div>

        {schedules.length === 0 ? (
          <div style={{ padding: "28px 18px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 8, border: "1px solid rgba(255,255,255,0.06)",
              display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 2,
            }}>
              <CalendarClock size={16} color="#444" strokeWidth={1.5} />
            </div>
            <span style={{ fontSize: 13, fontWeight: 500, color: "#6c6c6c" }}>Nenhum post agendado</span>
            <span style={{ fontSize: 12, color: "#333", textAlign: "center", maxWidth: 260, lineHeight: 1.5 }}>
              Agende posts nas suas contas do Instagram para eles aparecerem aqui.
            </span>
            <Link href="/schedule" style={{
              marginTop: 4, padding: "5px 11px", borderRadius: 6,
              background: "#111", border: "1px solid rgba(255,255,255,0.06)",
              fontSize: 12.5, color: "#a0a0a0", fontWeight: 500,
            }}>
              Criar agendamento
            </Link>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  {["Conta", "Vídeo", "Data / Hora", "Status"].map(h => <th key={h}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {schedules.map(s => {
                  const cfg = STATUS_CFG[s.status as keyof typeof STATUS_CFG] ?? STATUS_CFG.PENDING;
                  const dot = STATUS_DOTS[s.status] ?? STATUS_DOTS.PENDING;
                  const uname = s.account.username;
                  const color = avatarColor(uname);
                  return (
                    <tr key={s.id}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{
                            width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                            background: color, display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 9.5, fontWeight: 700, color: "#fff",
                          }}>
                            {uname.slice(0,2).toUpperCase()}
                          </div>
                          <span style={{ fontSize: 12.5, fontWeight: 500, color: "#d4d4d4" }}>
                            @{uname}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span style={{
                          fontSize: 12.5, color: "#6c6c6c",
                          maxWidth: 200, overflow: "hidden",
                          textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block",
                        }}>
                          {s.video?.originalName ?? (s.rawVideoUrl ? "Reel clonado" : "—")}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <Clock size={11} color="#333" />
                          <span style={{ fontSize: 12, color: "#444", fontFamily: "var(--font-mono)" }}>
                            {fmtDT(s.scheduledAt)}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className={`pill ${cfg.cls}`}>
                          <span className="pill-dot" style={{ background: dot }} />
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
