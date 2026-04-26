"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Activity, RefreshCw, Zap, CheckCircle2, Clock, AlertTriangle, XCircle, ShieldAlert, Search, TrendingUp } from "lucide-react";

type QueueStats = {
  running: number;
  pending: number;
  postedLastHour: number;
  overdue: number;
  stuckRunning: number;
};

type Totals = {
  postsOk: number;
  igErrors: number;
  rateLimitErrors: number;
  otherErrors: number;
  successRate: number;
};

type AccountStat = {
  username: string;
  postsOk: number;
  igErrors: number;
  rateLimitErrors: number;
  otherErrors: number;
  total: number;
  successRate: number;
};

type HealthData = {
  queue: QueueStats;
  totals: Totals;
  accounts: AccountStat[];
  quarantined: string[];
  lastUpdated: string;
};

function fmt(d: Date) {
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function QCard({
  label, value, sub, icon: Icon, color,
}: { label: string; value: number; sub: string; icon: React.ElementType; color: string }) {
  return (
    <div style={{
      flex: 1,
      minWidth: 0,
      background: "rgba(255,255,255,0.03)",
      border: `1px solid rgba(255,255,255,0.07)`,
      borderTop: `2px solid ${color}`,
      borderRadius: "12px",
      padding: "1.1rem 1.25rem",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
        <span style={{ fontSize: "0.72rem", fontWeight: 600, color: color, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</span>
        <Icon size={14} color={color} />
      </div>
      <div style={{ fontSize: "2rem", fontWeight: 800, color: "#fff", lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "0.35rem" }}>{sub}</div>
    </div>
  );
}

function StatPill({
  label, value, color, icon: Icon,
}: { label: string; value: string | number; color: string; icon: React.ElementType }) {
  return (
    <div style={{
      flex: 1, minWidth: 0,
      background: "rgba(255,255,255,0.03)",
      border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: "10px",
      padding: "0.9rem 1rem",
      display: "flex", flexDirection: "column", gap: "0.25rem",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
        <Icon size={13} color={color} />
        <span style={{ fontSize: "0.68rem", color: "var(--text-muted)", fontWeight: 500 }}>{label}</span>
      </div>
      <span style={{ fontSize: "1.5rem", fontWeight: 800, color }}>{value}</span>
    </div>
  );
}

type PushResult = { endpoint: string; ok: boolean; status?: number; message?: string; body?: string };

export default function SaudePage() {
  const [data, setData]       = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [unlocking, setUnlocking] = useState(false);
  const [lastRead, setLastRead]   = useState<Date | null>(null);
  const [filter, setFilter]       = useState("");
  const [pushLoading, setPushLoading] = useState(false);
  const [pushResults, setPushResults] = useState<PushResult[] | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/health");
      if (r.ok) {
        setData(await r.json());
        setLastRead(new Date());
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    intervalRef.current = setInterval(load, 30_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [load]);

  async function handleTestPush() {
    setPushLoading(true);
    setPushResults(null);
    try {
      const r = await fetch("/api/push/test", { method: "POST" });
      let json: { results?: PushResult[]; error?: string };
      try {
        json = await r.json();
      } catch {
        setPushResults([{ endpoint: "—", ok: false, message: `HTTP ${r.status} — resposta não é JSON` }]);
        return;
      }
      if (json.results) setPushResults(json.results);
      else setPushResults([{ endpoint: "—", ok: false, message: json.error ?? `HTTP ${r.status}` }]);
    } catch (err) {
      setPushResults([{ endpoint: "—", ok: false, message: err instanceof Error ? err.message : String(err) }]);
    } finally {
      setPushLoading(false);
    }
  }

  async function handleUnlock() {
    setUnlocking(true);
    try {
      await fetch("/api/health", { method: "POST" });
      await load();
    } finally {
      setUnlocking(false);
    }
  }

  const filtered = (data?.accounts ?? []).filter(a =>
    !filter || a.username.toLowerCase().includes(filter.toLowerCase()),
  );

  const panel: React.CSSProperties = {
    background: "rgba(255,255,255,0.025)",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: "14px",
    padding: "1.5rem",
    marginBottom: "1rem",
  };

  const sectionLabel: React.CSSProperties = {
    fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.14em",
    textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "1rem",
    display: "flex", alignItems: "center", gap: "0.4rem",
  };

  return (
    <main style={{ padding: "2rem 2.5rem", maxWidth: "1100px" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "2rem", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.25rem" }}>
            <Activity size={22} color="#FFD54F" />
            <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: "#fff", letterSpacing: "-0.02em" }}>Saúde das Contas</h1>
          </div>
          <p style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
            Métricas das últimas 24 horas — identifique rapidamente quem está com problema.
          </p>
        </div>
        <button onClick={() => { setLoading(true); load(); }}
          style={{
            display: "flex", alignItems: "center", gap: "0.5rem",
            padding: "0.6rem 1.1rem", borderRadius: "8px",
            background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
            color: "#fff", fontSize: "0.82rem", fontWeight: 600, cursor: "pointer",
          }}>
          <RefreshCw size={14} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
          Atualizar
        </button>
      </div>

      {/* Push test */}
      <div style={{ ...panel, marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem" }}>
          <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "#fff" }}>🔔 Testar notificação push</span>
          <button onClick={handleTestPush} disabled={pushLoading} style={{
            padding: "0.5rem 1rem", borderRadius: "8px",
            background: pushLoading ? "rgba(255,213,79,0.4)" : "#FFD54F",
            color: "#000", fontWeight: 700, fontSize: "0.8rem",
            border: "none", cursor: pushLoading ? "not-allowed" : "pointer",
          }}>
            {pushLoading ? "Enviando..." : "Enviar teste"}
          </button>
        </div>
        {pushResults && (
          <div style={{ marginTop: "0.75rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            {pushResults.map((r, i) => (
              <div key={i} style={{
                fontSize: "0.75rem", padding: "0.5rem 0.75rem", borderRadius: "8px",
                background: r.ok ? "rgba(74,222,128,0.08)" : "rgba(255,100,100,0.08)",
                border: `1px solid ${r.ok ? "rgba(74,222,128,0.2)" : "rgba(255,100,100,0.2)"}`,
                color: r.ok ? "#4ade80" : "#ff6b6b", wordBreak: "break-all",
              }}>
                {r.ok ? "✅ Enviado" : `❌ Erro ${r.status ?? ""}: ${r.message ?? ""}`}
                {r.body && <div style={{ marginTop: "0.25rem", opacity: 0.7 }}>{r.body}</div>}
                <div style={{ opacity: 0.5, marginTop: "0.2rem" }}>{r.endpoint}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Unlock stuck queue */}
      {(data?.queue.stuckRunning ?? 0) > 0 && (
        <button onClick={handleUnlock} disabled={unlocking} style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.6rem",
          padding: "0.9rem", borderRadius: "12px", marginBottom: "1.25rem",
          background: "linear-gradient(90deg, rgba(255,213,79,0.15), rgba(255,213,79,0.08))",
          border: "1px solid rgba(255,213,79,0.3)",
          color: "#FFD54F", fontSize: "0.875rem", fontWeight: 600, cursor: unlocking ? "not-allowed" : "pointer",
        }}>
          <Zap size={16} />
          Destravar fila agora
          <span style={{ fontSize: "0.75rem", color: "rgba(255,213,79,0.6)", fontWeight: 400 }}>
            (limpa {data?.queue.stuckRunning} post{(data?.queue.stuckRunning ?? 0) > 1 ? "s" : ""} travado{(data?.queue.stuckRunning ?? 0) > 1 ? "s" : ""} &gt; 5min e recoloca na fila)
          </span>
        </button>
      )}

      {/* Fila ao vivo */}
      <div style={panel}>
        <div style={sectionLabel}>
          <Activity size={12} color="#FFD54F" />
          Fila ao vivo
          {lastRead && (
            <span style={{ marginLeft: "auto", fontWeight: 400, letterSpacing: 0, textTransform: "none", fontSize: "0.7rem" }}>
              Última leitura {fmt(lastRead)}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <QCard label="Em execução"   value={data?.queue.running       ?? 0} sub="Enviando para o Instagram agora" icon={Zap}          color="#FFD54F" />
          <QCard label="Publicados 1h" value={data?.queue.postedLastHour ?? 0} sub="Publicados na última hora"       icon={CheckCircle2} color="#4ade80" />
          <QCard label="Pendentes"     value={data?.queue.pending        ?? 0} sub="Aguardando próximo slot"         icon={Clock}        color="#60a5fa" />
          <QCard label="Atrasados"     value={data?.queue.overdue        ?? 0} sub="Passaram do horário, aguardando" icon={AlertTriangle} color="#fb923c" />
          <QCard label="Com erro"      value={data?.queue.stuckRunning   ?? 0} sub="Travados há mais de 5 min"       icon={XCircle}      color="#f87171" />
        </div>
      </div>

      {/* Quarentena */}
      <div style={panel}>
        <div style={sectionLabel}>
          <ShieldAlert size={12} color="#fb923c" />
          Contas em quarentena automática
        </div>
        <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginBottom: "0.75rem" }}>
          Pausadas após 5 falhas consecutivas · as demais contas continuam postando normalmente
        </p>
        {loading ? (
          <p style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>Carregando...</p>
        ) : (data?.quarantined.length ?? 0) === 0 ? (
          <p style={{ fontSize: "0.82rem", color: "#4ade80", fontWeight: 600 }}>
            ✓ Nenhuma conta em quarentena. Saúde geral OK.
          </p>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
            {data!.quarantined.map(u => (
              <span key={u} style={{
                padding: "0.3rem 0.75rem", borderRadius: "999px",
                background: "rgba(251,146,60,0.12)", border: "1px solid rgba(251,146,60,0.3)",
                color: "#fb923c", fontSize: "0.8rem", fontWeight: 600,
              }}>@{u}</span>
            ))}
          </div>
        )}
      </div>

      {/* Totais 24h */}
      <div style={panel}>
        <div style={sectionLabel}>
          <TrendingUp size={12} color="#FFD54F" />
          Resumo das últimas 24h
        </div>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <StatPill label="Posts OK"      value={data?.totals.postsOk ?? 0}          color="#4ade80" icon={CheckCircle2} />
          <StatPill label="IG ERROR"      value={data?.totals.igErrors ?? 0}          color="#f87171" icon={XCircle}      />
          <StatPill label="Rate-limit"    value={data?.totals.rateLimitErrors ?? 0}   color="#fb923c" icon={AlertTriangle} />
          <StatPill label="Outros erros"  value={data?.totals.otherErrors ?? 0}       color="#a78bfa" icon={AlertTriangle} />
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
            <Activity size={12} color="#FFD54F" />
            Por conta
            <span style={{ fontWeight: 400, letterSpacing: 0, textTransform: "none", fontSize: "0.7rem" }}>
              {filtered.length} conta{filtered.length !== 1 ? "s" : ""} · publicações e atividade das últimas 24h
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px", padding: "0.4rem 0.75rem" }}>
            <Search size={13} color="var(--text-muted)" />
            <input
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder="Filtrar por @username"
              style={{ background: "none", border: "none", outline: "none", color: "#fff", fontSize: "0.82rem", width: "180px" }}
            />
          </div>
        </div>

        {loading ? (
          <p style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>Carregando...</p>
        ) : filtered.length === 0 ? (
          <p style={{ textAlign: "center", color: "var(--text-muted)", fontSize: "0.85rem", padding: "2rem 0" }}>
            Nenhuma conta encontrada.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                  {["Conta", "Posts OK", "IG Error", "Rate-limit", "Outros", "Taxa"].map(h => (
                    <th key={h} style={{ padding: "0.5rem 0.75rem", textAlign: "left", color: "var(--text-muted)", fontWeight: 600, fontSize: "0.7rem", letterSpacing: "0.06em", textTransform: "uppercase" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((acc, i) => {
                  const rate = acc.successRate;
                  const rateColor = rate >= 90 ? "#4ade80" : rate >= 70 ? "#fb923c" : "#f87171";
                  return (
                    <tr key={acc.username} style={{ borderBottom: i < filtered.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                      <td style={{ padding: "0.7rem 0.75rem", color: "#fff", fontWeight: 600 }}>
                        <span style={{ color: "var(--text-muted)" }}>@</span>{acc.username}
                      </td>
                      <td style={{ padding: "0.7rem 0.75rem", color: "#4ade80", fontWeight: 700 }}>{acc.postsOk}</td>
                      <td style={{ padding: "0.7rem 0.75rem", color: acc.igErrors > 0 ? "#f87171" : "var(--text-muted)", fontWeight: acc.igErrors > 0 ? 700 : 400 }}>{acc.igErrors}</td>
                      <td style={{ padding: "0.7rem 0.75rem", color: acc.rateLimitErrors > 0 ? "#fb923c" : "var(--text-muted)", fontWeight: acc.rateLimitErrors > 0 ? 700 : 400 }}>{acc.rateLimitErrors}</td>
                      <td style={{ padding: "0.7rem 0.75rem", color: acc.otherErrors > 0 ? "#a78bfa" : "var(--text-muted)", fontWeight: acc.otherErrors > 0 ? 700 : 400 }}>{acc.otherErrors}</td>
                      <td style={{ padding: "0.7rem 0.75rem" }}>
                        <span style={{
                          display: "inline-flex", alignItems: "center", gap: "0.3rem",
                          padding: "0.2rem 0.6rem", borderRadius: "999px",
                          background: `${rateColor}18`, color: rateColor,
                          fontSize: "0.75rem", fontWeight: 700,
                        }}>{rate}%</span>
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
        input::placeholder { color: var(--text-muted); }
      `}</style>
    </main>
  );
}
