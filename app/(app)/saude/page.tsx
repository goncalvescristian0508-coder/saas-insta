"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Activity, RefreshCw, Zap, CheckCircle2, Clock,
  AlertTriangle, XCircle, Search, TrendingUp, ShieldAlert,
} from "lucide-react";

type QueueStats = {
  running: number; pending: number; postedLastHour: number;
  overdue: number; stuckRunning: number;
};
type Totals = {
  postsOk: number; igErrors: number; rateLimitErrors: number;
  otherErrors: number; successRate: number;
};
type AccountStat = {
  id: string; username: string; accountStatus: string;
  quarantinedUntil: string | null;
  pendingCount: number; postsOk: number; igErrors: number;
  rateLimitErrors: number; otherErrors: number;
  total: number; successRate: number;
};
type HealthData = {
  queue: QueueStats; totals: Totals;
  accounts: AccountStat[]; totalAccounts: number;
  lastUpdated: string;
};

const REFRESH_INTERVAL = 10_000;

function fmt(d: Date) {
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function statusColor(s: string) {
  if (s === "ACTIVE") return "#4ade80";
  if (s === "QUARANTINE") return "#fb923c";
  return "#f87171"; // SUSPENDED
}
function statusLabel(s: string) {
  if (s === "ACTIVE") return "Ativa";
  if (s === "QUARANTINE") return "Quarentena";
  return "Suspensa";
}

function LiveDot() {
  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center", marginRight: "0.5rem" }}>
      <span style={{
        width: 8, height: 8, borderRadius: "50%", background: "#4ade80",
        display: "inline-block", animation: "livePulse 1.5s ease-in-out infinite",
      }} />
      <style>{`
        @keyframes livePulse {
          0%,100% { opacity: 1; transform: scale(1); box-shadow: 0 0 0 0 rgba(74,222,128,0.4); }
          50% { opacity: 0.85; transform: scale(1.15); box-shadow: 0 0 0 5px rgba(74,222,128,0); }
        }
      `}</style>
    </span>
  );
}

function QCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: number; sub: string; icon: React.ElementType; color: string;
}) {
  return (
    <div style={{
      flex: 1, minWidth: 140,
      background: "rgba(255,255,255,0.03)",
      border: `1px solid rgba(255,255,255,0.07)`,
      borderTop: `2px solid ${color}`,
      borderRadius: 12, padding: "1rem 1.1rem",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.4rem" }}>
        <span style={{ fontSize: "0.67rem", fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</span>
        <Icon size={13} color={color} />
      </div>
      <div style={{ fontSize: "2rem", fontWeight: 800, color: "#fff", lineHeight: 1 }}>{value.toLocaleString("pt-BR")}</div>
      <div style={{ fontSize: "0.68rem", color: "#555", marginTop: "0.3rem" }}>{sub}</div>
    </div>
  );
}

function StatPill({ label, value, color, icon: Icon }: {
  label: string; value: string | number; color: string; icon: React.ElementType;
}) {
  return (
    <div style={{
      flex: 1, minWidth: 0,
      background: "rgba(255,255,255,0.03)",
      border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 10, padding: "0.85rem 1rem",
      display: "flex", flexDirection: "column", gap: "0.2rem",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
        <Icon size={12} color={color} />
        <span style={{ fontSize: "0.65rem", color: "#555", fontWeight: 500 }}>{label}</span>
      </div>
      <span style={{ fontSize: "1.45rem", fontWeight: 800, color }}>{value}</span>
    </div>
  );
}

export default function SaudePage() {
  const [data, setData]         = useState<HealthData | null>(null);
  const [loading, setLoading]   = useState(true);
  const [unlocking, setUnlocking] = useState(false);
  const [lastRead, setLastRead] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL / 1000);
  const [filter, setFilter]     = useState("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countRef    = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    try {
      const r = await fetch("/api/health");
      if (r.ok) { setData(await r.json()); setLastRead(new Date()); }
    } finally {
      setLoading(false);
      setCountdown(REFRESH_INTERVAL / 1000);
    }
  }, []);

  useEffect(() => {
    load(true);
    intervalRef.current = setInterval(() => load(), REFRESH_INTERVAL);
    countRef.current = setInterval(() => setCountdown(c => Math.max(0, c - 1)), 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (countRef.current)    clearInterval(countRef.current);
    };
  }, [load]);

  async function handleUnlock() {
    setUnlocking(true);
    try { await fetch("/api/health", { method: "POST" }); await load(true); }
    finally { setUnlocking(false); }
  }

  const filtered = (data?.accounts ?? []).filter(a =>
    !filter || a.username.toLowerCase().includes(filter.toLowerCase()),
  );

  const panel: React.CSSProperties = {
    background: "rgba(255,255,255,0.025)",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 14, padding: "1.25rem 1.5rem", marginBottom: "1rem",
  };
  const sectionLabel: React.CSSProperties = {
    fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.14em",
    textTransform: "uppercase", color: "#555", marginBottom: "1rem",
    display: "flex", alignItems: "center", gap: "0.35rem",
  };

  const suspended = (data?.accounts ?? []).filter(a => a.accountStatus === "SUSPENDED");
  const quarantined = (data?.accounts ?? []).filter(a => a.accountStatus === "QUARANTINE");

  return (
    <main style={{ padding: "2rem 2.5rem", maxWidth: 1100 }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.2rem" }}>
            <Activity size={20} color="#FFB800" />
            <h1 style={{ fontSize: 18, fontWeight: 700, color: "#ededed", letterSpacing: "-0.025em", margin: 0 }}>Saúde das Contas</h1>
          </div>
          <p style={{ fontSize: 12, color: "#444", margin: 0 }}>
            Monitoramento em tempo real · {data?.totalAccounts ?? 0} contas conectadas
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{ fontSize: "0.7rem", color: "#444" }}>
            próximo refresh em {countdown}s
          </span>
          <button onClick={() => load(true)}
            style={{
              display: "flex", alignItems: "center", gap: "0.4rem",
              padding: "0.5rem 1rem", borderRadius: 8,
              background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)",
              color: "#ededed", fontSize: "0.8rem", fontWeight: 600, cursor: "pointer",
            }}>
            <RefreshCw size={13} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
            Atualizar
          </button>
        </div>
      </div>

      {/* Unlock stuck queue banner */}
      {(data?.queue.stuckRunning ?? 0) > 0 && (
        <button onClick={handleUnlock} disabled={unlocking} style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem",
          padding: "0.8rem", borderRadius: 10, marginBottom: "1rem",
          background: "rgba(255,184,0,0.1)", border: "1px solid rgba(255,184,0,0.25)",
          color: "#FFB800", fontSize: "0.82rem", fontWeight: 600, cursor: unlocking ? "not-allowed" : "pointer",
        }}>
          <Zap size={14} />
          Destravar fila ({data?.queue.stuckRunning} post{(data?.queue.stuckRunning ?? 0) > 1 ? "s" : ""} travado{(data?.queue.stuckRunning ?? 0) > 1 ? "s" : ""} há +5min)
        </button>
      )}

      {/* Fila ao vivo */}
      <div style={panel}>
        <div style={sectionLabel}>
          <LiveDot />
          Fila ao vivo
          {lastRead && (
            <span style={{ marginLeft: "auto", fontWeight: 400, letterSpacing: 0, textTransform: "none", fontSize: "0.68rem", color: "#444" }}>
              última leitura {fmt(lastRead)}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
          <QCard label="Em execução"   value={data?.queue.running ?? 0}       sub="Enviando ao Instagram agora" icon={Zap}          color="#FFB800" />
          <QCard label="Publicados 1h" value={data?.queue.postedLastHour ?? 0} sub="Publicados na última hora"  icon={CheckCircle2} color="#4ade80" />
          <QCard label="Pendentes"     value={data?.queue.pending ?? 0}        sub="Aguardando próximo slot"    icon={Clock}        color="#60a5fa" />
          <QCard label="Atrasados"     value={data?.queue.overdue ?? 0}        sub="Passaram do horário agendado" icon={AlertTriangle} color="#fb923c" />
          <QCard label="Com erro"      value={data?.queue.stuckRunning ?? 0}   sub="Travados há mais de 5 min"  icon={XCircle}      color="#f87171" />
        </div>
      </div>

      {/* Contas com problema */}
      {(suspended.length > 0 || quarantined.length > 0) && (
        <div style={panel}>
          <div style={sectionLabel}>
            <ShieldAlert size={12} color="#fb923c" />
            Contas com problema
          </div>
          {suspended.length > 0 && (
            <div style={{ marginBottom: "0.75rem" }}>
              <p style={{ fontSize: "0.72rem", color: "#555", marginBottom: "0.4rem" }}>
                Suspensas — token expirado, reconecte:
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                {suspended.map(a => (
                  <span key={a.id} style={{
                    padding: "0.25rem 0.65rem", borderRadius: 999,
                    background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.25)",
                    color: "#f87171", fontSize: "0.75rem", fontWeight: 600,
                  }}>@{a.username}</span>
                ))}
              </div>
            </div>
          )}
          {quarantined.length > 0 && (
            <div>
              <p style={{ fontSize: "0.72rem", color: "#555", marginBottom: "0.4rem" }}>
                Quarentena automática — retomam sozinhas:
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                {quarantined.map(a => (
                  <span key={a.id} style={{
                    padding: "0.25rem 0.65rem", borderRadius: 999,
                    background: "rgba(251,146,60,0.1)", border: "1px solid rgba(251,146,60,0.25)",
                    color: "#fb923c", fontSize: "0.75rem", fontWeight: 600,
                  }}>@{a.username}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Resumo 24h */}
      <div style={panel}>
        <div style={sectionLabel}>
          <TrendingUp size={12} color="#FFB800" />
          Resumo das últimas 24h
        </div>
        <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
          <StatPill label="Posts OK"     value={data?.totals.postsOk ?? 0}        color="#4ade80" icon={CheckCircle2} />
          <StatPill label="IG Error"     value={data?.totals.igErrors ?? 0}        color="#f87171" icon={XCircle}     />
          <StatPill label="Rate-limit"   value={data?.totals.rateLimitErrors ?? 0} color="#fb923c" icon={AlertTriangle} />
          <StatPill label="Outros erros" value={data?.totals.otherErrors ?? 0}     color="#a78bfa" icon={AlertTriangle} />
          <StatPill
            label="Taxa de sucesso"
            value={`${data?.totals.successRate ?? 100}%`}
            color={(data?.totals.successRate ?? 100) >= 90 ? "#4ade80" : (data?.totals.successRate ?? 100) >= 70 ? "#fb923c" : "#f87171"}
            icon={TrendingUp}
          />
        </div>
      </div>

      {/* Por conta */}
      <div style={panel}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
          <div style={sectionLabel}>
            <Activity size={12} color="#FFB800" />
            Por conta
            <span style={{ fontWeight: 400, letterSpacing: 0, textTransform: "none", fontSize: "0.68rem", color: "#444" }}>
              {filtered.length} conta{filtered.length !== 1 ? "s" : ""} com atividade
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "0.35rem 0.65rem" }}>
            <Search size={12} color="#444" />
            <input
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder="Filtrar por @username"
              style={{ background: "none", border: "none", outline: "none", color: "#ededed", fontSize: "0.78rem", width: 170 }}
            />
          </div>
        </div>

        {loading ? (
          <p style={{ fontSize: "0.82rem", color: "#444", padding: "1rem 0" }}>Carregando...</p>
        ) : filtered.length === 0 ? (
          <p style={{ textAlign: "center", color: "#444", fontSize: "0.82rem", padding: "2rem 0" }}>
            {filter ? "Nenhuma conta encontrada com esse filtro." : "Nenhuma conta com atividade ainda."}
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  {["Conta", "Status", "Pendentes", "Posts OK", "IG Error", "Rate-limit", "Outros", "Taxa 24h"].map(h => (
                    <th key={h} style={{ padding: "0.45rem 0.65rem", textAlign: "left", color: "#444", fontWeight: 600, fontSize: "0.62rem", letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((acc, i) => {
                  const rate = acc.successRate;
                  const rateColor = rate >= 90 ? "#4ade80" : rate >= 70 ? "#fb923c" : "#f87171";
                  const sColor = statusColor(acc.accountStatus);
                  return (
                    <tr key={acc.id} style={{ borderBottom: i < filtered.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                      <td style={{ padding: "0.65rem 0.65rem", color: "#ededed", fontWeight: 600, whiteSpace: "nowrap" }}>
                        <span style={{ color: "#444" }}>@</span>{acc.username}
                      </td>
                      <td style={{ padding: "0.65rem 0.65rem" }}>
                        <span style={{
                          padding: "0.15rem 0.55rem", borderRadius: 999,
                          background: `${sColor}15`, color: sColor,
                          fontSize: "0.68rem", fontWeight: 700, whiteSpace: "nowrap",
                        }}>{statusLabel(acc.accountStatus)}</span>
                      </td>
                      <td style={{ padding: "0.65rem 0.65rem", color: acc.pendingCount > 0 ? "#60a5fa" : "#444", fontWeight: acc.pendingCount > 0 ? 700 : 400 }}>
                        {acc.pendingCount > 0 ? acc.pendingCount.toLocaleString("pt-BR") : "—"}
                      </td>
                      <td style={{ padding: "0.65rem 0.65rem", color: acc.postsOk > 0 ? "#4ade80" : "#444", fontWeight: acc.postsOk > 0 ? 700 : 400 }}>
                        {acc.postsOk > 0 ? acc.postsOk : "—"}
                      </td>
                      <td style={{ padding: "0.65rem 0.65rem", color: acc.igErrors > 0 ? "#f87171" : "#444", fontWeight: acc.igErrors > 0 ? 700 : 400 }}>
                        {acc.igErrors > 0 ? acc.igErrors : "—"}
                      </td>
                      <td style={{ padding: "0.65rem 0.65rem", color: acc.rateLimitErrors > 0 ? "#fb923c" : "#444", fontWeight: acc.rateLimitErrors > 0 ? 700 : 400 }}>
                        {acc.rateLimitErrors > 0 ? acc.rateLimitErrors : "—"}
                      </td>
                      <td style={{ padding: "0.65rem 0.65rem", color: acc.otherErrors > 0 ? "#a78bfa" : "#444", fontWeight: acc.otherErrors > 0 ? 700 : 400 }}>
                        {acc.otherErrors > 0 ? acc.otherErrors : "—"}
                      </td>
                      <td style={{ padding: "0.65rem 0.65rem" }}>
                        {acc.total > 0 ? (
                          <span style={{
                            display: "inline-flex", alignItems: "center", gap: "0.25rem",
                            padding: "0.18rem 0.55rem", borderRadius: 999,
                            background: `${rateColor}18`, color: rateColor,
                            fontSize: "0.72rem", fontWeight: 700,
                          }}>{rate}%</span>
                        ) : (
                          <span style={{ color: "#444", fontSize: "0.72rem" }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        input::placeholder { color: #444; }
      `}</style>
    </main>
  );
}
