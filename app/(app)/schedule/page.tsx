"use client";

import { useState, useEffect, useCallback } from "react";
import {
  CalendarClock, Plus, Trash2, Clock, CheckCircle,
  XCircle, Loader2, Calendar, Share2, Film, AlertCircle
} from "lucide-react";

interface Account {
  id: string;
  username: string;
  profilePictureUrl: string | null;
}

interface Video {
  id: string;
  originalName: string;
  sizeBytes: number;
}

interface ScheduledPost {
  id: string;
  caption: string;
  scheduledAt: string;
  status: "PENDING" | "RUNNING" | "DONE" | "FAILED";
  errorMsg: string | null;
  postedAt: string | null;
  account: { username: string; profilePictureUrl: string | null };
  video: { originalName: string; publicUrl: string };
}

const statusConfig = {
  PENDING: { label: "Aguardando", color: "#c9a227", bg: "rgba(201,162,39,0.1)", border: "rgba(201,162,39,0.2)" },
  RUNNING: { label: "Postando...", color: "#60a5fa", bg: "rgba(96,165,250,0.1)", border: "rgba(96,165,250,0.2)" },
  DONE: { label: "Publicado", color: "#4ade80", bg: "rgba(74,222,128,0.1)", border: "rgba(74,222,128,0.2)" },
  FAILED: { label: "Falhou", color: "#f87171", bg: "rgba(248,113,113,0.1)", border: "rgba(248,113,113,0.2)" },
};

