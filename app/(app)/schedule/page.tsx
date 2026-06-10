"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  CalendarClock, Plus, Trash2, Clock, CheckCircle,
  XCircle, Loader2, Calendar, Share2, AlertCircle, Copy, RefreshCw,
  Pencil, Tag, ChevronDown, ChevronUp, Zap, Eye,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Account {
  id: string;
  username: string;
  source?: "oauth" | "private";
  profilePicUrl?: string | null;
  tokenExpired?: boolean;
  accountStatus?: string;
}

interface Video {
  id: string;
  originalName: string;
  sizeBytes: number;
  publicUrl: string;
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

interface SchedulePreset {
  id: string;
  name: string;
  description?: string | null;
  times: string[];
  caption?: string | null;
}


// ─── Status config ────────────────────────────────────────────────────────────

const statusConfig = {
  PENDING: { label: "Aguardando", color: "#c9a227", bg: "rgba(201,162,39,0.1)", border: "rgba(201,162,39,0.2)" },
  RUNNING: { label: "Postando...", color: "#60a5fa", bg: "rgba(96,165,250,0.1)", border: "rgba(96,165,250,0.2)" },
  DONE: { label: "Publicado", color: "#4ade80", bg: "rgba(74,222,128,0.1)", border: "rgba(74,222,128,0.2)" },
  FAILED: { label: "Falhou", color: "#f87171", bg: "rgba(248,113,113,0.1)", border: "rgba(248,113,113,0.2)" },
};

const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function formatBytes(b: number) {
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}
function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ─── Lazy video thumb ─────────────────────────────────────────────────────────

function LazyVideoThumb({ src, style }: { src: string; style?: React.CSSProperties }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setActive(true); obs.disconnect(); } },
      { rootMargin: "100px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <div ref={wrapRef} style={{ width: "100%", height: "100%" }}>
      {active
        ? <video src={`${src}#t=0.5`} style={style ?? { width: "100%", height: "100%", objectFit: "cover" }} preload="metadata" muted playsInline />
        : <div style={{ width: "100%", height: "100%", background: "rgba(255,255,255,0.04)" }} />}
    </div>
  );
}

// ─── Video preview modal ─────────────────────────────────────────────────────

