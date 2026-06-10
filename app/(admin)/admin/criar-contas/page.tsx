"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useRef, useCallback } from "react";
import { Loader2, Plus, RefreshCw, CheckCircle2, XCircle, Clock, Copy, Download, MessageSquare, Send, Upload } from "lucide-react";

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

interface CodeEntry {
  jobId: string;
  type: "email" | "phone";
  contact: string;
  code: string | null;
  receivedAt: string;
  resolvedAt?: string;
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
  const [emailsText, setEmailsText] = useState(""); // "email:senha" per line
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [codes, setCodes] = useState<CodeEntry[]>([]);
  const [submitCode, setSubmitCode] = useState<{ jobId: string; value: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const codesPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = (ev.target?.result as string) || "";
      // Support both email:pass and email;pass formats
      const normalized = text.replace(/;/g, ":").trim();
      setEmailsText(prev => prev ? prev + "\n" + normalized : normalized);
    };
    reader.readAsText(file);
    // Reset input so same file can be imported again
    e.target.value = "";
  }, []);

  async function fetchJobs() {
    setFetching(true);
    try {
      const r = await fetch("/api/admin/criar-contas");
      if (r.ok) {
        const data = await r.json();
        const list: Job[] = Array.isArray(data) ? data : [];
        setJobs(list);
        // Keep selectedJob in sync
        setSelectedJob(prev => prev ? (list.find(j => j.id === prev.id) ?? prev) : null);
      }
    } finally {
      setFetching(false);
    }
  }

  async function fetchCodes() {
    try {
      const r = await fetch("/api/admin/criar-contas?codes=1");
      if (r.ok) {
        const data = await r.json();
        if (Array.isArray(data)) setCodes(data);
      }
    } catch {}
  }

  useEffect(() => {
    fetchJobs();
    fetchCodes();
    pollRef.current = setInterval(fetchJobs, 5000);
    codesPollRef.current = setInterval(fetchCodes, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (codesPollRef.current) clearInterval(codesPollRef.current);
    };
  }, []);

  function parseEmails() {
    return emailsText.split("\n")
      .map(l => l.trim()).filter(Boolean)
      .map(l => {
        // Support both "email:senha" and "email;senha" formats
        const sep = l.includes(";") && !l.includes(":") ? ";" : ":";
        const idx = l.indexOf(sep);
        if (idx === -1) return { email: l, emailPassword: "" };
        return { email: l.slice(0, idx).trim(), emailPassword: l.slice(idx + 1).trim() };
      });
  }

  async function handleCreate() {
    setLoading(true);
    try {
      const emails = parseEmails();
      const r = await fetch("/api/admin/criar-contas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity, emails: emails.length ? emails : undefined }),
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

  async function handleSubmitCode(jobId: string, code: string) {
    if (!code.trim()) return;
    setSubmitting(true);
    try {
      const r = await fetch("/api/admin/criar-contas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, code: code.trim() }),
      });
      if (r.ok) {
        setSubmitCode(null);
        await fetchCodes();
      }
    } finally {
      setSubmitting(false);
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
  const pendingCodes = codes.filter(c => !c.code);

  return (
    <div style={{ padding: "28px 24px", maxWidth: 1100, margin: "0 auto", fontFamily: "var(--font-geist-sans, sans-serif)" }}>
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
          { label: "Códigos pendentes", value: pendingCodes.length, color: "#a78bfa" },
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

        {/* Email list */}
        <div style={{ flex: 1, minWidth: 220 }}>
          <label style={{ fontSize: 12, color: "#888", display: "block", marginBottom: 6 }}>
            Emails Hotmail/Outlook <span style={{ color: "#555" }}>(email:senha — uma por linha)</span>
          </label>
          <textarea
            value={emailsText}
            onChange={e => setEmailsText(e.target.value)}
            placeholder={"exemplo@hotmail.com:minhasenha123\noutro@outlook.com:outrasenha"}
            rows={3}
            style={{
              width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #333",
              background: "#0a0a0a", color: "#ddd", fontSize: 12, fontFamily: "monospace",
              resize: "vertical", outline: "none", boxSizing: "border-box",
            }}
          />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 5 }}>
            <span style={{ fontSize: 11, color: "#555" }}>
              Bot entra no email automaticamente para pegar o código
            </span>
            <button
              onClick={() => fileInputRef.current?.click()}
              title="Importar arquivo .txt (email:senha)"
              style={{
                display: "flex", alignItems: "center", gap: 5, padding: "4px 10px",
                borderRadius: 6, border: "1px solid #333", background: "#1a1a1a",
                color: "#aaa", cursor: "pointer", fontSize: 11,
              }}
            >
              <Upload size={11} /> Importar .txt
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,text/plain"
              style={{ display: "none" }}
              onChange={handleFileImport}
            />
          </div>
        </div>

        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button
            onClick={() => { fetchJobs(); fetchCodes(); }}
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

      {/* Códigos Recentes (last 1 min) */}
      <div style={{
        background: "#0d0b17", border: `1px solid ${pendingCodes.length > 0 ? "#4c1d95" : "#1e1a2e"}`,
        borderRadius: 12, marginBottom: 24, overflow: "hidden",
        boxShadow: pendingCodes.length > 0 ? "0 0 0 1px #7c3aed33" : "none",
      }}>
        <div style={{
          padding: "14px 16px", borderBottom: "1px solid #1e1a2e",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <MessageSquare size={14} style={{ color: "#a78bfa" }} />
          <span style={{ fontSize: 13, color: "#a78bfa", fontWeight: 600 }}>
            CÓDIGOS RECENTES
          </span>
          <span style={{ fontSize: 11, color: "#555", marginLeft: 4 }}>— últimos 60 segundos</span>
          {pendingCodes.length > 0 && (
            <span style={{
              marginLeft: "auto", fontSize: 11, padding: "2px 8px",
              borderRadius: 4, background: "#4c1d95", color: "#c4b5fd", fontWeight: 700,
            }}>
              {pendingCodes.length} AGUARDANDO
            </span>
          )}
        </div>

        {codes.length === 0 ? (
          <div style={{ padding: "20px 16px", textAlign: "center", color: "#3a3550", fontSize: 13 }}>
            Nenhum código recebido no último minuto
          </div>
        ) : (
          <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            {codes.map((c, i) => (
              <div key={i} style={{
                background: "#0a0a14", border: `1px solid ${c.code ? "#1a2a1a" : "#3b1f6a"}`,
                borderRadius: 8, padding: "12px 14px",
                display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{
                      fontSize: 10, padding: "1px 6px", borderRadius: 3,
                      background: c.type === "phone" ? "#1a2a3a" : "#2a1a3a",
                      color: c.type === "phone" ? "#60a5fa" : "#c084fc", fontWeight: 600,
                    }}>
                      {c.type === "phone" ? "📱 SMS" : "✉️ EMAIL"}
                    </span>
                    <span style={{ fontSize: 12, color: "#888", fontFamily: "monospace" }}>{c.contact}</span>
                    <span style={{ fontSize: 11, color: "#444" }}>
                      job: {c.jobId.slice(0, 10)}...
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: "#555" }}>
                    Recebido às {new Date(c.receivedAt).toLocaleTimeString("pt-BR")}
                    {c.resolvedAt && <span style={{ color: "#22c55e", marginLeft: 8 }}>✓ Código enviado</span>}
                  </div>
                </div>

                {c.code ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{
                      fontSize: 18, fontWeight: 700, fontFamily: "monospace", letterSpacing: 4,
                      color: "#22c55e", background: "#0d2010", padding: "6px 14px", borderRadius: 6,
                    }}>
                      {c.code}
                    </span>
                    <button onClick={() => copyText(c.code!)} style={{ background: "none", border: "none", cursor: "pointer", color: "#555", padding: 4 }}>
                      <Copy size={13} />
                    </button>
                  </div>
                ) : (
                  /* Manual code submission */
                  submitCode?.jobId === c.jobId ? (
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <input
                        autoFocus
                        value={submitCode.value}
                        onChange={e => setSubmitCode({ jobId: c.jobId, value: e.target.value })}
                        onKeyDown={e => e.key === "Enter" && handleSubmitCode(c.jobId, submitCode.value)}
                        placeholder="Digite o código"
                        style={{
                          height: 34, padding: "0 10px", borderRadius: 6, border: "1px solid #4c1d95",
                          background: "#0a0a14", color: "#fff", fontSize: 14, fontFamily: "monospace",
                          width: 140, outline: "none",
                        }}
                      />
                      <button
                        onClick={() => handleSubmitCode(c.jobId, submitCode.value)}
                        disabled={submitting || !submitCode.value.trim()}
                        style={{
                          height: 34, padding: "0 12px", borderRadius: 6, border: "none",
                          background: "#7c3aed", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontSize: 13,
                          opacity: submitting ? 0.6 : 1,
                        }}
                      >
                        {submitting ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                        Enviar
                      </button>
                      <button
                        onClick={() => setSubmitCode(null)}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "#555", padding: 4, fontSize: 18 }}
                      >×</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setSubmitCode({ jobId: c.jobId, value: "" })}
                      style={{
                        height: 32, padding: "0 12px", borderRadius: 6, border: "1px solid #4c1d95",
                        background: "#1e0a4e", color: "#a78bfa", cursor: "pointer", fontSize: 12, fontWeight: 600,
                        display: "flex", alignItems: "center", gap: 5,
                      }}
                    >
                      <MessageSquare size={12} />
                      Inserir código
                    </button>
                  )
                )}
              </div>
            ))}
          </div>
        )}
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
              Nenhum job ainda. Clique em &quot;Criar contas&quot; para começar.
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
