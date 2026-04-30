"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, Copy, CheckCircle, XCircle, Users, Clock, CalendarClock, AlertCircle, RefreshCw, CheckCheck, AlertTriangle, Trash2 } from "lucide-react";

interface Account { id: string; username: string; }

interface CloneJob {
  id: string;
  sourceUsername: string;
  accountUsernames: string[];
  totalReels: number;
  createdAt: string;
  posts: { total: number; done: number; failed: number; pending: number };
}

export default function ClonarTikTokPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccounts, setSelectedAccounts] = useState<Record<string, boolean>>({});
  const [username, setUsername] = useState("");
  const [intervalMinutes, setIntervalMinutes] = useState(10);
  const [postsPerDay, setPostsPerDay] = useState<number | null>(null);
  const [postLimit, setPostLimit] = useState<number | "all">(20);
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [cloning, setCloning] = useState(false);
  const [processingJobId, setProcessingJobId] = useState<string | null>(null);
  const [result, setResult] = useState<{ created: number } | null>(null);
  const [error, setError] = useState("");
  const [jobs, setJobs] = useState<CloneJob[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);

  function getDefaultDateTime() {
    const d = new Date(Date.now() + 10 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    return {
      date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
    };
  }

  const loadJobs = useCallback(async () => {
    setLoadingJobs(true);
    try {
      const res = await fetch("/api/clone/history");
      const data = await res.json();
      const all: CloneJob[] = data.jobs ?? [];
      setJobs(all.filter((j) => j.sourceUsername.startsWith("tiktok:")));
    } finally {
      setLoadingJobs(false);
    }
  }, []);

  useEffect(() => {
    const { date, time } = getDefaultDateTime();
    setStartDate(date);
    setStartTime(time);
    fetch("/api/private-ig/accounts")
      .then((r) => r.json())
      .then((data) => {
        const oauth = (data.accounts ?? []).filter(
          (a: Account & { source?: string; tokenExpired?: boolean; accountStatus?: string }) =>
            a.source === "oauth" && !a.tokenExpired && a.accountStatus !== "SUSPENDED" && a.accountStatus !== "QUARANTINE"
        );
        setAccounts(oauth);
        const sel: Record<string, boolean> = {};
        oauth.forEach((a: Account) => { sel[a.id] = true; });
        setSelectedAccounts(sel);
      });
    loadJobs();
  }, [loadJobs]);

  // Poll while processing
  useEffect(() => {
    if (!processingJobId) return;
    const poll = async () => {
      const res = await fetch("/api/clone/history");
      const data = await res.json();
      const all: CloneJob[] = (data.jobs ?? []).filter((j: CloneJob) => j.sourceUsername.startsWith("tiktok:"));
      setJobs(all);
      const job = all.find((j) => j.id === processingJobId);
      if (!job) {
        setError("Erro ao buscar vídeos do perfil. Verifique o username e tente novamente.");
        setProcessingJobId(null);
      } else if (job.totalReels === -1) {
        setError("Nenhum vídeo encontrado. Verifique se o perfil é público e o username está correto.");
        setProcessingJobId(null);
      } else if (job.posts.total > 0) {
        setResult({ created: job.posts.total });
        setProcessingJobId(null);
      }
    };
    const iv = setInterval(() => { void poll(); }, 5000);
    return () => clearInterval(iv);
  }, [processingJobId]);

  const handleClone = async () => {
    const accountIds = Object.entries(selectedAccounts).filter(([, v]) => v).map(([k]) => k);
    if (!username.trim() || accountIds.length === 0 || !startDate || !startTime) {
      setError("Preencha o username, selecione ao menos uma conta e a data de início.");
      return;
    }
    setCloning(true);
    setError("");
    setResult(null);
    setProcessingJobId(null);
    try {
      const startAt = new Date(`${startDate}T${startTime}`).toISOString();
      const res = await fetch("/api/clone/tiktok", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          accountIds,
          intervalMinutes,
          postLimit: postLimit === "all" ? null : postLimit,
          startAt,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Erro ao clonar"); return; }
      setProcessingJobId(data.cloneJobId);
      await loadJobs();
    } catch {
      setError("Erro de conexão");
    } finally {
      setCloning(false);
    }
  };

  const handleCancelJob = async (e: React.MouseEvent, jobId: string) => {
    e.stopPropagation();
    if (!confirm("Cancelar este clone? Posts pendentes serão removidos.")) return;
    await fetch(`/api/clone/history/${jobId}`, { method: "DELETE" });
    setJobs((prev) => prev.filter((j) => j.id !== jobId));
  };

  const selectedCount = Object.values(selectedAccounts).filter(Boolean).length;
  const effectiveLimit = postLimit === "all" ? 9999 : postLimit;

  return (
    <div>
      <div style={{ marginBottom: "2rem" }}>
        <h1 className="page-title">Clonar TikTok</h1>
        <p className="page-subtitle">Baixa vídeos de um perfil do TikTok via Apify e agenda nas suas contas do Instagram</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", alignItems: "start" }}>
        {/* Left — username */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <div className="glass-panel" style={{ padding: "1.75rem", borderRadius: "14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "1.25rem" }}>
              <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "rgba(239,68,68,.12)", border: "1px solid rgba(239,68,68,.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1rem" }}>
                ♪
              </div>
              <h2 style={{ fontSize: "1rem", fontWeight: 700 }}>Perfil do TikTok</h2>
            </div>
            <input
              className="input-field"
              placeholder="@username ou username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !cloning && void handleClone()}
              style={{ width: "100%" }}
            />
            <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.5rem" }}>
              O Apify vai raspar os vídeos do perfil público. Pode demorar 1-3 minutos.
            </p>
          </div>

          {/* History */}
          <div className="glass-panel" style={{ padding: "1.25rem", borderRadius: "14px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.85rem" }}>
              <span style={{ fontSize: "0.85rem", fontWeight: 700 }}>Histórico</span>
              <button onClick={loadJobs} disabled={loadingJobs} style={{ display: "flex", alignItems: "center", gap: "0.3rem", padding: "0.3rem 0.6rem", borderRadius: "7px", border: "1px solid rgba(255,255,255,.08)", background: "transparent", color: "var(--text-secondary)", fontSize: "0.75rem", cursor: "pointer" }}>
                <RefreshCw size={11} style={loadingJobs ? { animation: "spin 1s linear infinite" } : {}} /> Atualizar
              </button>
            </div>
            {loadingJobs && jobs.length === 0 ? (
              <div style={{ textAlign: "center", padding: "1.5rem" }}><Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} /></div>
            ) : jobs.length === 0 ? (
              <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", textAlign: "center", padding: "1rem 0" }}>Nenhum clone TikTok ainda.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                {jobs.map((job) => {
                  const isProcessing = job.totalReels === 0 && job.posts.total === 0;
                  const pct = job.posts.total > 0 ? Math.round((job.posts.done / job.posts.total) * 100) : 0;
                  const cleanName = job.sourceUsername.replace("tiktok:", "");
                  return (
                    <div key={job.id} className="glass-panel" style={{ padding: "1rem 1.25rem", borderRadius: "12px", display: "flex", alignItems: "center", gap: "1rem" }}>
                      <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: "rgba(239,68,68,.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1rem", flexShrink: 0 }}>♪</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontWeight: 700, fontSize: "0.9rem" }}>@{cleanName}</p>
                        <p style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>
                          {job.posts.total} posts · {new Date(job.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </p>
                        <div style={{ height: "3px", borderRadius: "2px", background: "rgba(255,255,255,.08)", marginTop: "0.4rem", overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${pct}%`, background: "linear-gradient(90deg,#4ade80,#22d3ee)", borderRadius: "2px", transition: "width .3s" }} />
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: "0.75rem", flexShrink: 0, alignItems: "center" }}>
                        {isProcessing ? (
                          <span style={{ fontSize: "0.75rem", color: "#60a5fa", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                            <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> Buscando...
                          </span>
                        ) : (
                          <>
                            <span style={{ fontSize: "0.8rem", color: "#4ade80", fontWeight: 700, display: "flex", alignItems: "center", gap: "0.25rem" }}><CheckCheck size={13} />{job.posts.done}</span>
                            <span style={{ fontSize: "0.8rem", color: "#60a5fa", fontWeight: 700, display: "flex", alignItems: "center", gap: "0.25rem" }}><Clock size={13} />{job.posts.pending}</span>
                            {job.posts.failed > 0 && <span style={{ fontSize: "0.8rem", color: "#f87171", fontWeight: 700, display: "flex", alignItems: "center", gap: "0.25rem" }}><AlertTriangle size={13} />{job.posts.failed}</span>}
                          </>
                        )}
                        {job.posts.pending > 0 && (
                          <button onClick={(e) => void handleCancelJob(e, job.id)} style={{ background: "none", border: "1px solid rgba(239,68,68,.25)", borderRadius: "7px", cursor: "pointer", color: "var(--text-secondary)", padding: "0.3rem 0.45rem", display: "flex", alignItems: "center" }}>
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right — config */}
        <div className="glass-panel" style={{ padding: "1.75rem", borderRadius: "14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "1.5rem" }}>
            <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "rgba(201,162,39,.12)", border: "1px solid rgba(201,162,39,.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <CalendarClock size={16} color="var(--accent-gold)" />
            </div>
            <h2 style={{ fontSize: "1rem", fontWeight: 700 }}>Configuração</h2>
          </div>

          {/* Post limit */}
          <div style={{ marginBottom: "1.25rem" }}>
            <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.5rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>Quantidade de vídeos</label>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              {([5, 10, 20, 50, 100, "all"] as (number | "all")[]).map((v) => (
                <button key={String(v)} onClick={() => setPostLimit(v)} style={{ padding: "0.4rem 0.9rem", borderRadius: "8px", border: `1px solid ${postLimit === v ? "rgba(139,92,246,.4)" : "rgba(255,255,255,.1)"}`, background: postLimit === v ? "rgba(139,92,246,.12)" : "transparent", color: postLimit === v ? "#a78bfa" : "var(--text-secondary)", fontWeight: postLimit === v ? 700 : 400, fontSize: "0.82rem", cursor: "pointer" }}>
                  {v === "all" ? "Todos" : v}
                </button>
              ))}
            </div>
          </div>

          {/* Posts per day */}
          <div style={{ marginBottom: "1.25rem" }}>
            <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.5rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>Posts por dia</label>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              {[1, 2, 3, 4, 6, 8, 12, 24].map((ppd) => {
                const mins = Math.round((24 * 60) / ppd);
                return (
                  <button key={ppd} onClick={() => { setPostsPerDay(ppd); setIntervalMinutes(mins); }} style={{ padding: "0.4rem 0.9rem", borderRadius: "8px", border: `1px solid ${postsPerDay === ppd ? "rgba(74,222,128,.4)" : "rgba(255,255,255,.1)"}`, background: postsPerDay === ppd ? "rgba(74,222,128,.1)" : "transparent", color: postsPerDay === ppd ? "#4ade80" : "var(--text-secondary)", fontWeight: postsPerDay === ppd ? 700 : 400, fontSize: "0.82rem", cursor: "pointer" }}>
                    {ppd}x
                  </button>
                );
              })}
            </div>
          </div>

          {/* Interval */}
          <div style={{ marginBottom: "1.25rem" }}>
            <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.5rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              <Clock size={12} style={{ display: "inline", marginRight: "0.3rem" }} />Intervalo entre posts
            </label>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              {[1, 2, 3, 5, 10, 15, 20, 30, 60].map((m) => (
                <button key={m} onClick={() => { setIntervalMinutes(m); setPostsPerDay(null); }} style={{ padding: "0.4rem 0.9rem", borderRadius: "8px", border: `1px solid ${intervalMinutes === m && !postsPerDay ? "rgba(201,162,39,.4)" : "rgba(255,255,255,.1)"}`, background: intervalMinutes === m && !postsPerDay ? "rgba(201,162,39,.12)" : "transparent", color: intervalMinutes === m && !postsPerDay ? "var(--accent-gold)" : "var(--text-secondary)", fontWeight: intervalMinutes === m && !postsPerDay ? 700 : 400, fontSize: "0.82rem", cursor: "pointer" }}>
                  {m}min
                </button>
              ))}
            </div>
          </div>

          {/* Start */}
          <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1.25rem" }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.4rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>Data início</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="input-field" style={{ width: "100%" }} min={new Date().toISOString().split("T")[0]} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.4rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>Hora</label>
              <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="input-field" style={{ width: "100%" }} />
            </div>
          </div>

          {/* Accounts */}
          <div style={{ marginBottom: "1.25rem" }}>
            <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.6rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              <Users size={12} style={{ display: "inline", marginRight: "0.3rem" }} />Contas destino ({selectedCount} selecionada(s))
            </label>
            {accounts.length === 0 ? (
              <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", fontStyle: "italic" }}>Conecte contas OAuth em Contas.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.4rem 0.6rem", borderRadius: "6px", background: "rgba(201,162,39,.05)", cursor: "pointer", fontSize: "0.78rem", color: "var(--text-muted)", fontWeight: 600 }}>
                  <input type="checkbox" checked={accounts.every((a) => selectedAccounts[a.id])} onChange={(e) => { const s: Record<string, boolean> = {}; accounts.forEach((a) => { s[a.id] = e.target.checked; }); setSelectedAccounts(s); }} style={{ accentColor: "var(--accent-gold)" }} />
                  Selecionar todas
                </label>
                {accounts.map((a) => (
                  <label key={a.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.5rem 0.6rem", borderRadius: "6px", cursor: "pointer", background: selectedAccounts[a.id] ? "rgba(201,162,39,.07)" : "rgba(255,255,255,.02)", border: `1px solid ${selectedAccounts[a.id] ? "rgba(201,162,39,.2)" : "transparent"}` }}>
                    <input type="checkbox" checked={Boolean(selectedAccounts[a.id])} onChange={() => setSelectedAccounts((s) => ({ ...s, [a.id]: !s[a.id] }))} style={{ accentColor: "var(--accent-gold)" }} />
                    <span style={{ fontSize: "0.85rem" }}>@{a.username}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Estimate */}
          {username.trim() && selectedCount > 0 && (
            <div style={{ padding: "0.75rem 1rem", background: "rgba(96,165,250,.06)", border: "1px solid rgba(96,165,250,.12)", borderRadius: "10px", fontSize: "0.82rem", color: "var(--text-secondary)", marginBottom: "1.25rem" }}>
              Até {effectiveLimit === 9999 ? "todos" : effectiveLimit} vídeos × {selectedCount} conta(s) · intervalo {intervalMinutes >= 60 ? `${Math.round(intervalMinutes / 60)}h` : `${intervalMinutes}min`}
            </div>
          )}

          {error && <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", color: "#f87171", fontSize: "0.85rem", marginBottom: "1rem" }}><AlertCircle size={15} /> {error}</div>}

          {processingJobId && !result && (
            <div style={{ padding: "0.85rem 1rem", background: "rgba(96,165,250,.08)", border: "1px solid rgba(96,165,250,.2)", borderRadius: "10px", marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.6rem" }}>
              <Loader2 size={16} color="#60a5fa" style={{ animation: "spin 1s linear infinite" }} />
              <span style={{ fontSize: "0.875rem", color: "#60a5fa", fontWeight: 600 }}>Buscando vídeos no TikTok... pode levar 1-3 min.</span>
            </div>
          )}

          {result && (
            <div style={{ padding: "0.85rem 1rem", background: "rgba(74,222,128,.08)", border: "1px solid rgba(74,222,128,.2)", borderRadius: "10px", marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.6rem" }}>
              <CheckCircle size={16} color="#4ade80" />
              <span style={{ fontSize: "0.875rem", color: "#4ade80", fontWeight: 600 }}>{result.created} posts agendados!</span>
            </div>
          )}

          <button
            onClick={() => void handleClone()}
            disabled={cloning || !!processingJobId || !username.trim() || selectedCount === 0}
            className="btn btn-primary"
            style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", opacity: (!username.trim() || selectedCount === 0) ? 0.5 : 1 }}
          >
            {cloning ? <><Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> Iniciando...</>
              : processingJobId ? <><Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> Processando...</>
              : <><Copy size={16} /> Clonar TikTok</>}
          </button>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
