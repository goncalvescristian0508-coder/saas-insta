"use client";

import { useState, useEffect, useCallback } from "react";
import {
  CalendarClock, Plus, Trash2, Clock, CheckCircle,
  XCircle, Loader2, Calendar, Share2, AlertCircle, Copy, RefreshCw
} from "lucide-react";

interface Account {
  id: string;
  username: string;
  source?: "oauth" | "private";
  profilePicUrl?: string | null;
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

function PostCard({ s, deletingId, onDelete, onRetry, retryingId }: {
  s: ScheduledPost;
  deletingId: string | null;
  onDelete: (id: string) => void;
  onRetry?: (id: string) => void;
  retryingId?: string | null;
}) {
  const cfg = statusConfig[s.status];
  return (
    <div className="glass-panel" style={{ padding: "1.1rem 1.25rem", borderRadius: "12px", display: "flex", gap: "1rem", alignItems: "flex-start" }}>
      <div style={{ width: "56px", height: "56px", borderRadius: "8px", background: "#0a0c14", overflow: "hidden", flexShrink: 0 }}>
        {s.video?.publicUrl
          ? <video src={s.video.publicUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} muted preload="metadata" />
          : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}><Copy size={18} color="var(--text-muted)" /></div>}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.2rem" }}>
              <Share2 size={13} color="var(--accent-gold)" />
              <span style={{ fontSize: "0.8rem", fontWeight: 600 }}>@{s.account.username}</span>
            </div>
            <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.video?.originalName ?? "Reel clonado"}</p>
          </div>
          <span style={{ padding: "3px 8px", borderRadius: "6px", fontSize: "0.72rem", fontWeight: 600, color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}`, flexShrink: 0 }}>
            {cfg.label}
          </span>
        </div>
        <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.45rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.caption}</p>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.6rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
            <Clock size={12} color="var(--text-muted)" />
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
              {s.status === "DONE" && s.postedAt ? `Postado em ${formatDateTime(s.postedAt)}` : formatDateTime(s.scheduledAt)}
            </span>
          </div>
          <div style={{ display: "flex", gap: "0.4rem" }}>
            {s.status === "FAILED" && onRetry && (
              <button onClick={() => onRetry(s.id)} disabled={retryingId === s.id} style={{ display: "flex", alignItems: "center", gap: "0.3rem", padding: "3px 8px", borderRadius: "6px", background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.2)", color: "#60a5fa", fontSize: "0.72rem", cursor: "pointer" }}>
                {retryingId === s.id ? <Loader2 size={11} style={{ animation: "spin 1s linear infinite" }} /> : <RefreshCw size={11} />}
                Tentar novamente
              </button>
            )}
            {s.status === "PENDING" && (
              <button onClick={() => onDelete(s.id)} disabled={deletingId === s.id} style={{ display: "flex", alignItems: "center", gap: "0.3rem", padding: "3px 8px", borderRadius: "6px", background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.15)", color: "#f87171", fontSize: "0.72rem", cursor: "pointer" }}>
                {deletingId === s.id ? <Loader2 size={11} style={{ animation: "spin 1s linear infinite" }} /> : <Trash2 size={11} />}
                Cancelar
              </button>
            )}
          </div>
        </div>
        {s.status === "FAILED" && s.errorMsg && (
          <div style={{ marginTop: "0.5rem", padding: "0.4rem 0.6rem", background: "rgba(239,68,68,0.07)", borderRadius: "6px", fontSize: "0.72rem", color: "#f87171" }}>{s.errorMsg}</div>
        )}
      </div>
    </div>
  );
}

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function CalendarView({
  schedules, calMonth, setCalMonth, calSelected, setCalSelected, deletingId, onDelete, onRetry, retryingId,
}: {
  schedules: ScheduledPost[];
  calMonth: { year: number; month: number };
  setCalMonth: React.Dispatch<React.SetStateAction<{ year: number; month: number }>>;
  calSelected: string | null;
  setCalSelected: React.Dispatch<React.SetStateAction<string | null>>;
  deletingId: string | null;
  onDelete: (id: string) => void;
  onRetry?: (id: string) => void;
  retryingId?: string | null;
}) {
  const { year, month } = calMonth;
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Build a map: "YYYY-MM-DD" -> { pending, done, failed }
  const dayMap: Record<string, { pending: boolean; done: boolean; failed: boolean }> = {};
  schedules.forEach((s) => {
    const d = new Date(s.scheduledAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (!dayMap[key]) dayMap[key] = { pending: false, done: false, failed: false };
    if (s.status === "PENDING" || s.status === "RUNNING") dayMap[key].pending = true;
    if (s.status === "DONE") dayMap[key].done = true;
    if (s.status === "FAILED") dayMap[key].failed = true;
  });

  // Build grid cells (nulls = empty leading cells)
  const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  // Pad to full weeks
  while (cells.length % 7 !== 0) cells.push(null);

  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const selectedPosts = calSelected
    ? schedules.filter((s) => {
        const d = new Date(s.scheduledAt);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        return key === calSelected;
      })
    : [];

  const goMonth = (delta: number) => {
    setCalSelected(null);
    setCalMonth(({ year: y, month: m }) => {
      let nm = m + delta;
      let ny = y;
      if (nm < 0) { nm = 11; ny--; }
      if (nm > 11) { nm = 0; ny++; }
      return { year: ny, month: nm };
    });
  };

  return (
    <div>
      {/* Month navigation */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
        <button onClick={() => goMonth(-1)} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--text-secondary)", borderRadius: "8px", width: "32px", height: "32px", cursor: "pointer", fontSize: "1rem", display: "flex", alignItems: "center", justifyContent: "center" }}>‹</button>
        <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>{MONTHS[month]} {year}</span>
        <button onClick={() => goMonth(1)} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--text-secondary)", borderRadius: "8px", width: "32px", height: "32px", cursor: "pointer", fontSize: "1rem", display: "flex", alignItems: "center", justifyContent: "center" }}>›</button>
      </div>

      {/* Calendar grid */}
      <div style={{ background: "rgba(12,16,24,0.5)", borderRadius: "14px", border: "1px solid var(--border-color)", overflow: "hidden" }}>
        {/* Weekday headers */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: "1px solid var(--border-color)" }}>
          {WEEKDAYS.map((w) => (
            <div key={w} style={{ padding: "0.5rem 0", textAlign: "center", fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.05em" }}>{w}</div>
          ))}
        </div>

        {/* Days grid */}
        {Array.from({ length: cells.length / 7 }, (_, row) => (
          <div key={row} style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: row < cells.length / 7 - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
            {cells.slice(row * 7, row * 7 + 7).map((day, col) => {
              if (!day) return <div key={col} style={{ minHeight: "52px" }} />;
              const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const info = dayMap[key];
              const isToday = key === todayKey;
              const isSelected = key === calSelected;
              return (
                <div
                  key={col}
                  onClick={() => setCalSelected(isSelected ? null : key)}
                  style={{
                    minHeight: "52px", padding: "0.4rem 0.5rem", cursor: info ? "pointer" : "default",
                    background: isSelected ? "rgba(201,162,39,0.1)" : "transparent",
                    borderLeft: col > 0 ? "1px solid rgba(255,255,255,0.04)" : "none",
                    transition: "background 0.15s",
                    position: "relative",
                  }}
                  onMouseEnter={(e) => { if (info && !isSelected) e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
                  onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
                >
                  <span style={{
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    width: "24px", height: "24px", borderRadius: "50%", fontSize: "0.78rem", fontWeight: isToday ? 700 : 400,
                    color: isToday ? "#000" : isSelected ? "var(--accent-gold)" : "var(--text-secondary)",
                    background: isToday ? "var(--accent-gold)" : "transparent",
                  }}>{day}</span>
                  {info && (
                    <div style={{ display: "flex", gap: "3px", marginTop: "4px", flexWrap: "wrap" }}>
                      {info.pending && <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#c9a227", display: "inline-block" }} />}
                      {info.done && <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#4ade80", display: "inline-block" }} />}
                      {info.failed && <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#f87171", display: "inline-block" }} />}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: "1rem", marginTop: "0.6rem", justifyContent: "flex-end" }}>
        {[{ color: "#c9a227", label: "Pendente" }, { color: "#4ade80", label: "Publicado" }, { color: "#f87171", label: "Falhou" }].map(({ color, label }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "0.72rem", color: "var(--text-muted)" }}>
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: color, display: "inline-block" }} />
            {label}
          </div>
        ))}
      </div>

      {/* Posts for selected day */}
      {calSelected && (
        <div style={{ marginTop: "1rem" }}>
          <p style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.6rem" }}>
            {selectedPosts.length} post(s) em {calSelected.split("-").reverse().join("/")}
          </p>
          {selectedPosts.length === 0 ? (
            <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", textAlign: "center", padding: "1rem" }}>Nenhum post neste dia</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {selectedPosts.map((s) => <PostCard key={s.id} s={s} deletingId={deletingId} onDelete={onDelete} onRetry={onRetry} retryingId={retryingId} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function SchedulePage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [schedules, setSchedules] = useState<ScheduledPost[]>([]);
  const [loadingPage, setLoadingPage] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [retryingAll, setRetryingAll] = useState(false);
  const [confirmClear, setConfirmClear] = useState<null | "pending" | "done" | "failed" | "all">(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  const [calMonth, setCalMonth] = useState(() => { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() }; });
  const [calSelected, setCalSelected] = useState<string | null>(null);

  const [selectedAccounts, setSelectedAccounts] = useState<Record<string, boolean>>({});
  const [selectedVideoIds, setSelectedVideoIds] = useState<string[]>([]);

  function getDefaultDateTime() {
    const d = new Date(Date.now() + 10 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    return { date, time };
  }

  const [form, setForm] = useState({
    caption: "", ...getDefaultDateTime(),
    intervalSeconds: 30, batchMode: false, batchSize: 3, batchIntervalHours: 2,
    distributeVideos: false,
  });

  const showToast = (type: "success" | "error", msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  };

  const loadData = useCallback(async () => {
    setLoadingPage(true);
    const [accRes, vidRes, schRes] = await Promise.all([
      fetch("/api/private-ig/accounts"),
      fetch("/api/media/upload"),
      fetch("/api/schedule"),
    ]);
    const [accData, vidData, schData] = await Promise.all([
      accRes.json(), vidRes.json(), schRes.json(),
    ]);
    const accs = (accData.accounts ?? []) as Account[];
    // Only OAuth accounts support scheduling (DB foreign key)
    const oauthAccs = accs.filter((a) => a.source === "oauth");
    setAccounts(oauthAccs);
    const sel: Record<string, boolean> = {};
    oauthAccs.forEach((a) => { sel[a.id] = true; });
    setSelectedAccounts(sel);
    setVideos(vidData.videos ?? []);
    setSchedules(schData.schedules ?? []);
    setLoadingPage(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const accountIds = Object.entries(selectedAccounts).filter(([, v]) => v).map(([k]) => k);
    if (accountIds.length === 0 || selectedVideoIds.length === 0 || !form.caption || !form.date || !form.time) {
      showToast("error", "Preencha todos os campos, selecione ao menos uma conta e um vídeo");
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
      body: JSON.stringify({
        accountIds,
        videoIds: selectedVideoIds,
        caption: form.caption,
        scheduledAt,
        intervalSeconds: form.intervalSeconds,
        distributeVideos: form.distributeVideos,
        ...(form.batchMode ? { batchSize: form.batchSize, batchIntervalHours: form.batchIntervalHours } : {}),
      }),
    });

    if (res.ok) {
      const data = await res.json();
      const count = Array.isArray(data.schedules) ? data.schedules.length : 1;
      showToast("success", `${count} post(s) agendado(s) com sucesso!`);
      setSelectedVideoIds([]);
      setForm({ caption: "", ...getDefaultDateTime(), intervalSeconds: 30, batchMode: false, batchSize: 3, batchIntervalHours: 2, distributeVideos: false });
      await loadData();
    } else {
      const data = await res.json();
      showToast("error", data.error ?? "Erro ao agendar");
    }
    setSubmitting(false);
  }

  async function clearSchedules(filter: "pending" | "done" | "failed" | "all") {
    setClearing(true);
    setConfirmClear(null);
    const res = await fetch("/api/schedule", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filter }),
    });
    if (res.ok) {
      const data = await res.json();
      showToast("success", `${data.deleted} agendamento(s) removido(s)`);
      await loadData();
    } else {
      showToast("error", "Erro ao limpar agendamentos");
    }
    setClearing(false);
  }

  async function handleRetry(id: string) {
    setRetryingId(id);
    const res = await fetch(`/api/schedule/${id}`, { method: "POST" });
    if (res.ok) {
      setSchedules((s) => s.map((p) => p.id === id ? { ...p, status: "PENDING", errorMsg: null } : p));
      showToast("success", "Post reenfileirado para retry");
    } else {
      showToast("error", "Erro ao retentar post");
    }
    setRetryingId(null);
  }

  async function retryAllFailed() {
    setRetryingAll(true);
    const res = await fetch("/api/schedule", { method: "PATCH" });
    if (res.ok) {
      const data = await res.json();
      showToast("success", `${data.retried} post(s) reenfileirado(s) para retry`);
      await loadData();
    } else {
      showToast("error", "Erro ao retentar posts");
    }
    setRetryingAll(false);
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

      {/* Confirm clear modal */}
      {confirmClear && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div className="glass-panel" style={{ padding: "2rem", borderRadius: "16px", maxWidth: "400px", width: "90%", textAlign: "center" }}>
            <Trash2 size={32} color="#f87171" style={{ margin: "0 auto 1rem" }} />
            <h3 style={{ fontWeight: 700, marginBottom: "0.5rem" }}>Confirmar limpeza</h3>
            <p style={{ fontSize: "0.88rem", color: "var(--text-secondary)", marginBottom: "1.5rem" }}>
              {confirmClear === "all" && "Isso vai remover TODOS os agendamentos (pendentes, publicados e falhos)."}
              {confirmClear === "pending" && "Isso vai remover todos os agendamentos pendentes."}
              {confirmClear === "done" && "Isso vai remover todos os posts já publicados."}
              {confirmClear === "failed" && "Isso vai remover todos os agendamentos que falharam."}
            </p>
            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center" }}>
              <button onClick={() => setConfirmClear(null)} style={{ padding: "0.6rem 1.25rem", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "var(--text-secondary)", cursor: "pointer", fontSize: "0.875rem" }}>Cancelar</button>
              <button onClick={() => void clearSchedules(confirmClear)} disabled={clearing} style={{ padding: "0.6rem 1.25rem", borderRadius: "8px", border: "none", background: "rgba(239,68,68,0.15)", color: "#f87171", cursor: "pointer", fontSize: "0.875rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.4rem" }}>
                {clearing ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Trash2 size={14} />} Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "2rem" }}>
        <div>
          <h1 className="page-title">Agendamento</h1>
          <p className="page-subtitle">Programme posts para datas e horas específicas</p>
        </div>
        {schedules.filter(s => s.status === "PENDING").length > 0 && (
          <div style={{ padding: "0.5rem 1rem", background: "rgba(201,162,39,0.08)", border: "1px solid rgba(201,162,39,0.15)", borderRadius: "8px", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
            {schedules.filter(s => s.status === "PENDING").length} pendente(s)
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: "1.5rem", alignItems: "start" }}>
        {/* Form */}
        <div className="glass-panel" style={{ padding: "1.75rem", borderRadius: "14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "1.5rem" }}>
            <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "rgba(201,162,39,0.12)", border: "1px solid rgba(201,162,39,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Plus size={16} color="var(--accent-gold)" />
            </div>
            <h2 style={{ fontSize: "1rem", fontWeight: 700 }}>Novo Agendamento</h2>
          </div>

          {accounts.length === 0 ? (
            <div style={{ padding: "1.25rem", background: "rgba(201,162,39,0.06)", border: "1px solid rgba(201,162,39,0.15)", borderRadius: "10px", display: "flex", gap: "0.6rem" }}>
              <AlertCircle size={16} color="var(--accent-gold)" style={{ flexShrink: 0, marginTop: "2px" }} />
              <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                Conecte uma conta Instagram via OAuth em <strong style={{ color: "#fff" }}>Contas</strong> para agendar posts.
              </p>
            </div>
          ) : videos.length === 0 ? (
            <div style={{ padding: "1.25rem", background: "rgba(201,162,39,0.06)", border: "1px solid rgba(201,162,39,0.15)", borderRadius: "10px", display: "flex", gap: "0.6rem" }}>
              <AlertCircle size={16} color="var(--accent-gold)" style={{ flexShrink: 0, marginTop: "2px" }} />
              <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                Adicione vídeos à <strong style={{ color: "#fff" }}>Biblioteca</strong> para agendar posts.
              </p>
            </div>
          ) : (
            <form onSubmit={(e) => void handleSubmit(e)} style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}>
              {/* Accounts multi-select */}
              <div>
                <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.6rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Contas ({Object.values(selectedAccounts).filter(Boolean).length} selecionada(s))
                </label>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.4rem 0.6rem", borderRadius: "6px", background: "rgba(201,162,39,0.05)", cursor: "pointer", fontSize: "0.78rem", color: "var(--text-muted)", fontWeight: 600 }}>
                    <input
                      type="checkbox"
                      checked={accounts.every((a) => selectedAccounts[a.id])}
                      onChange={(e) => {
                        const val = e.target.checked;
                        const s: Record<string, boolean> = {};
                        accounts.forEach((a) => { s[a.id] = val; });
                        setSelectedAccounts(s);
                      }}
                      style={{ accentColor: "var(--accent-gold)" }}
                    />
                    Selecionar todas
                  </label>
                  {accounts.map((a) => (
                    <label key={a.id} style={{
                      display: "flex", alignItems: "center", gap: "0.5rem",
                      padding: "0.5rem 0.6rem", borderRadius: "6px", cursor: "pointer",
                      background: selectedAccounts[a.id] ? "rgba(201,162,39,0.07)" : "rgba(255,255,255,0.02)",
                      border: `1px solid ${selectedAccounts[a.id] ? "rgba(201,162,39,0.2)" : "transparent"}`,
                      transition: "all 0.15s",
                    }}>
                      <input
                        type="checkbox"
                        checked={Boolean(selectedAccounts[a.id])}
                        onChange={() => setSelectedAccounts((s) => ({ ...s, [a.id]: !s[a.id] }))}
                        style={{ accentColor: "var(--accent-gold)" }}
                      />
                      <span style={{ fontSize: "0.85rem" }}>@{a.username}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Videos multi-select */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
                  <label style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    Vídeos da Biblioteca ({selectedVideoIds.length} selecionado{selectedVideoIds.length !== 1 ? "s" : ""})
                  </label>
                  <button type="button" onClick={() => setSelectedVideoIds(selectedVideoIds.length === videos.length ? [] : videos.map((v) => v.id))}
                    style={{ fontSize: "0.72rem", fontWeight: 600, color: selectedVideoIds.length === videos.length ? "#f87171" : "var(--accent-gold)", background: "transparent", border: "none", cursor: "pointer", padding: 0 }}>
                    {selectedVideoIds.length === videos.length ? "Desmarcar todos" : "Selecionar todos"}
                  </button>
                </div>
                <div style={{ maxHeight: "170px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.25rem", padding: "0.35rem", background: "rgba(255,255,255,0.02)", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
                  {videos.map((v) => {
                    const checked = selectedVideoIds.includes(v.id);
                    return (
                      <label key={v.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.4rem 0.5rem", borderRadius: "6px", cursor: "pointer", background: checked ? "rgba(201,162,39,0.07)" : "transparent", border: `1px solid ${checked ? "rgba(201,162,39,0.2)" : "transparent"}`, transition: "all 0.15s" }}>
                        <input type="checkbox" checked={checked}
                          onChange={() => setSelectedVideoIds((prev) => prev.includes(v.id) ? prev.filter((id) => id !== v.id) : [...prev, v.id])}
                          style={{ accentColor: "var(--accent-gold)", flexShrink: 0 }} />
                        <span style={{ fontSize: "0.82rem", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.originalName}</span>
                        <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", flexShrink: 0 }}>{formatBytes(v.sizeBytes)}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Caption */}
              <div>
                <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.4rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Legenda
                </label>
                <textarea value={form.caption} onChange={(e) => setForm(f => ({ ...f, caption: e.target.value }))} className="input-field" rows={3} placeholder="Escreva a legenda..." style={{ resize: "vertical", width: "100%" }} />
              </div>

              {/* Date + Time */}
              <div style={{ display: "flex", gap: "0.75rem" }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.4rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>Data</label>
                  <input type="date" value={form.date} onChange={(e) => setForm(f => ({ ...f, date: e.target.value }))} className="input-field" min={new Date().toISOString().split("T")[0]} style={{ width: "100%" }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.4rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>Hora</label>
                  <input type="time" value={form.time} onChange={(e) => setForm(f => ({ ...f, time: e.target.value }))} className="input-field" style={{ width: "100%" }} />
                </div>
              </div>

              {/* Interval + batch mode */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem", padding: "0.85rem", background: "rgba(255,255,255,0.02)", borderRadius: "10px", border: "1px solid var(--border-color)" }}>
                {/* Distribute toggle */}
                <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", padding: "0.5rem 0.6rem", borderRadius: "8px", background: form.distributeVideos ? "rgba(96,165,250,0.07)" : "rgba(255,255,255,0.02)", border: `1px solid ${form.distributeVideos ? "rgba(96,165,250,0.25)" : "transparent"}`, transition: "all 0.15s" }}>
                  <input type="checkbox" checked={form.distributeVideos}
                    onChange={(e) => setForm((f) => ({ ...f, distributeVideos: e.target.checked }))}
                    style={{ accentColor: "#60a5fa" }} />
                  <div>
                    <span style={{ fontSize: "0.83rem", fontWeight: 600, color: form.distributeVideos ? "#60a5fa" : "var(--text-secondary)" }}>Distribuir entre contas</span>
                    <p style={{ fontSize: "0.71rem", color: "var(--text-muted)", margin: 0 }}>
                      {form.distributeVideos ? "Cada conta recebe vídeos diferentes" : "Todas as contas recebem os mesmos vídeos"}
                    </p>
                  </div>
                </label>

                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 600, color: "var(--text-muted)", marginBottom: "0.3rem", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                      Intervalo entre vídeos (s)
                    </label>
                    <input type="number" min={10} max={3600} value={form.intervalSeconds}
                      onChange={(e) => setForm((f) => ({ ...f, intervalSeconds: Math.max(10, Number(e.target.value)) }))}
                      className="input-field" style={{ width: "100%" }} />
                  </div>
                  <div style={{ paddingTop: "1.4rem" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", cursor: "pointer", fontSize: "0.82rem", fontWeight: 600, whiteSpace: "nowrap" }}>
                      <input type="checkbox" checked={form.batchMode}
                        onChange={(e) => setForm((f) => ({ ...f, batchMode: e.target.checked }))}
                        style={{ accentColor: "var(--accent-gold)" }} />
                      Modo Lote
                    </label>
                  </div>
                </div>
                {form.batchMode && (
                  <div style={{ display: "flex", gap: "0.6rem" }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: "block", fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: "0.3rem" }}>Vídeos por lote</label>
                      <input type="number" min={1} max={50} value={form.batchSize}
                        onChange={(e) => setForm((f) => ({ ...f, batchSize: Math.max(1, Number(e.target.value)) }))}
                        className="input-field" style={{ width: "100%" }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: "block", fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: "0.3rem" }}>Intervalo entre lotes (h)</label>
                      <input type="number" min={1} max={48} value={form.batchIntervalHours}
                        onChange={(e) => setForm((f) => ({ ...f, batchIntervalHours: Math.max(1, Number(e.target.value)) }))}
                        className="input-field" style={{ width: "100%" }} />
                    </div>
                  </div>
                )}
                {selectedVideoIds.length > 0 && (
                  <p style={{ fontSize: "0.72rem", color: "var(--text-muted)", margin: 0 }}>
                    {(() => {
                      const nContas = Object.values(
                        Object.fromEntries(Object.entries(selectedAccounts).filter(([,v]) => v))
                      ).length;
                      if (form.distributeVideos && nContas > 1) {
                        const perConta = Math.ceil(selectedVideoIds.length / nContas);
                        return `${selectedVideoIds.length} vídeos ÷ ${nContas} contas = ~${perConta} por conta`;
                      }
                      if (form.batchMode)
                        return `${selectedVideoIds.length} vídeos em lotes de ${form.batchSize} · a cada ${form.batchIntervalHours}h`;
                      return `${selectedVideoIds.length} vídeo${selectedVideoIds.length > 1 ? "s" : ""} · ${form.intervalSeconds}s de intervalo`;
                    })()}
                  </p>
                )}
              </div>

              <button type="submit" disabled={submitting} className="btn btn-primary" style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", marginTop: "0.25rem" }}>
                {submitting
                  ? <><Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> Agendando...</>
                  : <><CalendarClock size={16} /> Agendar Post</>}
              </button>
            </form>
          )}
        </div>

        {/* Schedule List / Calendar */}
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <h2 style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text-secondary)" }}>Posts Agendados</h2>
              <div style={{ display: "flex", borderRadius: "8px", overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)" }}>
                {(["list", "calendar"] as const).map((m) => (
                  <button key={m} onClick={() => setViewMode(m)} style={{ padding: "0.3rem 0.75rem", background: viewMode === m ? "rgba(201,162,39,0.15)" : "transparent", border: "none", color: viewMode === m ? "var(--accent-gold)" : "var(--text-muted)", fontSize: "0.75rem", fontWeight: 600, cursor: "pointer", transition: "all 0.15s" }}>
                    {m === "list" ? "Lista" : "Calendário"}
                  </button>
                ))}
              </div>
            </div>
            {schedules.length > 0 && (
              <div style={{ display: "flex", gap: "0.4rem" }}>
                {schedules.some(s => s.status === "PENDING") && (
                  <button onClick={() => setConfirmClear("pending")} style={{ display: "flex", alignItems: "center", gap: "0.3rem", padding: "0.35rem 0.7rem", borderRadius: "7px", border: "1px solid rgba(201,162,39,0.2)", background: "rgba(201,162,39,0.06)", color: "var(--accent-gold)", fontSize: "0.75rem", cursor: "pointer" }}>
                    <Trash2 size={11} /> Limpar pendentes
                  </button>
                )}
                {schedules.some(s => s.status === "DONE") && (
                  <button onClick={() => setConfirmClear("done")} style={{ display: "flex", alignItems: "center", gap: "0.3rem", padding: "0.35rem 0.7rem", borderRadius: "7px", border: "1px solid rgba(74,222,128,0.2)", background: "rgba(74,222,128,0.05)", color: "#4ade80", fontSize: "0.75rem", cursor: "pointer" }}>
                    <Trash2 size={11} /> Limpar publicados
                  </button>
                )}
                {schedules.some(s => s.status === "FAILED") && (
                  <>
                    <button onClick={() => void retryAllFailed()} disabled={retryingAll} style={{ display: "flex", alignItems: "center", gap: "0.3rem", padding: "0.35rem 0.7rem", borderRadius: "7px", border: "1px solid rgba(96,165,250,0.25)", background: "rgba(96,165,250,0.08)", color: "#60a5fa", fontSize: "0.75rem", cursor: "pointer", fontWeight: 600 }}>
                      {retryingAll ? <Loader2 size={11} style={{ animation: "spin 1s linear infinite" }} /> : <RefreshCw size={11} />} Retentar falhos
                    </button>
                    <button onClick={() => setConfirmClear("failed")} style={{ display: "flex", alignItems: "center", gap: "0.3rem", padding: "0.35rem 0.7rem", borderRadius: "7px", border: "1px solid rgba(239,68,68,0.2)", background: "rgba(239,68,68,0.06)", color: "#f87171", fontSize: "0.75rem", cursor: "pointer" }}>
                      <Trash2 size={11} /> Limpar falhos
                    </button>
                  </>
                )}
                <button onClick={() => setConfirmClear("all")} style={{ display: "flex", alignItems: "center", gap: "0.3rem", padding: "0.35rem 0.7rem", borderRadius: "7px", border: "1px solid rgba(239,68,68,0.25)", background: "rgba(239,68,68,0.08)", color: "#f87171", fontSize: "0.75rem", cursor: "pointer", fontWeight: 600 }}>
                  <Trash2 size={11} /> Limpar tudo
                </button>
              </div>
            )}
          </div>
          {schedules.length === 0 ? (
            <div style={{ textAlign: "center", padding: "3rem", background: "rgba(12,16,24,0.5)", borderRadius: "14px", border: "1px solid var(--border-color)" }}>
              <Calendar size={36} color="var(--text-muted)" style={{ margin: "0 auto 0.85rem" }} />
              <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>Nenhum post agendado ainda</p>
            </div>
          ) : viewMode === "calendar" ? (
            <CalendarView
              schedules={schedules}
              calMonth={calMonth}
              setCalMonth={setCalMonth}
              calSelected={calSelected}
              setCalSelected={setCalSelected}
              deletingId={deletingId}
              onDelete={(id) => void deleteSchedule(id)}
              onRetry={(id) => void handleRetry(id)}
              retryingId={retryingId}
            />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
              {schedules.map((s) => (
                <PostCard key={s.id} s={s} deletingId={deletingId} onDelete={(id) => void deleteSchedule(id)} onRetry={(id) => void handleRetry(id)} retryingId={retryingId} />
              ))}
            </div>
          )}
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