function VideoPreviewModal({ src, name, onClose }: { src: string; name: string; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ position: "relative", maxWidth: "360px", width: "100%", borderRadius: "16px", overflow: "hidden", background: "#000" }}>
        <video src={src} autoPlay controls style={{ width: "100%", display: "block", maxHeight: "70vh", objectFit: "contain" }} />
        <div style={{ position: "absolute", top: "0.6rem", right: "0.6rem" }}>
          <button onClick={onClose} style={{ background: "rgba(0,0,0,0.6)", border: "none", borderRadius: "50%", width: "30px", height: "30px", cursor: "pointer", color: "#fff", fontSize: "1rem", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
        </div>
        <div style={{ padding: "0.6rem 0.75rem", background: "rgba(0,0,0,0.7)" }}>
          <p style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.7)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Post card ────────────────────────────────────────────────────────────────

function PostCard({ s, deletingId, onDelete, onRetry, retryingId }: {
  s: ScheduledPost;
  deletingId: string | null;
  onDelete: (id: string) => void;
  onRetry?: (id: string) => void;
  retryingId?: string | null;
}) {
  const cfg = statusConfig[s.status];
  return (
    <div className="glass-panel" style={{ padding: "1.1rem 1.25rem", borderRadius: "12px", display: "flex", gap: "1rem", alignItems: "flex-start", overflow: "hidden" }}>
      <div style={{ width: "56px", height: "56px", borderRadius: "8px", background: "#0a0c14", overflow: "hidden", flexShrink: 0 }}>
        {s.video?.publicUrl
          ? <LazyVideoThumb src={s.video.publicUrl} />
          : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}><Copy size={18} color="var(--text-muted)" /></div>}
      </div>
      <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.2rem" }}>
              <Share2 size={13} color="var(--accent-gold)" />
              <span style={{ fontSize: "0.8rem", fontWeight: 600 }}>@{s.account.username}</span>
            </div>
            <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.video?.originalName ?? "Reel clonado"}</p>
          </div>
          <span style={{ padding: "3px 8px", borderRadius: "6px", fontSize: "0.72rem", fontWeight: 600, color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}`, flexShrink: 0 }}>{cfg.label}</span>
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
          <div style={{ marginTop: "0.5rem", padding: "0.4rem 0.6rem", background: "rgba(239,68,68,0.07)", borderRadius: "6px", fontSize: "0.72rem", color: "#f87171", overflowWrap: "break-word", wordBreak: "break-word", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{s.errorMsg}</div>
        )}
      </div>
    </div>
  );
}

// ─── Calendar view ────────────────────────────────────────────────────────────

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
  const dayMap: Record<string, { pending: boolean; done: boolean; failed: boolean }> = {};
  schedules.forEach((s) => {
    const d = new Date(s.scheduledAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (!dayMap[key]) dayMap[key] = { pending: false, done: false, failed: false };
    if (s.status === "PENDING" || s.status === "RUNNING") dayMap[key].pending = true;
    if (s.status === "DONE") dayMap[key].done = true;
    if (s.status === "FAILED") dayMap[key].failed = true;
  });
  const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const selectedPosts = calSelected ? schedules.filter((s) => {
    const d = new Date(s.scheduledAt);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` === calSelected;
  }) : [];
  const goMonth = (delta: number) => {
    setCalSelected(null);
    setCalMonth(({ year: y, month: m }) => {
      let nm = m + delta, ny = y;
      if (nm < 0) { nm = 11; ny--; }
      if (nm > 11) { nm = 0; ny++; }
      return { year: ny, month: nm };
    });
  };
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
        <button onClick={() => goMonth(-1)} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--text-secondary)", borderRadius: "8px", width: "32px", height: "32px", cursor: "pointer", fontSize: "1rem", display: "flex", alignItems: "center", justifyContent: "center" }}>‹</button>
        <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>{MONTHS[month]} {year}</span>
        <button onClick={() => goMonth(1)} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--text-secondary)", borderRadius: "8px", width: "32px", height: "32px", cursor: "pointer", fontSize: "1rem", display: "flex", alignItems: "center", justifyContent: "center" }}>›</button>
      </div>
      <div style={{ background: "rgba(12,16,24,0.5)", borderRadius: "14px", border: "1px solid var(--border-color)", overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: "1px solid var(--border-color)" }}>
          {WEEKDAYS.map((w) => <div key={w} style={{ padding: "0.5rem 0", textAlign: "center", fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.05em" }}>{w}</div>)}
        </div>
        {Array.from({ length: cells.length / 7 }, (_, row) => (
          <div key={row} style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: row < cells.length / 7 - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
            {cells.slice(row * 7, row * 7 + 7).map((day, col) => {
              if (!day) return <div key={col} style={{ minHeight: "52px" }} />;
              const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const info = dayMap[key];
              const isToday = key === todayKey;
              const isSelected = key === calSelected;
              return (
                <div key={col} onClick={() => setCalSelected(isSelected ? null : key)}
                  style={{ minHeight: "52px", padding: "0.4rem 0.5rem", cursor: info ? "pointer" : "default", background: isSelected ? "rgba(201,162,39,0.1)" : "transparent", borderLeft: col > 0 ? "1px solid rgba(255,255,255,0.04)" : "none", transition: "background 0.15s", position: "relative" }}
                  onMouseEnter={(e) => { if (info && !isSelected) e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
                  onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}>
                  <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "24px", height: "24px", borderRadius: "50%", fontSize: "0.78rem", fontWeight: isToday ? 700 : 400, color: isToday ? "#000" : isSelected ? "var(--accent-gold)" : "var(--text-secondary)", background: isToday ? "var(--accent-gold)" : "transparent" }}>{day}</span>
                  {info && <div style={{ display: "flex", gap: "3px", marginTop: "4px", flexWrap: "wrap" }}>
                    {info.pending && <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#c9a227", display: "inline-block" }} />}
                    {info.done && <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#4ade80", display: "inline-block" }} />}
                    {info.failed && <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#f87171", display: "inline-block" }} />}
                  </div>}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: "1rem", marginTop: "0.6rem", justifyContent: "flex-end" }}>
        {[{ color: "#c9a227", label: "Pendente" }, { color: "#4ade80", label: "Publicado" }, { color: "#f87171", label: "Falhou" }].map(({ color, label }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "0.72rem", color: "var(--text-muted)" }}>
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: color, display: "inline-block" }} />{label}
          </div>
        ))}
      </div>
      {calSelected && (
        <div style={{ marginTop: "1rem" }}>
          <p style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.6rem" }}>{selectedPosts.length} post(s) em {calSelected.split("-").reverse().join("/")}</p>
          {selectedPosts.length === 0
            ? <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", textAlign: "center", padding: "1rem" }}>Nenhum post neste dia</p>
            : <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {selectedPosts.map((s) => <PostCard key={s.id} s={s} deletingId={deletingId} onDelete={onDelete} onRetry={onRetry} retryingId={retryingId} />)}
            </div>}
        </div>
      )}
    </div>
  );
}

// ─── Multi-date picker (for preset scheduling) ────────────────────────────────

function MultiDatePicker({ selected, onChange }: { selected: string[]; onChange: (dates: string[]) => void }) {
  const today = new Date();
  const [nav, setNav] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const { year, month } = nav;
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);

  const toggle = (key: string) => {
    if (key < todayKey) return;
    onChange(selected.includes(key) ? selected.filter(d => d !== key) : [...selected, key].sort());
  };
  const goMonth = (d: number) => setNav(({ year: y, month: m }) => {
    let nm = m + d, ny = y;
    if (nm < 0) { nm = 11; ny--; }
    if (nm > 11) { nm = 0; ny++; }
    return { year: ny, month: nm };
  });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
        <button type="button" onClick={() => goMonth(-1)} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--text-secondary)", borderRadius: "6px", width: "28px", height: "28px", cursor: "pointer", fontSize: "0.95rem", display: "flex", alignItems: "center", justifyContent: "center" }}>‹</button>
        <span style={{ fontWeight: 700, fontSize: "0.85rem" }}>{MONTHS[month]} {year}</span>
        <button type="button" onClick={() => goMonth(1)} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--text-secondary)", borderRadius: "6px", width: "28px", height: "28px", cursor: "pointer", fontSize: "0.95rem", display: "flex", alignItems: "center", justifyContent: "center" }}>›</button>
      </div>
      <div style={{ background: "rgba(12,16,24,0.4)", borderRadius: "10px", border: "1px solid var(--border-color)", overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
          {WEEKDAYS.map(w => <div key={w} style={{ padding: "0.3rem 0", textAlign: "center", fontSize: "0.65rem", fontWeight: 700, color: "var(--text-muted)" }}>{w}</div>)}
        </div>
        {Array.from({ length: cells.length / 7 }, (_, row) => (
          <div key={row} style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
            {cells.slice(row * 7, row * 7 + 7).map((day, col) => {
              if (!day) return <div key={col} style={{ minHeight: "36px" }} />;
              const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const isPast = key < todayKey;
              const isToday = key === todayKey;
              const isSel = selected.includes(key);
              return (
                <div key={col} onClick={() => toggle(key)}
                  style={{ minHeight: "36px", display: "flex", alignItems: "center", justifyContent: "center", cursor: isPast ? "not-allowed" : "pointer", borderLeft: col > 0 ? "1px solid rgba(255,255,255,0.04)" : "none", background: isSel ? "rgba(201,162,39,0.18)" : "transparent", transition: "background 0.1s" }}
                  onMouseEnter={(e) => { if (!isPast && !isSel) e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
                  onMouseLeave={(e) => { if (!isSel) e.currentTarget.style.background = "transparent"; }}>
                  <span style={{ width: "28px", height: "28px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.75rem", fontWeight: isSel ? 700 : isToday ? 700 : 400, color: isPast ? "rgba(255,255,255,0.15)" : isSel ? "var(--accent-gold)" : isToday ? "#000" : "var(--text-secondary)", background: isToday && !isSel ? "rgba(255,255,255,0.3)" : "transparent", border: isSel ? "2px solid var(--accent-gold)" : "none" }}>{day}</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {selected.length > 0 && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.4rem" }}>
          <span style={{ fontSize: "0.72rem", color: "var(--accent-gold)", fontWeight: 600 }}>{selected.length} dia(s) selecionado(s)</span>
          <button type="button" onClick={() => onChange([])} style={{ fontSize: "0.68rem", color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>Limpar</button>
        </div>
      )}
    </div>
  );
}

// ─── Preset card ──────────────────────────────────────────────────────────────

function PresetCard({ preset, onEdit, onDelete, onUse, selected }: {
  preset: SchedulePreset;
  onEdit?: () => void;
  onDelete?: () => void;
  onUse: () => void;
  selected?: boolean;
}) {
  return (
    <div onClick={onUse} style={{ padding: "1rem", borderRadius: "12px", background: selected ? "rgba(201,162,39,0.1)" : "rgba(255,255,255,0.03)", border: `1px solid ${selected ? "rgba(201,162,39,0.4)" : "rgba(255,255,255,0.07)"}`, cursor: "pointer", transition: "all 0.15s", position: "relative" }}
      onMouseEnter={(e) => { if (!selected) e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)"; }}
      onMouseLeave={(e) => { if (!selected) e.currentTarget.style.borderColor = "rgba(255,255,255,0.07)"; }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.5rem" }}>
        <div>
          <p style={{ fontWeight: 700, fontSize: "0.88rem", color: selected ? "var(--accent-gold)" : "#ededed" }}>{preset.name}</p>
          {preset.description && <p style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "0.1rem" }}>{preset.description}</p>}
        </div>
        <div style={{ display: "flex", gap: "0.25rem" }} onClick={(e) => e.stopPropagation()}>
          {onEdit && <button onClick={onEdit} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "2px" }}><Pencil size={12} /></button>}
          {onDelete && <button onClick={onDelete} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "2px" }}><Trash2 size={12} /></button>}
        </div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginBottom: preset.caption ? "0.5rem" : 0 }}>
        {preset.times.map(t => (
          <span key={t} style={{ fontSize: "0.68rem", fontWeight: 600, color: selected ? "var(--accent-gold)" : "#60a5fa", background: selected ? "rgba(201,162,39,0.12)" : "rgba(96,165,250,0.1)", padding: "2px 7px", borderRadius: "5px" }}>{t}</span>
        ))}
      </div>
      {preset.caption && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: "0.3rem", marginTop: "0.4rem", padding: "0.35rem 0.5rem", background: "rgba(255,255,255,0.03)", borderRadius: "6px", borderLeft: "2px solid rgba(201,162,39,0.3)" }}>
          <Tag size={10} color="var(--accent-gold)" style={{ marginTop: "2px", flexShrink: 0 }} />
          <p style={{ fontSize: "0.68rem", color: "var(--text-muted)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{preset.caption}</p>
        </div>
      )}
    </div>
  );
}

// ─── Preset modal (create / edit) ─────────────────────────────────────────────

function PresetModal({ preset, onClose, onSave }: {
  preset?: SchedulePreset;
  onClose: () => void;
  onSave: (data: { name: string; description: string; times: string[]; caption: string }) => Promise<void>;
}) {
  const [name, setName] = useState(preset?.name ?? "");
  const [description, setDescription] = useState(preset?.description ?? "");
  const [caption, setCaption] = useState(preset?.caption ?? "");
  const [times, setTimes] = useState<string[]>(preset?.times ?? []);
  const [timeInput, setTimeInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const addTime = () => {
    if (!timeInput) return;
    if (times.includes(timeInput)) return;
    setTimes(prev => [...prev, timeInput].sort());
    setTimeInput("");
  };

  const submit = async () => {
    if (!name.trim()) { setErr("Nome obrigatório"); return; }
    if (times.length === 0) { setErr("Adicione ao menos um horário"); return; }
    setSaving(true);
    setErr("");
    await onSave({ name: name.trim(), description: description.trim(), times, caption: caption.trim() });
    setSaving(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }} onClick={onClose}>
      <div className="glass-panel" style={{ width: "100%", maxWidth: "480px", borderRadius: "16px", padding: "1.75rem" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
          <h3 style={{ fontWeight: 700, fontSize: "1rem" }}>{preset ? "Editar Preset" : "Novo Preset"}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", fontSize: "1.2rem" }}>✕</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.35rem", textTransform: "uppercase", letterSpacing: "0.07em" }}>Nome *</label>
            <input className="input-field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Manhã intensiva" style={{ width: "100%" }} />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.35rem", textTransform: "uppercase", letterSpacing: "0.07em" }}>Descrição (opcional)</label>
            <input className="input-field" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex: Posts distribuídos pela manhã" style={{ width: "100%" }} />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.35rem", textTransform: "uppercase", letterSpacing: "0.07em" }}>Horários *</label>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <input type="time" className="input-field" value={timeInput} onChange={(e) => setTimeInput(e.target.value)} style={{ flex: 1 }} />
              <button type="button" onClick={addTime} disabled={!timeInput} style={{ padding: "0.5rem 1rem", borderRadius: "8px", background: "rgba(201,162,39,0.15)", border: "1px solid rgba(201,162,39,0.3)", color: "var(--accent-gold)", fontWeight: 700, cursor: "pointer", fontSize: "0.85rem" }}>+ Add</button>
            </div>
            {times.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "0.5rem" }}>
                {times.map(t => (
                  <span key={t} style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "0.75rem", fontWeight: 600, color: "#60a5fa", background: "rgba(96,165,250,0.1)", padding: "3px 8px", borderRadius: "6px", border: "1px solid rgba(96,165,250,0.2)" }}>
                    {t}
                    <button type="button" onClick={() => setTimes(prev => prev.filter(x => x !== t))} style={{ background: "none", border: "none", cursor: "pointer", color: "#60a5fa", padding: 0, lineHeight: 1 }}>×</button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.35rem", textTransform: "uppercase", letterSpacing: "0.07em" }}>Legenda padrão (opcional)</label>
            <textarea className="input-field" value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Legenda que será usada ao agendar com este preset..." rows={3} style={{ width: "100%", resize: "vertical" }} />
          </div>

          {err && <p style={{ fontSize: "0.8rem", color: "#f87171" }}>{err}</p>}

          <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end", marginTop: "0.25rem" }}>
            <button onClick={onClose} style={{ padding: "0.6rem 1.25rem", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "var(--text-secondary)", cursor: "pointer", fontSize: "0.875rem" }}>Cancelar</button>
            <button onClick={() => void submit()} disabled={saving} className="btn btn-primary" style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
              {saving ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <CheckCircle size={14} />}
              {preset ? "Salvar" : "Criar Preset"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SchedulePage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [schedules, setSchedules] = useState<ScheduledPost[]>([]);
  const [userPresets, setUserPresets] = useState<SchedulePreset[]>([]);
  const [loadingPage, setLoadingPage] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [retryingAll, setRetryingAll] = useState(false);
  const [confirmClear, setConfirmClear] = useState<null | "pending" | "done" | "failed" | "all">(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  const [statusFilter, setStatusFilter] = useState<"all" | "PENDING" | "DONE" | "FAILED">("all");
  const [calMonth, setCalMonth] = useState(() => { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() }; });
  const [calSelected, setCalSelected] = useState<string | null>(null);
  const [previewVideo, setPreviewVideo] = useState<{ src: string; name: string } | null>(null);

  // Left panel mode
  const [leftTab, setLeftTab] = useState<"manual" | "preset">("manual");

  // Manual form
  const [selectedAccounts, setSelectedAccounts] = useState<Record<string, boolean>>({});
  const [selectedVideoIds, setSelectedVideoIds] = useState<string[]>([]);

  function getDefaultDateTime() {
    const d = new Date(Date.now() + 10 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
  }
  const [form, setForm] = useState({ ...getDefaultDateTime(), intervalSeconds: 120, batchMode: false, batchSize: 3, batchIntervalHours: 2, distributeVideos: false });
  const [captions, setCaptions] = useState<string[]>([""]);

  // Preset form
  const [presetSelectedId, setPresetSelectedId] = useState<string | null>(null);
  const [presetDates, setPresetDates] = useState<string[]>([]);
  const [presetAccounts, setPresetAccounts] = useState<Record<string, boolean>>({});
  const [presetVideoIds, setPresetVideoIds] = useState<string[]>([]);
  const [presetCaptionOverride, setPresetCaptionOverride] = useState("");
  const [presetCaptionOpen, setPresetCaptionOpen] = useState(false);
  const [generatingPreset, setGeneratingPreset] = useState(false);

  // Preset management
  const [showPresetModal, setShowPresetModal] = useState(false);
  const [editingPreset, setEditingPreset] = useState<SchedulePreset | undefined>(undefined);

  const showToast = (type: "success" | "error", msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  };

  const loadData = useCallback(async () => {
    setLoadingPage(true);
    const [accRes, vidRes, schRes, preRes] = await Promise.all([
      fetch("/api/private-ig/accounts"),
      fetch("/api/media/upload"),
      fetch("/api/schedule"),
      fetch("/api/schedule/presets"),
    ]);
    const [accData, vidData, schData, preData] = await Promise.all([
      accRes.json(), vidRes.json(), schRes.json(), preRes.json(),
    ]);
    const accs = (accData.accounts ?? []) as Account[];
    const oauthAccs = accs.filter((a) => a.source === "oauth" && !a.tokenExpired && a.accountStatus !== "SUSPENDED" && a.accountStatus !== "QUARANTINE");
    setAccounts(oauthAccs);
    const sel: Record<string, boolean> = {};
    oauthAccs.forEach((a) => { sel[a.id] = true; });
    setSelectedAccounts(sel);
    setPresetAccounts(sel);
    setVideos(vidData.videos ?? []);
    setSchedules(schData.schedules ?? []);
    setUserPresets(preData.presets ?? []);
    setLoadingPage(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const schedulesRef = useRef(schedules);
  useEffect(() => { schedulesRef.current = schedules; }, [schedules]);
  useEffect(() => {
    const iv = setInterval(async () => {
      if (!schedulesRef.current.some(s => s.status === "PENDING" || s.status === "RUNNING")) return;
      const res = await fetch("/api/schedule");
      const data = await res.json();
      setSchedules(data.schedules ?? []);
    }, 30_000);
    return () => clearInterval(iv);
  }, []);

  // ── Manual submit ──────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const accountIds = Object.entries(selectedAccounts).filter(([, v]) => v).map(([k]) => k);
    const validCaptions = captions.map(c => c.trim()).filter(Boolean);
    if (accountIds.length === 0 || selectedVideoIds.length === 0 || validCaptions.length === 0 || !form.date || !form.time) {
      showToast("error", "Preencha todos os campos, selecione ao menos uma conta, um vídeo e uma legenda");
      return;
    }
    const scheduledAt = new Date(`${form.date}T${form.time}`).toISOString();
    if (new Date(scheduledAt) <= new Date()) { showToast("error", "Escolha uma data e hora no futuro"); return; }
    setSubmitting(true);
    const res = await fetch("/api/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountIds, videoIds: selectedVideoIds, captions: validCaptions, scheduledAt, intervalSeconds: form.intervalSeconds, distributeVideos: form.distributeVideos, ...(form.batchMode ? { batchSize: form.batchSize, batchIntervalHours: form.batchIntervalHours } : {}) }),
    });
    if (res.ok) {
      const data = await res.json();
      showToast("success", `${Array.isArray(data.schedules) ? data.schedules.length : 1} post(s) agendado(s) com sucesso!`);
      setSelectedVideoIds([]);
      setCaptions([""]);
      setForm({ ...getDefaultDateTime(), intervalSeconds: 30, batchMode: false, batchSize: 3, batchIntervalHours: 2, distributeVideos: false });
      await loadData();
    } else {
      const data = await res.json();
      showToast("error", data.error ?? "Erro ao agendar");
    }
    setSubmitting(false);
  }

  // ── Preset submit ──────────────────────────────────────────────────────────
  const getActivePreset = (): SchedulePreset | null => {
    if (!presetSelectedId) return null;
    return userPresets.find(p => p.id === presetSelectedId) ?? null;
  };

  async function handlePresetSchedule() {
    const preset = getActivePreset();
    const accountIds = Object.entries(presetAccounts).filter(([, v]) => v).map(([k]) => k);
    if (!preset) { showToast("error", "Selecione um preset"); return; }
    if (presetDates.length === 0) { showToast("error", "Selecione ao menos 1 data"); return; }
    if (accountIds.length === 0) { showToast("error", "Selecione ao menos 1 conta"); return; }
    if (presetVideoIds.length === 0) { showToast("error", "Selecione ao menos 1 vídeo"); return; }

    const caption = presetCaptionOverride.trim() || preset.caption || "";
    if (!caption) { showToast("error", "Adicione uma legenda ou defina uma no preset"); return; }

    setGeneratingPreset(true);
    let created = 0;
    // For each date × time combination, create a scheduled post
    for (const date of presetDates) {
      for (const time of preset.times) {
        const scheduledAt = new Date(`${date}T${time}:00`).toISOString();
        if (new Date(scheduledAt) <= new Date()) continue;
        const res = await fetch("/api/schedule", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accountIds, videoIds: presetVideoIds, caption, scheduledAt, intervalSeconds: 120, distributeVideos: presetVideoIds.length > 1 }),
        });
        if (res.ok) {
          const data = await res.json();
          created += Array.isArray(data.schedules) ? data.schedules.length : 1;
        }
      }
    }
    showToast("success", `${created} post(s) agendado(s) com sucesso!`);
    setPresetDates([]);
    setPresetCaptionOverride("");
    await loadData();
    setGeneratingPreset(false);
  }

  // ── Clear / retry ──────────────────────────────────────────────────────────
  async function clearSchedules(filter: "pending" | "done" | "failed" | "all") {
    setClearing(true);
    setConfirmClear(null);
    const res = await fetch("/api/schedule", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filter }) });
    if (res.ok) { const data = await res.json(); showToast("success", `${data.deleted} agendamento(s) removido(s)`); await loadData(); }
    else showToast("error", "Erro ao limpar agendamentos");
    setClearing(false);
  }
  async function handleRetry(id: string) {
    setRetryingId(id);
    const res = await fetch(`/api/schedule/${id}`, { method: "POST" });
    if (res.ok) { setSchedules((s) => s.map((p) => p.id === id ? { ...p, status: "PENDING", errorMsg: null } : p)); showToast("success", "Post reenfileirado"); }
    else showToast("error", "Erro ao retentar post");
    setRetryingId(null);
  }
  async function retryAllFailed() {
    setRetryingAll(true);
    const res = await fetch("/api/schedule", { method: "PATCH" });
    if (res.ok) { const data = await res.json(); showToast("success", `${data.retried} post(s) reenfileirado(s)`); await loadData(); }
    else showToast("error", "Erro ao retentar posts");
    setRetryingAll(false);
  }
  async function deleteSchedule(id: string) {
    setDeletingId(id);
    const res = await fetch(`/api/schedule/${id}`, { method: "DELETE" });
    if (res.ok) { setSchedules((s) => s.filter((x) => x.id !== id)); showToast("success", "Agendamento removido"); }
    else showToast("error", "Erro ao remover agendamento");
    setDeletingId(null);
  }

  // ── Preset CRUD ────────────────────────────────────────────────────────────
  async function handleSavePreset(data: { name: string; description: string; times: string[]; caption: string }) {
    if (editingPreset) {
      const res = await fetch(`/api/schedule/presets/${editingPreset.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      if (res.ok) { const json = await res.json(); setUserPresets(p => p.map(x => x.id === editingPreset.id ? json.preset : x)); showToast("success", "Preset atualizado"); }
      else showToast("error", "Erro ao salvar preset");
    } else {
      const res = await fetch("/api/schedule/presets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      if (res.ok) { const json = await res.json(); setUserPresets(p => [...p, json.preset]); showToast("success", "Preset criado"); }
      else showToast("error", "Erro ao criar preset");
    }
    setShowPresetModal(false);
    setEditingPreset(undefined);
  }
  async function handleDeletePreset(id: string) {
    if (!confirm("Deletar este preset?")) return;
    await fetch(`/api/schedule/presets/${id}`, { method: "DELETE" });
    setUserPresets(p => p.filter(x => x.id !== id));
    if (presetSelectedId === id) setPresetSelectedId(null);
    showToast("success", "Preset removido");
  }

  const filteredSchedules = statusFilter === "all" ? schedules : schedules.filter(s => s.status === statusFilter || (statusFilter === "PENDING" && s.status === "RUNNING"));
  const activePreset = getActivePreset();

  // Count pending+running posts per account username
  const pendingByUsername = schedules.reduce<Record<string, number>>((acc, s) => {
    if (s.status === "PENDING" || s.status === "RUNNING") {
      acc[s.account.username] = (acc[s.account.username] ?? 0) + 1;
    }
    return acc;
  }, {});

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
        <div style={{ position: "fixed", top: "1.5rem", right: "1.5rem", zIndex: 100, display: "flex", alignItems: "center", gap: "0.6rem", padding: "0.85rem 1.2rem", borderRadius: "12px", background: toast.type === "success" ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)", border: `1px solid ${toast.type === "success" ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`, backdropFilter: "blur(12px)", boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }}>
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
              {confirmClear === "all" && "Isso vai remover TODOS os agendamentos."}
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

      {/* Video preview modal */}
      {previewVideo && <VideoPreviewModal src={previewVideo.src} name={previewVideo.name} onClose={() => setPreviewVideo(null)} />}

      {/* Preset modal */}
      {showPresetModal && (
        <PresetModal
          preset={editingPreset}
          onClose={() => { setShowPresetModal(false); setEditingPreset(undefined); }}
          onSave={handleSavePreset}
        />
      )}

      {/* Page header */}
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
        {/* ── Left Panel ──────────────────────────────────────────────────── */}
        <div>
          {/* Tab switcher */}
          <div style={{ display: "flex", borderRadius: "10px", overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)", marginBottom: "1rem" }}>
            <button onClick={() => setLeftTab("manual")} style={{ flex: 1, padding: "0.55rem", background: leftTab === "manual" ? "rgba(201,162,39,0.15)" : "transparent", border: "none", color: leftTab === "manual" ? "var(--accent-gold)" : "var(--text-muted)", fontSize: "0.8rem", fontWeight: 600, cursor: "pointer", transition: "all 0.15s", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem" }}>
              <CalendarClock size={14} /> Manual
            </button>
            <button onClick={() => setLeftTab("preset")} style={{ flex: 1, padding: "0.55rem", background: leftTab === "preset" ? "rgba(201,162,39,0.15)" : "transparent", border: "none", color: leftTab === "preset" ? "var(--accent-gold)" : "var(--text-muted)", fontSize: "0.8rem", fontWeight: 600, cursor: "pointer", transition: "all 0.15s", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem" }}>
              <Zap size={14} /> Com Preset
            </button>
          </div>

          {/* ── MANUAL FORM ───────────────────────────────────────────────── */}
          {leftTab === "manual" && (
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
                  <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>Conecte uma conta Instagram via OAuth em <strong style={{ color: "#fff" }}>Contas</strong> para agendar posts.</p>
                </div>
              ) : videos.length === 0 ? (
                <div style={{ padding: "1.25rem", background: "rgba(201,162,39,0.06)", border: "1px solid rgba(201,162,39,0.15)", borderRadius: "10px", display: "flex", gap: "0.6rem" }}>
                  <AlertCircle size={16} color="var(--accent-gold)" style={{ flexShrink: 0, marginTop: "2px" }} />
                  <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>Adicione vídeos à <strong style={{ color: "#fff" }}>Biblioteca</strong> para agendar posts.</p>
                </div>
              ) : (
                <form onSubmit={(e) => void handleSubmit(e)} style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}>
                  {/* Accounts */}
                  <div>
                    <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.6rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>Contas ({Object.values(selectedAccounts).filter(Boolean).length} selecionada(s))</label>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.4rem 0.6rem", borderRadius: "6px", background: "rgba(201,162,39,0.05)", cursor: "pointer", fontSize: "0.78rem", color: "var(--text-muted)", fontWeight: 600 }}>
                        <input type="checkbox" checked={accounts.every((a) => selectedAccounts[a.id])} onChange={(e) => { const s: Record<string, boolean> = {}; accounts.forEach((a) => { s[a.id] = e.target.checked; }); setSelectedAccounts(s); }} style={{ accentColor: "var(--accent-gold)" }} />
                        Selecionar todas
                      </label>
                      {accounts.map((a) => {
                        const pendingCount = pendingByUsername[a.username] ?? 0;
                        return (
                          <label key={a.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.5rem 0.6rem", borderRadius: "6px", cursor: "pointer", background: selectedAccounts[a.id] ? "rgba(201,162,39,0.07)" : "rgba(255,255,255,0.02)", border: `1px solid ${selectedAccounts[a.id] ? "rgba(201,162,39,0.2)" : "transparent"}`, transition: "all 0.15s" }}>
                            <input type="checkbox" checked={Boolean(selectedAccounts[a.id])} onChange={() => setSelectedAccounts((s) => ({ ...s, [a.id]: !s[a.id] }))} style={{ accentColor: "var(--accent-gold)" }} />
                            <span style={{ fontSize: "0.85rem", flex: 1 }}>@{a.username}</span>
                            {pendingCount > 0 && (
                              <span style={{ fontSize: "0.68rem", fontWeight: 700, color: "#c9a227", background: "rgba(201,162,39,0.12)", border: "1px solid rgba(201,162,39,0.25)", borderRadius: "5px", padding: "1px 6px", flexShrink: 0 }}>
                                {pendingCount} agend.
                              </span>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* Videos */}
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
                      <label style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Vídeos da Biblioteca ({selectedVideoIds.length} selecionado{selectedVideoIds.length !== 1 ? "s" : ""})</label>
                      <button type="button" onClick={() => setSelectedVideoIds(selectedVideoIds.length === videos.length ? [] : videos.map((v) => v.id))} style={{ fontSize: "0.72rem", fontWeight: 600, color: selectedVideoIds.length === videos.length ? "#f87171" : "var(--accent-gold)", background: "transparent", border: "none", cursor: "pointer", padding: 0 }}>
                        {selectedVideoIds.length === videos.length ? "Desmarcar todos" : "Selecionar todos"}
                      </button>
                    </div>
                    <div style={{ maxHeight: "280px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.25rem", padding: "0.35rem", background: "rgba(255,255,255,0.02)", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
                      {videos.map((v) => {
                        const checked = selectedVideoIds.includes(v.id);
                        return (
                          <label key={v.id} style={{ display: "flex", alignItems: "center", gap: "0.6rem", padding: "0.35rem 0.5rem", borderRadius: "6px", cursor: "pointer", background: checked ? "rgba(201,162,39,0.07)" : "transparent", border: `1px solid ${checked ? "rgba(201,162,39,0.2)" : "transparent"}`, transition: "all 0.15s" }}>
                            <input type="checkbox" checked={checked} onChange={() => setSelectedVideoIds((prev) => prev.includes(v.id) ? prev.filter((id) => id !== v.id) : [...prev, v.id])} style={{ accentColor: "var(--accent-gold)", flexShrink: 0 }} />
                            <div style={{ width: 44, height: 44, borderRadius: 5, overflow: "hidden", flexShrink: 0, background: "rgba(255,255,255,0.05)" }}><LazyVideoThumb src={v.publicUrl} /></div>
                            <span style={{ fontSize: "0.82rem", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.originalName}</span>
                            <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", flexShrink: 0 }}>{formatBytes(v.sizeBytes)}</span>
                            <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setPreviewVideo({ src: v.publicUrl, name: v.originalName }); }} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "2px", flexShrink: 0, display: "flex", alignItems: "center" }} title="Pré-visualizar"><Eye size={14} /></button>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* Captions */}
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
                      <label style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        Legendas {captions.length > 1 && <span style={{ color: "var(--accent-gold)" }}>({captions.length})</span>}
                      </label>
                      <button type="button" onClick={() => setCaptions(prev => [...prev, ""])} style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--accent-gold)", background: "transparent", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: "3px" }}>
                        <Plus size={12} /> Adicionar legenda
                      </button>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                      {captions.map((cap, idx) => (
                        <div key={idx} style={{ position: "relative" }}>
                          <textarea
                            value={cap}
                            onChange={(e) => setCaptions(prev => prev.map((c, i) => i === idx ? e.target.value : c))}
                            className="input-field"
                            rows={2}
                            placeholder={captions.length > 1 ? `Legenda ${idx + 1}` : "Escreva a legenda..."}
                            style={{ resize: "vertical", width: "100%", paddingRight: captions.length > 1 ? "4rem" : undefined }}
                          />
                          {captions.length > 1 && (
                            <div style={{ position: "absolute", top: "0.45rem", right: "0.45rem", display: "flex", alignItems: "center", gap: "4px" }}>
                              <span style={{ fontSize: "0.62rem", fontWeight: 700, color: "var(--accent-gold)", background: "rgba(201,162,39,0.15)", border: "1px solid rgba(201,162,39,0.3)", borderRadius: "4px", padding: "1px 5px" }}>{idx + 1}</span>
                              <button type="button" onClick={() => setCaptions(prev => prev.filter((_, i) => i !== idx))} style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "4px", width: "20px", height: "20px", cursor: "pointer", color: "#f87171", fontSize: "0.9rem", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>×</button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    {captions.length > 1 && (
                      <p style={{ fontSize: "0.71rem", color: "var(--text-muted)", marginTop: "0.35rem", display: "flex", alignItems: "center", gap: "4px" }}>
                        <RefreshCw size={11} /> Legendas rotacionadas a cada postagem
                      </p>
                    )}
                  </div>

                  {/* Date + Time */}
                  <div style={{ display: "flex", gap: "0.75rem" }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.4rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>Data</label>
                      <input type="date" value={form.date} onChange={(e) => setForm(f => ({ ...f, date: e.target.value }))} className="input-field" min={(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })()} style={{ width: "100%" }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.4rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>Hora</label>
                      <input type="time" value={form.time} onChange={(e) => setForm(f => ({ ...f, time: e.target.value }))} className="input-field" style={{ width: "100%" }} />
                    </div>
                  </div>

                  {/* Interval + batch */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem", padding: "0.85rem", background: "rgba(255,255,255,0.02)", borderRadius: "10px", border: "1px solid var(--border-color)" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", padding: "0.5rem 0.6rem", borderRadius: "8px", background: form.distributeVideos ? "rgba(96,165,250,0.07)" : "rgba(255,255,255,0.02)", border: `1px solid ${form.distributeVideos ? "rgba(96,165,250,0.25)" : "transparent"}`, transition: "all 0.15s" }}>
                      <input type="checkbox" checked={form.distributeVideos} onChange={(e) => setForm((f) => ({ ...f, distributeVideos: e.target.checked }))} style={{ accentColor: "#60a5fa" }} />
                      <div>
                        <span style={{ fontSize: "0.83rem", fontWeight: 600, color: form.distributeVideos ? "#60a5fa" : "var(--text-secondary)" }}>Distribuir entre contas</span>
                        <p style={{ fontSize: "0.71rem", color: "var(--text-muted)", margin: 0 }}>{form.distributeVideos ? "Cada conta recebe vídeos diferentes" : "Todas as contas recebem os mesmos vídeos"}</p>
                      </div>
                    </label>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 600, color: "var(--text-muted)", marginBottom: "0.3rem", textTransform: "uppercase", letterSpacing: "0.07em" }}>Intervalo entre vídeos (s)</label>
                        <input type="number" min={60} max={3600} value={form.intervalSeconds} onChange={(e) => setForm((f) => ({ ...f, intervalSeconds: Math.max(60, Number(e.target.value)) }))} className="input-field" style={{ width: "100%" }} />
                      </div>
                      <div style={{ paddingTop: "1.4rem" }}>
                        <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", cursor: "pointer", fontSize: "0.82rem", fontWeight: 600, whiteSpace: "nowrap" }}>
                          <input type="checkbox" checked={form.batchMode} onChange={(e) => setForm((f) => ({ ...f, batchMode: e.target.checked }))} style={{ accentColor: "var(--accent-gold)" }} />
                          Modo Lote
                        </label>
                      </div>
                    </div>
                    {form.batchMode && (
                      <div style={{ display: "flex", gap: "0.6rem" }}>
                        <div style={{ flex: 1 }}>
                          <label style={{ display: "block", fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: "0.3rem" }}>Vídeos por lote</label>
                          <input type="number" min={1} max={50} value={form.batchSize} onChange={(e) => setForm((f) => ({ ...f, batchSize: Math.max(1, Number(e.target.value)) }))} className="input-field" style={{ width: "100%" }} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <label style={{ display: "block", fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: "0.3rem" }}>Intervalo entre lotes (h)</label>
                          <input type="number" min={1} max={48} value={form.batchIntervalHours} onChange={(e) => setForm((f) => ({ ...f, batchIntervalHours: Math.max(1, Number(e.target.value)) }))} className="input-field" style={{ width: "100%" }} />
                        </div>
                      </div>
                    )}
                  </div>

                  <button type="submit" disabled={submitting} className="btn btn-primary" style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", marginTop: "0.25rem" }}>
                    {submitting ? <><Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> Agendando...</> : <><CalendarClock size={16} /> Agendar Post</>}
                  </button>
                </form>
              )}
            </div>
          )}

          {/* ── PRESET FORM ───────────────────────────────────────────────── */}
          {leftTab === "preset" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {/* Step 1: Choose preset */}
              <div className="glass-panel" style={{ padding: "1.25rem", borderRadius: "14px" }}>
                <p style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.75rem" }}>1. Selecione um preset</p>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {userPresets.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "1.5rem", background: "rgba(12,16,24,0.4)", borderRadius: "10px", border: "1px dashed rgba(255,255,255,0.08)" }}>
                      <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", marginBottom: "0.75rem" }}>Nenhum preset criado ainda</p>
                      <button onClick={() => { setEditingPreset(undefined); setShowPresetModal(true); }} style={{ padding: "0.5rem 1rem", borderRadius: "8px", border: "1px solid rgba(201,162,39,0.3)", background: "rgba(201,162,39,0.08)", color: "var(--accent-gold)", fontSize: "0.8rem", fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
                        <Plus size={14} /> Criar primeiro preset
                      </button>
                    </div>
                  ) : (
                    <>
                      {userPresets.map(p => (
                        <PresetCard
                          key={p.id}
                          preset={p}
                          selected={presetSelectedId === p.id}
                          onEdit={() => { setEditingPreset(p); setShowPresetModal(true); }}
                          onDelete={() => void handleDeletePreset(p.id)}
                          onUse={() => {
                            setPresetSelectedId(p.id);
                            if (!presetCaptionOverride) setPresetCaptionOverride(p.caption ?? "");
                          }}
                        />
                      ))}
                      <button onClick={() => { setEditingPreset(undefined); setShowPresetModal(true); }} style={{ padding: "0.6rem", borderRadius: "10px", border: "1px dashed rgba(201,162,39,0.3)", background: "transparent", color: "var(--accent-gold)", fontSize: "0.8rem", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem" }}>
                        <Plus size={14} /> Criar novo preset
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Step 2: Select dates */}
              <div className="glass-panel" style={{ padding: "1.25rem", borderRadius: "14px" }}>
                <p style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.75rem" }}>2. Selecione os dias</p>
                <MultiDatePicker selected={presetDates} onChange={setPresetDates} />
              </div>

              {/* Step 3: Accounts + videos + caption */}
              <div className="glass-panel" style={{ padding: "1.25rem", borderRadius: "14px" }}>
                <p style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.75rem" }}>3. Contas, vídeos e legenda</p>

                {/* Accounts */}
                <div style={{ marginBottom: "1rem" }}>
                  <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 600, color: "var(--text-muted)", marginBottom: "0.4rem" }}>Contas ({Object.values(presetAccounts).filter(Boolean).length} selecionada(s))</label>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem", maxHeight: "180px", overflowY: "auto" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.3rem 0.5rem", borderRadius: "6px", background: "rgba(201,162,39,0.05)", cursor: "pointer", fontSize: "0.75rem", fontWeight: 600 }}>
                      <input type="checkbox" checked={accounts.every((a) => presetAccounts[a.id])} onChange={(e) => { const s: Record<string, boolean> = {}; accounts.forEach((a) => { s[a.id] = e.target.checked; }); setPresetAccounts(s); }} style={{ accentColor: "var(--accent-gold)" }} />
                      Selecionar todas
                    </label>
                    {accounts.map((a) => (
                      <label key={a.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.3rem 0.5rem", borderRadius: "6px", cursor: "pointer", background: presetAccounts[a.id] ? "rgba(201,162,39,0.07)" : "rgba(255,255,255,0.02)", border: `1px solid ${presetAccounts[a.id] ? "rgba(201,162,39,0.2)" : "transparent"}` }}>
                        <input type="checkbox" checked={Boolean(presetAccounts[a.id])} onChange={() => setPresetAccounts((s) => ({ ...s, [a.id]: !s[a.id] }))} style={{ accentColor: "var(--accent-gold)" }} />
                        <span style={{ fontSize: "0.82rem" }}>@{a.username}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Videos */}
                <div style={{ marginBottom: "1rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.4rem" }}>
                    <label style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--text-muted)" }}>Vídeos ({presetVideoIds.length} selecionado{presetVideoIds.length !== 1 ? "s" : ""})</label>
                    <button type="button" onClick={() => setPresetVideoIds(presetVideoIds.length === videos.length ? [] : videos.map(v => v.id))} style={{ fontSize: "0.68rem", color: "var(--accent-gold)", background: "none", border: "none", cursor: "pointer" }}>
                      {presetVideoIds.length === videos.length ? "Desmarcar" : "Todos"}
                    </button>
                  </div>
                  <div style={{ maxHeight: "200px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.2rem", padding: "0.3rem", background: "rgba(255,255,255,0.02)", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
                    {videos.map((v) => {
                      const checked = presetVideoIds.includes(v.id);
                      return (
                        <label key={v.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.3rem 0.4rem", borderRadius: "5px", cursor: "pointer", background: checked ? "rgba(201,162,39,0.07)" : "transparent", border: `1px solid ${checked ? "rgba(201,162,39,0.2)" : "transparent"}` }}>
                          <input type="checkbox" checked={checked} onChange={() => setPresetVideoIds(prev => prev.includes(v.id) ? prev.filter(id => id !== v.id) : [...prev, v.id])} style={{ accentColor: "var(--accent-gold)", flexShrink: 0 }} />
                          <div style={{ width: 36, height: 36, borderRadius: 4, overflow: "hidden", flexShrink: 0, background: "rgba(255,255,255,0.05)" }}><LazyVideoThumb src={v.publicUrl} /></div>
                          <span style={{ fontSize: "0.78rem", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.originalName}</span>
                          <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setPreviewVideo({ src: v.publicUrl, name: v.originalName }); }} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "2px", flexShrink: 0, display: "flex", alignItems: "center" }} title="Pré-visualizar"><Eye size={13} /></button>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Caption */}
                <div>
                  <button type="button" onClick={() => setPresetCaptionOpen(o => !o)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px", padding: "0.5rem 0.75rem", cursor: "pointer", marginBottom: presetCaptionOpen ? "0.5rem" : 0 }}>
                    <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                      <Tag size={12} /> Legenda {presetCaptionOverride ? "✓" : activePreset?.caption ? "(do preset)" : "(vazia)"}
                    </span>
                    {presetCaptionOpen ? <ChevronUp size={14} color="var(--text-muted)" /> : <ChevronDown size={14} color="var(--text-muted)" />}
                  </button>
                  {presetCaptionOpen && (
                    <textarea className="input-field" value={presetCaptionOverride} onChange={(e) => setPresetCaptionOverride(e.target.value)} placeholder={activePreset?.caption ? `Usando legenda do preset: "${activePreset.caption.slice(0, 50)}..."` : "Escreva a legenda ou defina uma no preset..."} rows={3} style={{ width: "100%", resize: "vertical" }} />
                  )}
                </div>
              </div>

              {/* Summary + Generate */}
              {activePreset && presetDates.length > 0 && (
                <div style={{ padding: "0.75rem 1rem", background: "rgba(201,162,39,0.06)", border: "1px solid rgba(201,162,39,0.15)", borderRadius: "10px", fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                  <strong style={{ color: "var(--accent-gold)" }}>{presetDates.length} dias × {activePreset.times.length} horários × {Object.values(presetAccounts).filter(Boolean).length} contas</strong>
                  {" = "}
                  <strong style={{ color: "#fff" }}>{presetDates.length * activePreset.times.length * Object.values(presetAccounts).filter(Boolean).length} posts</strong>
                </div>
              )}

              <button onClick={() => void handlePresetSchedule()} disabled={generatingPreset || !presetSelectedId || presetDates.length === 0} className="btn btn-primary" style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", opacity: (!presetSelectedId || presetDates.length === 0) ? 0.5 : 1 }}>
                {generatingPreset ? <><Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> Gerando posts...</> : <><Zap size={16} /> Gerar Posts com Preset</>}
              </button>
            </div>
          )}
        </div>

        {/* ── Right Panel ─────────────────────────────────────────────────── */}
        <div>
          {/* Tab row */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.6rem", flexWrap: "wrap" }}>
            <div style={{ display: "flex", borderRadius: "8px", overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)" }}>
              {(["list", "calendar"] as const).map((m) => (
                <button key={m} onClick={() => setViewMode(m)} style={{ padding: "0.3rem 0.75rem", background: viewMode === m ? "rgba(201,162,39,0.15)" : "transparent", border: "none", color: viewMode === m ? "var(--accent-gold)" : "var(--text-muted)", fontSize: "0.75rem", fontWeight: 600, cursor: "pointer", transition: "all 0.15s" }}>
                  {m === "list" ? "Lista" : "Calendário"}
                </button>
              ))}
            </div>
            {schedules.length > 0 && (
                  <div style={{ display: "flex", borderRadius: "8px", overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)" }}>
                    {([{ key: "all", label: "Todos" }, { key: "PENDING", label: "Pendentes" }, { key: "DONE", label: "Publicados" }, { key: "FAILED", label: "Falhos" }] as const).map(({ key, label }) => {
                      const count = key === "all" ? schedules.length : schedules.filter(s => s.status === key || (key === "PENDING" && s.status === "RUNNING")).length;
                      const active = statusFilter === key;
                      return (
                        <button key={key} onClick={() => setStatusFilter(key)} style={{ padding: "0.3rem 0.65rem", background: active ? "rgba(201,162,39,0.15)" : "transparent", border: "none", color: active ? "var(--accent-gold)" : "var(--text-muted)", fontSize: "0.73rem", fontWeight: 600, cursor: "pointer", transition: "all 0.15s", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                          {label}
                          {count > 0 && <span style={{ fontSize: "0.65rem", background: active ? "rgba(201,162,39,0.25)" : "rgba(255,255,255,0.08)", borderRadius: "10px", padding: "0 5px", minWidth: "16px", textAlign: "center" }}>{count}</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
          </div>

          {/* Action buttons */}
          {schedules.length > 0 && (
            <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "1rem" }}>
              {schedules.some(s => s.status === "PENDING") && <button onClick={() => setConfirmClear("pending")} style={{ display: "flex", alignItems: "center", gap: "0.3rem", padding: "0.35rem 0.7rem", borderRadius: "7px", border: "1px solid rgba(201,162,39,0.2)", background: "rgba(201,162,39,0.06)", color: "var(--accent-gold)", fontSize: "0.75rem", cursor: "pointer" }}><Trash2 size={11} /> Limpar pendentes</button>}
              {schedules.some(s => s.status === "DONE") && <button onClick={() => setConfirmClear("done")} style={{ display: "flex", alignItems: "center", gap: "0.3rem", padding: "0.35rem 0.7rem", borderRadius: "7px", border: "1px solid rgba(74,222,128,0.2)", background: "rgba(74,222,128,0.05)", color: "#4ade80", fontSize: "0.75rem", cursor: "pointer" }}><Trash2 size={11} /> Limpar publicados</button>}
              {schedules.some(s => s.status === "FAILED") && (
                <>
                  <button onClick={() => void retryAllFailed()} disabled={retryingAll} style={{ display: "flex", alignItems: "center", gap: "0.3rem", padding: "0.35rem 0.7rem", borderRadius: "7px", border: "1px solid rgba(96,165,250,0.25)", background: "rgba(96,165,250,0.08)", color: "#60a5fa", fontSize: "0.75rem", cursor: "pointer", fontWeight: 600 }}>
                    {retryingAll ? <Loader2 size={11} style={{ animation: "spin 1s linear infinite" }} /> : <RefreshCw size={11} />} Retentar falhos
                  </button>
                  <button onClick={() => setConfirmClear("failed")} style={{ display: "flex", alignItems: "center", gap: "0.3rem", padding: "0.35rem 0.7rem", borderRadius: "7px", border: "1px solid rgba(239,68,68,0.2)", background: "rgba(239,68,68,0.06)", color: "#f87171", fontSize: "0.75rem", cursor: "pointer" }}><Trash2 size={11} /> Limpar falhos</button>
                </>
              )}
              <button onClick={() => setConfirmClear("all")} style={{ display: "flex", alignItems: "center", gap: "0.3rem", padding: "0.35rem 0.7rem", borderRadius: "7px", border: "1px solid rgba(239,68,68,0.25)", background: "rgba(239,68,68,0.08)", color: "#f87171", fontSize: "0.75rem", cursor: "pointer", fontWeight: 600 }}><Trash2 size={11} /> Limpar tudo</button>
            </div>
          )}

          {/* Posts content */}
          {schedules.length === 0 ? (
            <div style={{ textAlign: "center", padding: "3rem", background: "rgba(12,16,24,0.5)", borderRadius: "14px", border: "1px solid var(--border-color)" }}>
              <Calendar size={36} color="var(--text-muted)" style={{ margin: "0 auto 0.85rem" }} />
              <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>Nenhum post agendado ainda</p>
            </div>
          ) : viewMode === "calendar" ? (
            <CalendarView schedules={schedules} calMonth={calMonth} setCalMonth={setCalMonth} calSelected={calSelected} setCalSelected={setCalSelected} deletingId={deletingId} onDelete={(id) => void deleteSchedule(id)} onRetry={(id) => void handleRetry(id)} retryingId={retryingId} />
          ) : filteredSchedules.length === 0 ? (
            <div style={{ textAlign: "center", padding: "2rem", background: "rgba(12,16,24,0.5)", borderRadius: "14px", border: "1px solid var(--border-color)" }}>
              <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>Nenhum post neste filtro</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
              {filteredSchedules.map((s) => (
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