function formatBytes(b: number) {
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function SchedulePage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [schedules, setSchedules] = useState<ScheduledPost[]>([]);
  const [loadingPage, setLoadingPage] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const [form, setForm] = useState({
    accountId: "",
    videoId: "",
    caption: "",
    date: "",
    time: "",
  });

  const showToast = (type: "success" | "error", msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  };

  const loadData = useCallback(async () => {
    setLoadingPage(true);
    const [accRes, vidRes, schRes] = await Promise.all([
      fetch("/api/auth/instagram/accounts"),
      fetch("/api/media/upload"),
      fetch("/api/schedule"),
    ]);
    const [accData, vidData, schData] = await Promise.all([
      accRes.json(), vidRes.json(), schRes.json(),
    ]);
    setAccounts(accData.accounts ?? []);
    setVideos(vidData.videos ?? []);
    setSchedules(schData.schedules ?? []);
    setLoadingPage(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.accountId || !form.videoId || !form.caption || !form.date || !form.time) {
      showToast("error", "Preencha todos os campos");
      return;
    }

    const scheduledAt = new Date(`${form.date}T${form.time}`).toISOString();
    if (new Date(scheduledAt) <= new Date()) {
      showToast("error", "Escolha uma data e hora no futuro");
      return;
    }

    setSubmitting(true);
    const res = await fetch("/api/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, scheduledAt }),
    });

    if (res.ok) {
      showToast("success", "Post agendado com sucesso!");
      setForm({ accountId: "", videoId: "", caption: "", date: "", time: "" });
      await loadData();
    } else {
      const data = await res.json();
      showToast("error", data.error ?? "Erro ao agendar");
    }
    setSubmitting(false);
  }

  async function deleteSchedule(id: string) {
    setDeletingId(id);
    const res = await fetch(`/api/schedule/${id}`, { method: "DELETE" });
    if (res.ok) {
      setSchedules((s) => s.filter((x) => x.id !== id));
      showToast("success", "Agendamento removido");
    } else {
      showToast("error", "Erro ao remover agendamento");
    }
    setDeletingId(null);
  }

  if (loadingPage) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "50vh" }}>
        <Loader2 size={32} color="var(--accent-gold)" style={{ animation: "spin 1s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ position: "relative" }}>
      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", top: "1.5rem", right: "1.5rem", zIndex: 100,
          display: "flex", alignItems: "center", gap: "0.6rem",
          padding: "0.85rem 1.2rem", borderRadius: "12px",
          background: toast.type === "success" ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
          border: `1px solid ${toast.type === "success" ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
          backdropFilter: "blur(12px)", boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        }}>
          {toast.type === "success" ? <CheckCircle size={16} color="#4ade80" /> : <XCircle size={16} color="#f87171" />}
          <span style={{ fontSize: "0.875rem", color: toast.type === "success" ? "#4ade80" : "#f87171" }}>{toast.msg}</span>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "2rem" }}>
        <div>
          <h1 className="page-title">Agendamento</h1>
          <p className="page-subtitle">Programme posts para datas e horas específicas</p>
        </div>
        {schedules.length > 0 && (
          <div style={{
            padding: "0.5rem 1rem",
            background: "rgba(201,162,39,0.08)",
            border: "1px solid rgba(201,162,39,0.15)",
            borderRadius: "8px",
            fontSize: "0.8rem",
            color: "var(--text-secondary)",
          }}>
            {schedules.filter(s => s.status === "PENDING").length} pendente{schedules.filter(s => s.status === "PENDING").length !== 1 ? "s" : ""}
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: "1.5rem", alignItems: "start" }}>
        {/* Form */}
        <div className="glass-panel" style={{ padding: "1.75rem", borderRadius: "14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "1.5rem" }}>
            <div style={{
              width: "32px", height: "32px", borderRadius: "8px",
              background: "rgba(201,162,39,0.12)", border: "1px solid rgba(201,162,39,0.2)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Plus size={16} color="var(--accent-gold)" />
            </div>
            <h2 style={{ fontSize: "1rem", fontWeight: 700 }}>Novo Agendamento</h2>
          </div>

          {accounts.length === 0 ? (
            <div style={{
              padding: "1.25rem",
              background: "rgba(201,162,39,0.06)",
              border: "1px solid rgba(201,162,39,0.15)",
              borderRadius: "10px",
              display: "flex", gap: "0.6rem",
            }}>
              <AlertCircle size={16} color="var(--accent-gold)" style={{ flexShrink: 0, marginTop: "2px" }} />
              <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                Conecte pelo menos uma conta Instagram em <strong style={{ color: "#fff" }}>Contas</strong> para agendar posts.
              </p>
            </div>
          ) : videos.length === 0 ? (
            <div style={{
              padding: "1.25rem",
              background: "rgba(201,162,39,0.06)",
              border: "1px solid rgba(201,162,39,0.15)",
              borderRadius: "10px",
              display: "flex", gap: "0.6rem",
            }}>
              <AlertCircle size={16} color="var(--accent-gold)" style={{ flexShrink: 0, marginTop: "2px" }} />
              <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                Adicione vídeos à sua <strong style={{ color: "#fff" }}>Biblioteca</strong> para agendar posts.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}>
              {/* Account */}
              <div>
                <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.4rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Conta Instagram
                </label>
                <select
                  value={form.accountId}
                  onChange={(e) => setForm(f => ({ ...f, accountId: e.target.value }))}
                  className="input-field"
                  style={{ width: "100%" }}
                >
                  <option value="">Selecione uma conta...</option>
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>@{a.username}</option>
                  ))}
                </select>
              </div>

              {/* Video */}
              <div>
                <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.4rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Vídeo da Biblioteca
                </label>
                <select
                  value={form.videoId}
                  onChange={(e) => setForm(f => ({ ...f, videoId: e.target.value }))}
                  className="input-field"
                  style={{ width: "100%" }}
                >
                  <option value="">Selecione um vídeo...</option>
                  {videos.map(v => (
                    <option key={v.id} value={v.id}>{v.originalName} ({formatBytes(v.sizeBytes)})</option>
                  ))}
                </select>
              </div>

              {/* Caption */}
              <div>
                <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.4rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Legenda
                </label>
                <textarea
                  value={form.caption}
                  onChange={(e) => setForm(f => ({ ...f, caption: e.target.value }))}
                  className="input-field"
                  rows={3}
                  placeholder="Escreva a legenda..."
                  style={{ resize: "vertical", width: "100%" }}
                />
              </div>

              {/* Date + Time */}
              <div style={{ display: "flex", gap: "0.75rem" }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.4rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    Data
                  </label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm(f => ({ ...f, date: e.target.value }))}
                    className="input-field"
                    min={new Date().toISOString().split("T")[0]}
                    style={{ width: "100%" }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.4rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    Hora
                  </label>
                  <input
                    type="time"
                    value={form.time}
                    onChange={(e) => setForm(f => ({ ...f, time: e.target.value }))}
                    className="input-field"
                    style={{ width: "100%" }}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="btn btn-primary"
                style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", marginTop: "0.25rem" }}
              >
                {submitting
                  ? <><Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> Agendando...</>
                  : <><CalendarClock size={16} /> Agendar Post</>}
              </button>
            </form>
          )}
        </div>

        {/* Schedule List */}
        <div>
          <h2 style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "1rem" }}>
            Posts Agendados
          </h2>

          {schedules.length === 0 ? (
            <div style={{
              textAlign: "center", padding: "3rem",
              background: "rgba(12,16,24,0.5)",
              borderRadius: "14px", border: "1px solid var(--border-color)",
            }}>
              <Calendar size={36} color="var(--text-muted)" style={{ margin: "0 auto 0.85rem" }} />
              <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>
                Nenhum post agendado ainda
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
              {schedules.map((s) => {
                const cfg = statusConfig[s.status];
                return (
                  <div key={s.id} className="glass-panel" style={{
                    padding: "1.1rem 1.25rem",
                    borderRadius: "12px",
                    display: "flex",
                    gap: "1rem",
                    alignItems: "flex-start",
                  }}>
                    {/* Video thumbnail */}
                    <div style={{
                      width: "56px", height: "56px", borderRadius: "8px",
                      background: "#0a0c14", overflow: "hidden", flexShrink: 0,
                    }}>
                      <video src={s.video.publicUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} muted preload="metadata" />
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem" }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.2rem" }}>
                            <Share2 size={13} color="var(--accent-gold)" />
                            <span style={{ fontSize: "0.8rem", fontWeight: 600 }}>@{s.account.username}</span>
                          </div>
                          <p style={{
                            fontSize: "0.78rem", color: "var(--text-secondary)",
                            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                          }}>
                            {s.video.originalName}
                          </p>
                        </div>
                        <span style={{
                          padding: "3px 8px", borderRadius: "6px", fontSize: "0.72rem", fontWeight: 600,
                          color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}`,
                          flexShrink: 0,
                        }}>
                          {cfg.label}
                        </span>
                      </div>

                      <p style={{
                        fontSize: "0.78rem", color: "var(--text-muted)",
                        marginTop: "0.45rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      }}>
                        {s.caption}
                      </p>

                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.6rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                          <Clock size={12} color="var(--text-muted)" />
                          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                            {s.status === "DONE" && s.postedAt
                              ? `Postado em ${formatDateTime(s.postedAt)}`
                              : formatDateTime(s.scheduledAt)}
                          </span>
                        </div>
                        {s.status === "PENDING" && (
                          <button
                            onClick={() => deleteSchedule(s.id)}
                            disabled={deletingId === s.id}
                            style={{
                              display: "flex", alignItems: "center", gap: "0.3rem",
                              padding: "3px 8px", borderRadius: "6px",
                              background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.15)",
                              color: "#f87171", fontSize: "0.72rem", cursor: "pointer",
                            }}
                          >
                            {deletingId === s.id
                              ? <Loader2 size={11} style={{ animation: "spin 1s linear infinite" }} />
                              : <Trash2 size={11} />}
                            Cancelar
                          </button>
                        )}
                      </div>

                      {s.status === "FAILED" && s.errorMsg && (
                        <div style={{
                          marginTop: "0.5rem", padding: "0.4rem 0.6rem",
                          background: "rgba(239,68,68,0.07)", borderRadius: "6px",
                          fontSize: "0.72rem", color: "#f87171",
                        }}>
                          {s.errorMsg}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
