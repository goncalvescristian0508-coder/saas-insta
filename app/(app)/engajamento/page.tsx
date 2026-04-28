"use client";

import { useState, useCallback } from "react";
import { Activity, RefreshCw, Loader2, AlertCircle, Users, Heart, MessageCircle, TrendingUp, Calendar, BarChart3 } from "lucide-react";

interface AccountInsight {
  id: string;
  username: string;
  profilePicUrl: string | null;
  followers: number;
  mediaCount: number;
  avgLikes: number;
  avgComments: number;
  engagementRate: number;
  postsAnalyzed: number;
  lastPostAt: string | null;
  status: "ok" | "error";
  error?: string;
}

function engagementLabel(rate: number): { label: string; color: string; bg: string } {
  if (rate >= 6) return { label: "Excelente", color: "#4ade80", bg: "rgba(74,222,128,0.12)" };
  if (rate >= 3) return { label: "Bom", color: "#60a5fa", bg: "rgba(96,165,250,0.12)" };
  if (rate >= 1) return { label: "Médio", color: "#f59e0b", bg: "rgba(245,158,11,0.12)" };
  return { label: "Baixo", color: "#f87171", bg: "rgba(248,113,113,0.12)" };
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default function EngajamentoPage() {
  const [accounts, setAccounts] = useState<AccountInsight[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/engagement");
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Erro ao carregar"); return; }
      setAccounts(data.accounts ?? []);
      setLoaded(true);
    } catch {
      setError("Erro de conexão");
    } finally {
      setLoading(false);
    }
  }, []);

  const okAccounts = accounts.filter((a) => a.status === "ok");
  const errAccounts = accounts.filter((a) => a.status === "error");

  const avgEngagement = okAccounts.length
    ? Math.round((okAccounts.reduce((s, a) => s + a.engagementRate, 0) / okAccounts.length) * 10) / 10
    : 0;
  const totalFollowers = okAccounts.reduce((s, a) => s + a.followers, 0);
  const bestAccount = okAccounts[0] ?? null;

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "2rem" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.35rem" }}>
            <Activity size={22} color="var(--accent-gold)" />
            <h1 className="page-title" style={{ marginBottom: 0 }}>Engajamento</h1>
          </div>
          <p className="page-subtitle">Métricas reais das suas contas Instagram via Graph API</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="btn btn-primary"
          style={{ display: "flex", alignItems: "center", gap: "0.5rem", minWidth: 130 }}
        >
          {loading
            ? <><Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} /> Buscando...</>
            : <><RefreshCw size={15} /> {loaded ? "Atualizar" : "Carregar dados"}</>}
        </button>
      </div>

      {!loaded && !loading && (
        <div className="glass-panel" style={{ padding: "3rem", borderRadius: "14px", textAlign: "center" }}>
          <BarChart3 size={40} color="var(--text-muted)" style={{ margin: "0 auto 1rem" }} />
          <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem", marginBottom: "0.5rem" }}>
            Clique em <strong style={{ color: "#fff" }}>Carregar dados</strong> para buscar as métricas das suas contas
          </p>
          <p style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>
            Os dados são buscados em tempo real na API do Instagram
          </p>
        </div>
      )}

      {error && (
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", color: "#f87171", fontSize: "0.85rem", marginBottom: "1rem" }}>
          <AlertCircle size={15} /> {error}
        </div>
      )}

      {loaded && accounts.length === 0 && (
        <div className="glass-panel" style={{ padding: "2rem", borderRadius: "14px", textAlign: "center", color: "var(--text-secondary)" }}>
          Nenhuma conta ativa encontrada. Conecte contas em <a href="/accounts" style={{ color: "var(--accent-gold)" }}>Contas</a>.
        </div>
      )}

      {loaded && accounts.length > 0 && (
        <>
          {/* Summary cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem", marginBottom: "1.75rem" }}>
            {[
              {
                label: "Engajamento médio",
                value: `${avgEngagement}%`,
                icon: <TrendingUp size={18} color="#4ade80" />,
                color: "#4ade80",
                sub: `${okAccounts.length} conta(s) analisada(s)`,
              },
              {
                label: "Total de seguidores",
                value: fmt(totalFollowers),
                icon: <Users size={18} color="#60a5fa" />,
                color: "#60a5fa",
                sub: "soma de todas as contas",
              },
              {
                label: "Melhor conta",
                value: bestAccount ? `${bestAccount.engagementRate}%` : "—",
                icon: <Activity size={18} color="var(--accent-gold)" />,
                color: "var(--accent-gold)",
                sub: bestAccount ? `@${bestAccount.username}` : "sem dados",
              },
            ].map((card) => (
              <div key={card.label} className="glass-panel" style={{ padding: "1.25rem 1.5rem", borderRadius: "12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.6rem" }}>
                  {card.icon}
                  <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em" }}>{card.label}</span>
                </div>
                <div style={{ fontSize: "1.75rem", fontWeight: 800, color: card.color, lineHeight: 1 }}>{card.value}</div>
                <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "0.35rem" }}>{card.sub}</div>
              </div>
            ))}
          </div>

          {/* Account cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "1rem" }}>
            {accounts.map((account) => {
              if (account.status === "error") {
                return (
                  <div key={account.id} className="glass-panel" style={{ padding: "1.25rem", borderRadius: "12px", opacity: 0.65 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem" }}>
                      <div style={{ width: 40, height: 40, borderRadius: "50%", background: "rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.1rem", fontWeight: 700, color: "var(--text-muted)", flexShrink: 0 }}>
                        {account.username[0].toUpperCase()}
                      </div>
                      <div>
                        <p style={{ fontWeight: 700, fontSize: "0.9rem" }}>@{account.username}</p>
                        <p style={{ fontSize: "0.72rem", color: "#f87171", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                          <AlertCircle size={11} /> {account.error}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              }

              const eng = engagementLabel(account.engagementRate);
              return (
                <div key={account.id} className="glass-panel" style={{ padding: "1.25rem", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.06)" }}>
                  {/* Account header */}
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
                    {account.profilePicUrl ? (
                      <img
                        src={`/api/media/proxy?url=${encodeURIComponent(account.profilePicUrl)}`}
                        alt={account.username}
                        style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover", border: "2px solid rgba(255,255,255,0.1)", flexShrink: 0 }}
                      />
                    ) : (
                      <div style={{ width: 44, height: 44, borderRadius: "50%", background: "rgba(201,162,39,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.1rem", fontWeight: 700, color: "var(--accent-gold)", flexShrink: 0 }}>
                        {account.username[0].toUpperCase()}
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontWeight: 700, fontSize: "0.92rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>@{account.username}</p>
                      <p style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                        {fmt(account.followers)} seguidores · {account.mediaCount} posts
                      </p>
                    </div>
                    <span style={{ padding: "0.25rem 0.65rem", borderRadius: "6px", fontSize: "0.72rem", fontWeight: 700, color: eng.color, background: eng.bg, flexShrink: 0 }}>
                      {eng.label}
                    </span>
                  </div>

                  {/* Engagement rate bar */}
                  <div style={{ marginBottom: "1rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.35rem" }}>
                      <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>Taxa de engajamento</span>
                      <span style={{ fontSize: "0.82rem", fontWeight: 800, color: eng.color }}>{account.engagementRate}%</span>
                    </div>
                    <div style={{ height: "6px", borderRadius: "3px", background: "rgba(255,255,255,0.07)", overflow: "hidden" }}>
                      <div style={{
                        height: "100%",
                        width: `${Math.min(account.engagementRate / 10 * 100, 100)}%`,
                        borderRadius: "3px",
                        background: `linear-gradient(90deg, ${eng.color}, ${eng.color}88)`,
                        transition: "width 0.6s ease",
                      }} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.2rem" }}>
                      <span style={{ fontSize: "0.62rem", color: "var(--text-muted)" }}>0%</span>
                      <span style={{ fontSize: "0.62rem", color: "var(--text-muted)" }}>10%+</span>
                    </div>
                  </div>

                  {/* Stats grid */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                    {[
                      { icon: <Heart size={13} color="#f472b6" />, label: "Média likes", value: fmt(account.avgLikes) },
                      { icon: <MessageCircle size={13} color="#60a5fa" />, label: "Média comments", value: fmt(account.avgComments) },
                      { icon: <BarChart3 size={13} color="var(--accent-gold)" />, label: "Posts analisados", value: String(account.postsAnalyzed) },
                      { icon: <Calendar size={13} color="#a78bfa" />, label: "Último post", value: account.lastPostAt ? new Date(account.lastPostAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) : "—" },
                    ].map((stat) => (
                      <div key={stat.label} style={{ padding: "0.6rem 0.75rem", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "8px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", marginBottom: "0.25rem" }}>
                          {stat.icon}
                          <span style={{ fontSize: "0.65rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{stat.label}</span>
                        </div>
                        <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "#fff" }}>{stat.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Error accounts notice */}
          {errAccounts.length > 0 && (
            <div style={{ marginTop: "1rem", padding: "0.75rem 1rem", borderRadius: "10px", background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.15)", fontSize: "0.8rem", color: "var(--text-muted)" }}>
              <AlertCircle size={13} style={{ display: "inline", marginRight: "0.4rem" }} color="#f87171" />
              {errAccounts.length} conta(s) com erro — reconecte em <a href="/accounts" style={{ color: "var(--accent-gold)" }}>Contas</a>.
            </div>
          )}
        </>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
