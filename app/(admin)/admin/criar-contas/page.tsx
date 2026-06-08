"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useRef } from "react";
import { Loader2, Plus, RefreshCw, CheckCircle2, XCircle, Clock, Copy, Download } from "lucide-react";

interface Job {
  id: string;
  status: "pending" | "running" | "done" | "failed";
  log: string[];
  result: {
    username: string;
    password: string;
    email: string;
    phone: string;
    fullName: string;
  } | null;
  error: string | null;
  createdAt: string;
}

const STATUS_ICON = {
  pending: <Clock size={14} style={{ color: "#aaa" }} />,
  running: <Loader2 size={14} className="animate-spin" style={{ color: "#FFB800" }} />,
  done: <CheckCircle2 size={14} style={{ color: "#22c55e" }} />,
  failed: <XCircle size={14} style={{ color: "#ef4444" }} />,
};

const STATUS_LABEL = {
  pending: "Aguardando",
  running: "Criando...",
  done: "Concluído",
  failed: "Falhou",
};

function copyText(text: string) {
  navigator.clipboard.writeText(text).catch(() => {});
}

export default function CriarContasPage() {
  const [quantity, setQuantity] = useState(1);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function fetchJobs() {
    setFetching(true);
    try {
      const r = await fetch("/api/admin/criar-contas");
      if (r.ok) {
        const data = await r.json();
        setJobs(Array.isArray(data) ? data : []);
      }
    } finally {
      setFetching(false);
    }
  }

  useEffect(() => {
    fetchJobs();
    pollRef.current = setInterval(fetchJobs, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  async function handleCreate() {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/criar-contas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity }),
      });
      const data = await r.json();
      if (!r.ok) {
        alert(data.error ?? "Erro ao criar contas");
        return;
      }
      await fetchJobs();
    } finally {
      setLoading(false);
    }
  }

  function exportCsv() {
    const done = jobs.filter(j => j.status === "done" && j.result);
    if (!done.length) return;
    const header = "username,password,email,phone,fullName";
    const rows = done.map(j => {
      const r = j.result!;
      return `${r.username},${r.password},${r.email},${r.phone},"${r.fullName}"`;
    });
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `contas-ig-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const doneCount = jobs.filter(j => j.status === "done").length;
  const runningCount = jobs.filter(j => j.status === "running" || j.status === "pending").length;
  const failedCount = jobs.filter(j => j.status === "failed").length;

  return (
    <div style={{ padding: "28px 24px", maxWidth: 960, margin: "0 auto", fontFamily: "var(--font-geist-sans, sans-serif)" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#fff", margin: 0 }}>Criar Contas Instagram</h1>
        <p style={{ color: "#666", fontSize: 13, marginTop: 4 }}>Criação automática via bot — somente admin</p>
      </div>

      {/* Stats */}
      <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        {[
          { label: "Concluídas", value: doneCount, color: "#22c55e" },
          { label: "Em andamento", value: runningCount, color: "#FFB800" },
          { label: "Falhou", value: failedCount, color: "#ef4444" },
        ].map(s => (
          <div key={s.label} style={{
            background: "#111", border: "1px solid #222", borderRadius: 10,
            padding: "12px 20px", minWidth: 110,
          }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div style={{
        background: "#111", border: "1px solid #222", borderRadius: 12,
        padding: 20, marginBottom: 24, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap",
      }}>
        <div>
          <label style={{ fontSize: 12, color: "#888", display: "block", marginBottom: 6 }}>Quantidade</label>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={() => setQuantity(q => Math.max(1, q - 1))}
              style={{ width: 32, height: 32, borderRadius: 6, border: "1px solid #333", background: "#1a1a1a", color: "#fff", cursor: "pointer", fontSize: 16 }}
            >−</button>
            <span style={{ width: 36, textAlign: "center", fontSize: 18, fontWeight: 600, color: "#fff" }}>{quantity}</span>
            <button
              onClick={() => setQuantity(q => Math.min(10, q + 1))}
              style={{ width: 32, height: 32, borderRadius: 6, border: "1px solid #333", background: "#1a1a1a", color: "#fff", cursor: "pointer", fontSize: 16 }}
            >+</button>
          </div>
          <div style={{ fontSize: 11, color: "#555", marginTop: 4 }}>Máx. 10 por vez</div>
        </div>

        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button
            onClick={fetchJobs}
            disabled={fetching}
            style={{
              height: 40, padding: "0 16px", borderRadius: 8, border: "1px solid #333",
              background: "#1a1a1a", color: "#aaa", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 13,
            }}
          >
            <RefreshCw size={14} className={fetching ? "animate-spin" : ""} />
            Atualizar
          </button>

          {doneCount > 0 && (
            <button
              onClick={exportCsv}
              style={{
                height: 40, padding: "0 16px", borderRadius: 8, border: "1px solid #333",
                background: "#1a1a1a", color: "#22c55e", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 13,
              }}
            >
              <Download size={14} />
              Exportar CSV ({doneCount})
            </button>
          )}

          <button
            onClick={handleCreate}
            disabled={loading}
            style={{
              height: 40, padding: "0 20px", borderRadius: 8, border: "none",
              background: "#FFB800", color: "#000", fontWeight: 700, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 6, fontSize: 14,
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
            Criar {quantity} conta{quantity > 1 ? "s" : ""}
          </button>
        </div>
      </div>

      {/* Job list + detail */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* List */}
        <div style={{ background: "#111", border: "1px solid #222", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "14px 16px", borderBottom: "1px solid #1a1a1a", fontSize: 13, color: "#888", fontWeight: 600 }}>
            JOBS ({jobs.length})
          </div>
          {jobs.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", color: "#444", fontSize: 13 }}>
              Nenhum job ainda. Clique em "Criar contas" para começar.
            </div>
          ) : (
            <div style={{ maxHeight: 480, overflowY: "auto" }}>
              {jobs.map(job => (
                <div
                  key={job.id}
                  onClick={() => setSelectedJob(job)}
                  style={{
                    padding: "12px 16px", borderBottom: "1px solid #1a1a1a", cursor: "pointer",
                    background: selectedJob?.id === job.id ? "#1a1a1a" : "transparent",
                    display: "flex", alignItems: "center", gap: 10,
                    transition: "background 0.15s",
                  }}
                >
                  {STATUS_ICON[job.status]}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: "#fff", fontFamily: "monospace" }}>
                      {job.result?.username ?? job.id.slice(0, 16) + "..."}
                    </div>
                    <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>
                      {STATUS_LABEL[job.status]} · {new Date(job.createdAt).toLocaleTimeString("pt-BR")}
                    </div>
                  </div>
                  {job.status === "done" && (
                    <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: "#0d2010", color: "#22c55e", fontWeight: 600 }}>OK</span>
                  )}
                  {job.status === "failed" && (
                    <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: "#1a0a0a", color: "#ef4444", fontWeight: 600 }}>ERRO</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Detail */}
        <div style={{ background: "#111", border: "1px solid #222", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "14px 16px", borderBottom: "1px solid #1a1a1a", fontSize: 13, color: "#888", fontWeight: 600 }}>
            DETALHES
          </div>
          {!selectedJob ? (
            <div style={{ padding: 32, textAlign: "center", color: "#444", fontSize: 13 }}>
              Clique em um job para ver detalhes
            </div>
          ) : (
            <div style={{ padding: 16 }}>
              {selectedJob.result && (
                <div style={{ marginBottom: 16, padding: 14, background: "#0a1a0a", borderRadius: 8, border: "1px solid #1a3a1a" }}>
                  <div style={{ fontSize: 11, color: "#22c55e", fontWeight: 700, marginBottom: 10 }}>CONTA CRIADA</div>
                  {Object.entries(selectedJob.result).map(([k, v]) => (
                    <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <span style={{ fontSize: 11, color: "#666", textTransform: "uppercase" }}>{k}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 12, color: "#ddd", fontFamily: "monospace" }}>{v}</span>
                        <button
                          onClick={() => copyText(v)}
                          style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: "#555" }}
                        >
                          <Copy size={11} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {selectedJob.error && (
                <div style={{ marginBottom: 16, padding: 14, background: "#1a0a0a", borderRadius: 8, border: "1px solid #3a1a1a", fontSize: 12, color: "#ef4444" }}>
                  {selectedJob.error}
                </div>
              )}

              <div style={{ fontSize: 11, color: "#666", fontWeight: 600, marginBottom: 8 }}>LOG</div>
              <div style={{
                background: "#0a0a0a", borderRadius: 6, padding: 10,
                maxHeight: 240, overflowY: "auto", fontFamily: "monospace", fontSize: 11,
              }}>
                {selectedJob.log.length === 0 ? (
                  <span style={{ color: "#444" }}>Aguardando...</span>
                ) : (
                  selectedJob.log.map((line, i) => (
                    <div key={i} style={{ color: "#888", marginBottom: 2 }}>{line}</div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
