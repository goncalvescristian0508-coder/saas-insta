"use client";

import { useState, useEffect, useCallback } from "react";
import { UserPlus, Loader2, CheckCircle, XCircle, Clock, RefreshCw, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";

interface MetaApp {
  key: string;
  name: string;
  appId: string;
}

interface JobResult {
  ok: boolean;
  error?: string;
}

interface Job {
  id: string;
  appKey: string;
  status: string;
  usernames: string[];
  results: string | null;
  errorMsg: string | null;
  createdAt: string;
  startedAt: string | null;
  doneAt: string | null;
}

function statusColor(s: string) {
  if (s === "DONE") return "#4ade80";
  if (s === "FAILED") return "#f87171";
  if (s === "RUNNING") return "#60a5fa";
  if (s === "PAUSED") return "#f59e0b";
  return "#a0a0a0";
}

function statusLabel(s: string) {
  if (s === "DONE") return "Concluído";
  if (s === "FAILED") return "Falhou";
  if (s === "RUNNING") return "Processando...";
  if (s === "PAUSED") return "Pausado";
  return "Aguardando";
}

function parseResults(raw: string | null): Record<string, JobResult> {
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

function JobCard({ job, apps, onRefresh }: { job: Job; apps: MetaApp[]; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const results = parseResults(job.results);
  const app = apps.find(a => a.key === job.appKey);
  const total = job.usernames.length;
  const processed = Object.keys(results).length;
  const ok = Object.values(results).filter(r => r.ok).length;
  const failed = Object.values(results).filter(r => !r.ok).length;
  const isActive = job.status === "RUNNING" || job.status === "PENDING";

  return (
    <div style={{
      background: "rgba(255,255,255,0.03)",
      border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 10,
      padding: "1rem 1.25rem",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              padding: "2px 8px", borderRadius: 5, fontSize: 11, fontWeight: 700,
              color: statusColor(job.status),
              background: `${statusColor(job.status)}18`,
            }}>
              {isActive && <Loader2 size={10} style={{ animation: "spin 1s linear infinite" }} />}
              {job.status === "DONE" && <CheckCircle size={10} />}
              {job.status === "FAILED" && <XCircle size={10} />}
              {job.status === "PAUSED" && <Clock size={10} />}
              {statusLabel(job.status)}
            </span>
            <span style={{ fontSize: 12, color: "#666" }}>
              {app?.name ?? `App ${job.appKey}`}
            </span>
          </div>
          <div style={{ fontSize: 13, color: "#ccc" }}>
            {total} usuário{total !== 1 ? "s" : ""}
            {processed > 0 && (
              <span style={{ color: "#666", marginLeft: 8 }}>
                · {ok > 0 && <span style={{ color: "#4ade80" }}>{ok} ok</span>}
                {ok > 0 && failed > 0 && " "}
                {failed > 0 && <span style={{ color: "#f87171" }}>{failed} erro</span>}
                {` · ${processed}/${total}`}
              </span>
            )}
          </div>
          {processed > 0 && job.status === "RUNNING" && (
            <div style={{ marginTop: 6, height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ height: 3, width: `${(processed / total) * 100}%`, background: "#60a5fa", borderRadius: 2, transition: "width 0.4s" }} />
            </div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {isActive && (
            <button onClick={onRefresh} style={{ background: "none", border: "none", color: "#666", cursor: "pointer", padding: 4, display: "flex" }}>
              <RefreshCw size={13} />
            </button>
          )}
          <button
            onClick={() => setExpanded(v => !v)}
            style={{ background: "none", border: "none", color: "#666", cursor: "pointer", padding: 4, display: "flex" }}
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 280, overflowY: "auto" }}>
            {job.usernames.map(u => {
              const r = results[u];
              return (
                <div key={u} style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "4px 8px", borderRadius: 6,
                  background: r ? (r.ok ? "rgba(74,222,128,0.06)" : "rgba(248,113,113,0.06)") : "rgba(255,255,255,0.02)",
                }}>
                  {r ? (
                    r.ok
                      ? <CheckCircle size={12} color="#4ade80" style={{ flexShrink: 0 }} />
                      : <XCircle size={12} color="#f87171" style={{ flexShrink: 0 }} />
                  ) : (
                    <Clock size={12} color="#555" style={{ flexShrink: 0 }} />
                  )}
                  <span style={{ fontSize: 12.5, color: r ? (r.ok ? "#e0e0e0" : "#d0d0d0") : "#777", flex: 1 }}>
                    @{u}
                  </span>
                  {r?.error && (
                    <span style={{ fontSize: 11, color: "#f87171", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.error}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          {job.errorMsg && (
            <div style={{ marginTop: 8, padding: "6px 10px", background: "rgba(248,113,113,0.08)", borderRadius: 6, fontSize: 12, color: "#f87171" }}>
              {job.errorMsg}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AdicionarUsuariosPage() {
  const [apps, setApps] = useState<MetaApp[]>([]);
  const [selectedApp, setSelectedApp] = useState<string>("");
  const [textInput, setTextInput] = useState("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [plan, setPlan] = useState<{ name: string | null; limit: number }>({ name: null, limit: 50 });
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadJobs = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/tester-invites");
      if (!r.ok) return;
      const d = await r.json() as { jobs: Job[]; apps: MetaApp[]; plan: { name: string | null; limit: number } };
      setJobs(d.jobs ?? []);
      setApps(d.apps ?? []);
      setPlan(d.plan ?? { name: null, limit: 50 });
      if (!selectedApp && d.apps?.length) setSelectedApp(d.apps[0].key);
    } finally {
      setLoading(false);
    }
  }, [selectedApp]);

  useEffect(() => {
    loadJobs();
  }, []);

  // Auto-refresh when there's an active job
  useEffect(() => {
    const hasActive = jobs.some(j => j.status === "RUNNING" || j.status === "PENDING");
    if (!hasActive) return;
    const t = setTimeout(loadJobs, 5000);
    return () => clearTimeout(t);
  }, [jobs, loadJobs]);

  const usernames = textInput
    .split(/[\n,;]+/)
    .map(u => u.trim().replace(/^@/, "").toLowerCase())
    .filter(Boolean);

  const uniqueUsernames = [...new Set(usernames)];

  async function handleSubmit() {
    if (uniqueUsernames.length === 0) { setError("Digite pelo menos um username"); return; }
    if (!selectedApp) { setError("Selecione um app Meta"); return; }

    setError("");
    setSuccess("");
    setSubmitting(true);
    try {
      const r = await fetch("/api/tester-invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usernames: uniqueUsernames, appKey: selectedApp }),
      });
      const d = await r.json() as { jobId?: string; error?: string; limit?: number };
      if (!r.ok) {
        setError(d.error ?? "Erro ao criar job");
        return;
      }
      setSuccess(`Job criado! ${uniqueUsernames.length} usuário(s) serão adicionados como testers.`);
      setTextInput("");
      await loadJobs();
    } catch {
      setError("Erro de conexão");
    } finally {
      setSubmitting(false);
    }
  }

  const overLimit = false;

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: "2rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.35rem" }}>
          <UserPlus size={22} color="var(--accent-gold)" />
          <h1 className="page-title" style={{ marginBottom: 0 }}>Adicionar usuários</h1>
        </div>
        <p className="page-subtitle">Convide usuários do Instagram como testers do Meta App</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", alignItems: "start" }}>
        {/* Form */}
        <div className="glass-panel" style={{ padding: "1.4rem", borderRadius: 12 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: "#ccc", marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.07em" }}>
            Novo convite
          </h2>

          {/* App selector */}
          {apps.length > 1 && (
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, color: "#777", display: "block", marginBottom: 6 }}>App Meta</label>
              <select
                value={selectedApp}
                onChange={e => setSelectedApp(e.target.value)}
                style={{
                  width: "100%", padding: "8px 10px", borderRadius: 7,
                  background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
                  color: "#e0e0e0", fontSize: 13, outline: "none",
                }}
              >
                {apps.map(a => (
                  <option key={a.key} value={a.key}>{a.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Textarea */}
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 12, color: "#777", display: "block", marginBottom: 6 }}>
              Usernames do Instagram <span style={{ color: "#555" }}>(um por linha, ou separados por vírgula)</span>
            </label>
            <textarea
              value={textInput}
              onChange={e => setTextInput(e.target.value)}
              rows={8}
              placeholder={"@usuario1\n@usuario2\nusuario3"}
              style={{
                width: "100%", padding: "10px 12px", borderRadius: 8,
                background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.09)",
                color: "#e0e0e0", fontSize: 13, outline: "none", resize: "vertical",
                fontFamily: "monospace", lineHeight: 1.6,
              }}
            />
          </div>

          {/* Username count */}
          {uniqueUsernames.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <span style={{ fontSize: 11, color: "#555" }}>
                {uniqueUsernames.length} usuário{uniqueUsernames.length !== 1 ? "s" : ""}
              </span>
            </div>
          )}

          {error && (
            <div style={{ display: "flex", gap: 6, alignItems: "center", color: "#f87171", fontSize: 13, marginBottom: 10 }}>
              <AlertCircle size={13} /> {error}
            </div>
          )}
          {success && (
            <div style={{ display: "flex", gap: 6, alignItems: "center", color: "#4ade80", fontSize: 13, marginBottom: 10 }}>
              <CheckCircle size={13} /> {success}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={submitting || uniqueUsernames.length === 0 || overLimit}
            className="btn btn-primary"
            style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}
          >
            {submitting
              ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Criando job...</>
              : <><UserPlus size={14} /> Adicionar {uniqueUsernames.length > 0 ? `${uniqueUsernames.length} usuário${uniqueUsernames.length > 1 ? "s" : ""}` : "usuários"}</>
            }
          </button>

          {apps.length === 0 && !loading && (
            <p style={{ fontSize: 12, color: "#555", marginTop: 10, textAlign: "center" }}>
              Nenhum App Meta configurado. Contate o suporte.
            </p>
          )}
        </div>

        {/* Jobs history */}
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: "#ccc", textTransform: "uppercase", letterSpacing: "0.07em" }}>
              Histórico de convites
            </h2>
            <button
              onClick={loadJobs}
              disabled={loading}
              style={{ background: "none", border: "none", color: "#555", cursor: "pointer", padding: 4, display: "flex", alignItems: "center" }}
            >
              <RefreshCw size={13} style={loading ? { animation: "spin 1s linear infinite" } : {}} />
            </button>
          </div>

          {loading && jobs.length === 0 && (
            <div style={{ textAlign: "center", padding: "2rem", color: "#555", fontSize: 13 }}>
              <Loader2 size={18} style={{ animation: "spin 1s linear infinite", margin: "0 auto 8px", display: "block" }} />
              Carregando...
            </div>
          )}

          {!loading && jobs.length === 0 && (
            <div style={{
              padding: "2rem", borderRadius: 10, textAlign: "center",
              background: "rgba(255,255,255,0.02)", border: "1px dashed rgba(255,255,255,0.07)",
            }}>
              <UserPlus size={28} color="#444" style={{ margin: "0 auto 8px", display: "block" }} />
              <p style={{ color: "#555", fontSize: 13 }}>Nenhum job criado ainda</p>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {jobs.map(job => (
              <JobCard key={job.id} job={job} apps={apps} onRefresh={loadJobs} />
            ))}
          </div>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
