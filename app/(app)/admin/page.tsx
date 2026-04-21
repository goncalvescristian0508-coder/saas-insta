"use client";

import { useEffect, useState } from "react";
import { Users, Share2, Film, CheckCircle2, XCircle, Clock, Shield, TrendingUp, Loader2 } from "lucide-react";

interface OAuthAccount {
  id: string; username: string; profilePictureUrl?: string;
  lastError?: string; createdAt: string;
}

interface UserRow {
  id: string; email: string; createdAt: string;
  oauthAccounts: OAuthAccount[];
  videoCount: number;
  postsTotal: number; postsDone: number; postsFailed: number;
  lastActivity: string | null;
}

interface RecentPost {
  id: string; userId: string; accountUsername: string;
  videoName: string; caption: string; status: string;
  scheduledAt: string; postedAt?: string; errorMsg?: string; createdAt: string;
}

interface Stats {
  totalUsers: number; totalOAuthAccounts: number;
  totalPrivateAccounts: number; totalVideos: number; totalPostsDone: number;
}

interface Overview {
  stats: Stats; users: UserRow[]; recentPosts: RecentPost[];
  privateAccounts: { id: string; username: string; lastError?: string; createdAt: string }[];
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "agora";
  if (m < 60) return `${m}m atrás`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h atrás`;
  return `${Math.floor(h / 24)}d atrás`;
}

const STATUS_COLOR: Record<string, string> = {
  DONE: "#22c55e", FAILED: "#ef4444", PENDING: "#f59e0b", RUNNING: "#3b82f6",
};
const STATUS_LABEL: Record<string, string> = {
  DONE: "Publicado", FAILED: "Falhou", PENDING: "Pendente", RUNNING: "Executando",
};

export default function AdminPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/overview")
      .then(async (r) => {
        if (!r.ok) { setErr((await r.json()).error ?? "Acesso negado"); return; }
        setData(await r.json());
      })
      .catch(() => setErr("Erro de conexão"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "60vh" }}>
      <Loader2 size={32} color="var(--accent-gold)" style={{ animation: "spin 1s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (err) return (
    <div style={{ textAlign: "center", padding: "4rem", color: "#f87171" }}>
      <Shield size={48} style={{ margin: "0 auto 1rem" }} />
      <p style={{ fontSize: "1.1rem", fontWeight: 600 }}>{err}</p>
    </div>
  );

  if (!data) return null;
  const { stats, users, recentPosts, privateAccounts } = data;

  const statCards = [
    { label: "Usuários", value: stats.totalUsers, icon: Users, color: "#c9a227" },
    { label: "Contas OAuth", value: stats.totalOAuthAccounts, icon: Share2, color: "#a855f7" },
    { label: "Vídeos na biblioteca", value: stats.totalVideos, icon: Film, color: "#3b82f6" },
    { label: "Posts publicados", value: stats.totalPostsDone, icon: TrendingUp, color: "#22c55e" },
  ];

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "2rem" }}>
        <div style={{
          width: 48, height: 48, borderRadius: 12,
          background: "linear-gradient(135deg,rgba(201,162,39,.3),rgba(201,162,39,.1))",
          border: "1px solid rgba(201,162,39,.3)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Shield size={22} color="var(--accent-gold)" />
        </div>
        <div>
          <h1 className="page-title" style={{ marginBottom: 0 }}>Painel Admin</h1>
          <p className="page-subtitle" style={{ marginBottom: 0 }}>Visão geral de todos os usuários e contas</p>
        </div>
      </div>

      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "1rem", marginBottom: "2rem" }}>
        {statCards.map((c) => (
          <div key={c.label} className="glass-panel" style={{ padding: "1.25rem", borderRadius: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: ".4rem" }}>{c.label}</p>
                <p style={{ fontSize: "2rem", fontWeight: 700, color: c.color }}>{c.value}</p>
              </div>
              <div style={{ padding: 10, borderRadius: 10, background: `${c.color}18` }}>
                <c.icon size={20} color={c.color} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: "1.5rem", alignItems: "start" }}>
        {/* Users table */}
        <div className="glass-panel" style={{ borderRadius: 14, overflow: "hidden" }}>
          <div style={{ padding: "1.25rem 1.5rem", borderBottom: "1px solid var(--border-color)" }}>
            <h3 style={{ fontSize: "0.95rem", fontWeight: 700 }}>Usuários ({users.length})</h3>
          </div>
          <div style={{ maxHeight: 480, overflowY: "auto" }}>
            {users.map((u) => (
              <div key={u.id} style={{
                padding: "1rem 1.5rem",
                borderBottom: "1px solid rgba(255,255,255,0.04)",
                display: "flex", flexDirection: "column", gap: ".5rem",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <p style={{ fontWeight: 600, fontSize: ".875rem" }}>{u.email}</p>
                  <span style={{ fontSize: ".7rem", color: "var(--text-muted)" }}>
                    {new Date(u.createdAt).toLocaleDateString("pt-BR")}
                  </span>
                </div>

                {/* Instagram accounts */}
                {u.oauthAccounts.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: ".4rem" }}>
                    {u.oauthAccounts.map((acc) => (
                      <div key={acc.id} style={{
                        display: "flex", alignItems: "center", gap: ".35rem",
                        padding: "3px 8px", borderRadius: 99, fontSize: ".75rem",
                        background: acc.lastError ? "rgba(239,68,68,.1)" : "rgba(34,197,94,.1)",
                        border: `1px solid ${acc.lastError ? "rgba(239,68,68,.2)" : "rgba(34,197,94,.2)"}`,
                        color: acc.lastError ? "#f87171" : "#4ade80",
                      }}>
                        {acc.profilePictureUrl
                          ? <img src={acc.profilePictureUrl} alt="" style={{ width: 16, height: 16, borderRadius: "50%", objectFit: "cover" }} />
                          : <Share2 size={11} />}
                        @{acc.username}
                        {acc.lastError && <XCircle size={11} />}
                      </div>
                    ))}
                  </div>
                )}

                {u.oauthAccounts.length === 0 && (
                  <p style={{ fontSize: ".75rem", color: "var(--text-muted)" }}>Nenhuma conta conectada</p>
                )}

                {/* Mini stats */}
                <div style={{ display: "flex", gap: "1rem" }}>
                  <span style={{ fontSize: ".72rem", color: "var(--text-muted)" }}>
                    <Film size={10} style={{ display: "inline", marginRight: 3 }} />{u.videoCount} vídeo(s)
                  </span>
                  <span style={{ fontSize: ".72rem", color: "#22c55e" }}>
                    <CheckCircle2 size={10} style={{ display: "inline", marginRight: 3 }} />{u.postsDone} publicado(s)
                  </span>
                  {u.postsFailed > 0 && (
                    <span style={{ fontSize: ".72rem", color: "#f87171" }}>
                      <XCircle size={10} style={{ display: "inline", marginRight: 3 }} />{u.postsFailed} falha(s)
                    </span>
                  )}
                  {u.lastActivity && (
                    <span style={{ fontSize: ".72rem", color: "var(--text-muted)" }}>
                      <Clock size={10} style={{ display: "inline", marginRight: 3 }} />{timeAgo(u.lastActivity)}
                    </span>
                  )}
                </div>
              </div>
            ))}
            {users.length === 0 && (
              <p style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)", fontSize: ".875rem" }}>
                Nenhum usuário cadastrado
              </p>
            )}
          </div>
        </div>

        {/* Recent posts */}
        <div className="glass-panel" style={{ borderRadius: 14, overflow: "hidden" }}>
          <div style={{ padding: "1.25rem 1.5rem", borderBottom: "1px solid var(--border-color)" }}>
            <h3 style={{ fontSize: "0.95rem", fontWeight: 700 }}>Atividade Recente</h3>
          </div>
          <div style={{ maxHeight: 480, overflowY: "auto" }}>
            {recentPosts.map((p) => (
              <div key={p.id} style={{
                padding: ".85rem 1.25rem",
                borderBottom: "1px solid rgba(255,255,255,0.04)",
                display: "flex", flexDirection: "column", gap: ".3rem",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 600, fontSize: ".8rem" }}>@{p.accountUsername}</span>
                  <span style={{
                    fontSize: ".68rem", padding: "2px 7px", borderRadius: 99,
                    background: `${STATUS_COLOR[p.status] ?? "#888"}18`,
                    border: `1px solid ${STATUS_COLOR[p.status] ?? "#888"}33`,
                    color: STATUS_COLOR[p.status] ?? "#888",
                  }}>
                    {STATUS_LABEL[p.status] ?? p.status}
                  </span>
                </div>
                <p style={{ fontSize: ".75rem", color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {p.videoName}
                </p>
                {p.caption && (
                  <p style={{ fontSize: ".72rem", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    "{p.caption}"
                  </p>
                )}
                {p.errorMsg && (
                  <p style={{ fontSize: ".7rem", color: "#f87171" }}>{p.errorMsg}</p>
                )}
                <p style={{ fontSize: ".68rem", color: "var(--text-muted)" }}>{timeAgo(p.createdAt)}</p>
              </div>
            ))}
            {recentPosts.length === 0 && (
              <p style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)", fontSize: ".875rem" }}>
                Nenhuma atividade ainda
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Private accounts (if any) */}
      {privateAccounts.length > 0 && (
        <div className="glass-panel" style={{ borderRadius: 14, overflow: "hidden", marginTop: "1.5rem" }}>
          <div style={{ padding: "1.25rem 1.5rem", borderBottom: "1px solid var(--border-color)" }}>
            <h3 style={{ fontSize: "0.95rem", fontWeight: 700 }}>Contas Privadas ({privateAccounts.length})</h3>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: ".75rem", padding: "1.25rem" }}>
            {privateAccounts.map((a) => (
              <div key={a.id} style={{
                display: "flex", alignItems: "center", gap: ".5rem",
                padding: ".5rem .85rem", borderRadius: 10, fontSize: ".8rem",
                background: a.lastError ? "rgba(239,68,68,.07)" : "rgba(255,255,255,.04)",
                border: `1px solid ${a.lastError ? "rgba(239,68,68,.2)" : "rgba(255,255,255,.08)"}`,
              }}>
                <Share2 size={13} color={a.lastError ? "#f87171" : "var(--text-secondary)"} />
                <span>@{a.username}</span>
                {a.lastError && <XCircle size={12} color="#f87171" />}
              </div>
            ))}
          </div>
        </div>
      )}

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
