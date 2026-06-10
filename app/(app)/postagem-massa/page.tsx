"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Send, Loader2, CheckCircle2, XCircle, Film, UploadCloud, AlertCircle, Clock, Trash2, Eye } from "lucide-react";
import Link from "next/link";

type AccountRow = { id: string; username: string; source?: "oauth" | "private"; tokenExpired?: boolean; accountStatus?: string };
type VideoRow = { id: string; originalName: string; publicUrl: string; sizeBytes: number; coverUrl?: string | null };
type StatusRow = { accountId: string; username: string; success?: boolean; error?: string; pending?: boolean };
type HistoryEntry = {
  id: string;
  timestamp: string;
  videoName: string;
  caption: string;
  results: { username: string; success: boolean; error?: string }[];
};

const HISTORY_KEY = "bulk_post_history";

function formatBytes(b: number) {
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function VideoThumb({ src, coverUrl, style }: { src: string; coverUrl?: string | null; style?: React.CSSProperties }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const thumbStyle = style ?? { width: "100%", height: "100%", objectFit: "cover" as const };

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
    <div ref={wrapRef} style={{ width: "100%", height: "100%", position: "relative" }}>
      {active
        ? <video
            src={src}
            poster={coverUrl || undefined}
            style={thumbStyle}
            preload="metadata"
            muted
            playsInline
            onLoadedMetadata={(e) => {
              const v = e.target as HTMLVideoElement;
              if (v.duration > 0.5) v.currentTime = 0.5;
            }}
          />
        : coverUrl
        ? <img src={coverUrl} alt="" style={thumbStyle} />
        : <div style={{ width: "100%", height: "100%", background: "rgba(255,255,255,0.04)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Film size={14} color="rgba(255,255,255,0.15)" />
          </div>}
    </div>
  );
}

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

export default function BulkPostPage() {
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [videos, setVideos] = useState<VideoRow[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [selectedVideo, setSelectedVideo] = useState<string>("");
  const [previewVideo, setPreviewVideo] = useState<{ src: string; name: string } | null>(null);
  const [caption, setCaption] = useState("");
  const [intervalSeconds, setIntervalSeconds] = useState(120);
  const [posting, setPosting] = useState(false);
  const [statuses, setStatuses] = useState<StatusRow[]>([]);
  const [loadErr, setLoadErr] = useState("");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const resultsRef = useRef<StatusRow[]>([]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]") as HistoryEntry[];
      setHistory(saved);
    } catch { /* ignore */ }
  }, []);

  const load = useCallback(async () => {
    try {
      const [accRes, vidRes] = await Promise.all([
        fetch("/api/private-ig/accounts"),
        fetch("/api/media/upload"),
      ]);
      const [accData, vidData] = await Promise.all([accRes.json(), vidRes.json()]);
      const list = ((accData.accounts ?? []) as AccountRow[]).filter(
        (a) => !a.tokenExpired && a.accountStatus !== "SUSPENDED" && a.accountStatus !== "QUARANTINE"
      );
      setAccounts(list);
      const sel: Record<string, boolean> = {};
      list.forEach((a) => { sel[a.id] = true; });
      setSelected(sel);
      setVideos(vidData.videos ?? []);
    } catch (e: unknown) {
      setLoadErr(e instanceof Error ? e.message : "Erro ao carregar dados");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const toggle = (id: string) => setSelected((s) => ({ ...s, [id]: !s[id] }));

  const handlePost = async () => {
    setLoadErr("");
    if (!selectedVideo) { setLoadErr("Selecione um vídeo da biblioteca."); return; }
    const ids = Object.entries(selected).filter(([, v]) => v).map(([k]) => k);
    if (ids.length === 0) { setLoadErr("Marque ao menos uma conta."); return; }

    const initialStatuses = ids.map((id) => ({
      accountId: id,
      username: accounts.find((a) => a.id === id)?.username ?? id,
      pending: true,
    }));
    resultsRef.current = initialStatuses;
    setPosting(true);
    setStatuses(initialStatuses);

    const fd = new FormData();
    fd.append("videoId", selectedVideo);
    fd.append("caption", caption);
    fd.append("accountIds", JSON.stringify(ids));
    fd.append("intervalSeconds", String(intervalSeconds));

    try {
      const res = await fetch("/api/private-ig/bulk-post", { method: "POST", body: fd });

      if (!res.ok || !res.body) {
        const t = await res.text();
        setLoadErr(t || "Falha na postagem");
        setStatuses((prev) => prev.map((s) => ({ ...s, pending: false, success: false, error: t })));
        return;
      }

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const evt = JSON.parse(line) as { accountId: string; username?: string; success: boolean; error?: string };
            // Update ref directly (outside setState) so finally block reads correct final state
            resultsRef.current = resultsRef.current.map((row) =>
              row.accountId === evt.accountId
                ? { ...row, username: evt.username || row.username, pending: false, success: evt.success, error: evt.error }
                : row,
            );
            setStatuses([...resultsRef.current]);
          } catch { /* ignore */ }
        }
      }
    } catch (e: unknown) {
      setLoadErr(e instanceof Error ? e.message : "Erro de rede");
    } finally {
      setPosting(false);
      // Save to history
      const videoName = videos.find((v) => v.id === selectedVideo)?.originalName ?? selectedVideo;
      const entry: HistoryEntry = {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        videoName,
        caption,
        results: resultsRef.current.map((s) => ({ username: s.username, success: !!s.success, error: s.error })),
      };
      try {
        const existing = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]") as HistoryEntry[];
        const updated = [entry, ...existing].slice(0, 20);
        localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
        setHistory(updated);
      } catch { /* ignore */ }
    }
  };

  const clearHistory = () => {
    localStorage.removeItem(HISTORY_KEY);
    setHistory([]);
  };

  const videoObj = videos.find((v) => v.id === selectedVideo);

  return (
    <div>
      {previewVideo && <VideoPreviewModal src={previewVideo.src} name={previewVideo.name} onClose={() => setPreviewVideo(null)} />}
      <div style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.025em", color: "#ededed", margin: 0 }}>
          Postagem em Massa
        </h1>
        <p style={{ fontSize: 12, color: "#444", marginTop: 3 }}>
          Escolha um vídeo da biblioteca e poste em várias contas ao mesmo tempo
        </p>
      </div>

      {loadErr && (
        <div style={{
          display: "flex", alignItems: "center", gap: "0.6rem",
          padding: "0.85rem 1rem", borderRadius: "10px",
          background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
          marginBottom: "1rem",
        }}>
          <AlertCircle size={16} color="#f87171" />
          <p style={{ fontSize: "0.875rem", color: "#f87171" }}>{loadErr}</p>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "1.5rem", alignItems: "start" }}>
        {/* Left: Video + Caption */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>

          {/* Video selector */}
          <div className="glass-panel" style={{ padding: "1.5rem", borderRadius: "14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h3 style={{ fontSize: "0.95rem", fontWeight: 700 }}>Vídeo da Biblioteca</h3>
              <Link href="/library" style={{
                fontSize: "0.78rem", color: "var(--accent-gold)", fontWeight: 600,
                display: "flex", alignItems: "center", gap: "0.3rem",
              }}>
                <UploadCloud size={13} /> Adicionar vídeo
              </Link>
            </div>

            {videos.length === 0 ? (
              <div style={{
                textAlign: "center", padding: "2rem",
                background: "rgba(255,255,255,0.02)", borderRadius: "10px",
                border: "1px dashed rgba(201,162,39,0.2)",
              }}>
                <Film size={32} color="var(--text-muted)" style={{ margin: "0 auto 0.75rem" }} />
                <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginBottom: "0.75rem" }}>
                  Nenhum vídeo na biblioteca
                </p>
                <Link href="/library" style={{
                  padding: "0.5rem 1rem", borderRadius: "8px", fontSize: "0.8rem",
                  background: "rgba(201,162,39,0.1)", border: "1px solid rgba(201,162,39,0.2)",
                  color: "var(--accent-gold)", fontWeight: 600,
                }}>
                  Ir para Biblioteca
                </Link>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxHeight: "340px", overflowY: "auto" }}>
                {videos.map((v) => (
                  <label key={v.id} style={{
                    display: "flex", alignItems: "center", gap: "0.75rem",
                    padding: "0.6rem 0.75rem", borderRadius: "10px", cursor: "pointer",
                    background: selectedVideo === v.id ? "rgba(201,162,39,0.1)" : "rgba(255,255,255,0.03)",
                    border: `1px solid ${selectedVideo === v.id ? "rgba(201,162,39,0.3)" : "rgba(255,255,255,0.06)"}`,
                    transition: "all 0.15s",
                  }}>
                    <input
                      type="radio"
                      name="video"
                      value={v.id}
                      checked={selectedVideo === v.id}
                      onChange={() => setSelectedVideo(v.id)}
                      style={{ accentColor: "var(--accent-gold)", flexShrink: 0 }}
                    />
                    <div style={{ width: "44px", height: "44px", borderRadius: "6px", background: "#0a0c14", overflow: "hidden", flexShrink: 0 }}>
                      <VideoThumb src={v.publicUrl} coverUrl={v.coverUrl} />
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p style={{ fontSize: "0.85rem", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {v.originalName}
                      </p>
                      <p style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{formatBytes(v.sizeBytes)}</p>
                    </div>
                    <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setPreviewVideo({ src: v.publicUrl, name: v.originalName }); }} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "4px", flexShrink: 0, display: "flex", alignItems: "center" }} title="Pré-visualizar"><Eye size={15} /></button>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Caption + Interval */}
          <div className="glass-panel" style={{ padding: "1.5rem", borderRadius: "14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
              <label style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Legenda
              </label>
              <span style={{ fontSize: "0.72rem", color: caption.length > 2000 ? "#f87171" : "var(--text-muted)" }}>
                {caption.length}/2200
              </span>
            </div>
            <textarea
              className="input-field"
              rows={4}
              value={caption}
              onChange={(e) => setCaption(e.target.value.slice(0, 2200))}
              placeholder="Texto da publicação…"
              disabled={posting}
              style={{ resize: "vertical", width: "100%" }}
            />

            <div style={{ marginTop: "1rem" }}>
              <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.4rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Intervalo entre contas (segundos)
              </label>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <input
                  type="range"
                  min={30} max={300} step={10}
                  value={intervalSeconds}
                  onChange={(e) => setIntervalSeconds(Number(e.target.value))}
                  disabled={posting}
                  style={{ flex: 1, accentColor: "var(--accent-gold)" }}
                />
                <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--accent-gold)", minWidth: "40px", textAlign: "right" }}>
                  {intervalSeconds}s
                </span>
              </div>
              <p style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "0.3rem" }}>
                {intervalSeconds}s entre cada vídeo na mesma conta · recomendado ≥ 120s
              </p>
            </div>
          </div>
        </div>

        {/* Right: Accounts + Post */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <div className="glass-panel" style={{ padding: "1.5rem", borderRadius: "14px" }}>
            <h3 style={{ fontSize: "0.95rem", fontWeight: 700, marginBottom: "1rem" }}>Contas</h3>

            {accounts.length === 0 ? (
              <div style={{ textAlign: "center", padding: "1.5rem" }}>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginBottom: "0.75rem" }}>Nenhuma conta conectada</p>
                <Link href="/accounts" style={{ padding: "0.5rem 1rem", borderRadius: "8px", fontSize: "0.8rem", background: "rgba(201,162,39,0.1)", border: "1px solid rgba(201,162,39,0.2)", color: "var(--accent-gold)", fontWeight: 600 }}>
                  Conectar conta
                </Link>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "1.25rem" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "0.6rem", padding: "0.5rem 0.75rem", borderRadius: "8px", background: "rgba(201,162,39,0.05)", cursor: "pointer", fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: 600 }}>
                  <input
                    type="checkbox"
                    checked={accounts.every((a) => selected[a.id])}
                    onChange={(e) => {
                      const val = e.target.checked;
                      const s: Record<string, boolean> = {};
                      accounts.forEach((a) => { s[a.id] = val; });
                      setSelected(s);
                    }}
                    style={{ accentColor: "var(--accent-gold)" }}
                  />
                  Selecionar todas
                </label>
                {accounts.map((a) => (
                  <label key={a.id} style={{ display: "flex", alignItems: "center", gap: "0.6rem", padding: "0.65rem 0.75rem", borderRadius: "8px", cursor: "pointer", background: selected[a.id] ? "rgba(201,162,39,0.07)" : "rgba(255,255,255,0.02)", border: `1px solid ${selected[a.id] ? "rgba(201,162,39,0.2)" : "transparent"}`, transition: "all 0.15s" }}>
                    <input
                      type="checkbox"
                      checked={Boolean(selected[a.id])}
                      onChange={() => toggle(a.id)}
                      disabled={posting}
                      style={{ accentColor: "var(--accent-gold)" }}
                    />
                    <span style={{ fontSize: "0.875rem", fontWeight: 500 }}>@{a.username}</span>
                    {a.source === "oauth" && (
                      <span style={{ marginLeft: "auto", fontSize: "0.68rem", color: "var(--text-muted)", background: "rgba(255,255,255,0.05)", padding: "2px 6px", borderRadius: "4px" }}>oficial</span>
                    )}
                  </label>
                ))}
              </div>
            )}

            {/* Video preview before posting */}
            {videoObj && (
              <div style={{ padding: "0.75rem", borderRadius: "10px", background: "rgba(201,162,39,0.06)", border: "1px solid rgba(201,162,39,0.15)", marginBottom: "1rem", display: "flex", gap: "0.75rem", alignItems: "center" }}>
                <div style={{ width: "44px", height: "44px", borderRadius: "6px", overflow: "hidden", flexShrink: 0, background: "#0a0c14" }}>
                  <VideoThumb src={videoObj.publicUrl} coverUrl={videoObj.coverUrl} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: "0.8rem", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{videoObj.originalName}</p>
                  {(() => {
                    const n = Object.values(selected).filter(Boolean).length;
                    const effectiveInterval = n <= 1 ? 0 : Math.max(10, intervalSeconds);
                    const estimatedSecs = n * 25 + (n - 1) * effectiveInterval;
                    const mins = Math.floor(estimatedSecs / 60);
                    const secs = estimatedSecs % 60;
                    return <p style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>{n} conta(s) · ~{mins > 0 ? `${mins}min ` : ""}{secs > 0 ? `${secs}s` : ""}</p>;
                  })()}
                </div>
              </div>
            )}

            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void handlePost()}
              disabled={posting || accounts.length === 0 || !selectedVideo}
              style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}
            >
              {posting
                ? <><Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> Publicando…</>
                : <><Send size={16} /> Postar em todas as selecionadas</>}
            </button>
          </div>

          {/* Results */}
          {statuses.length > 0 && (
            <div className="glass-panel" style={{ padding: "1.25rem", borderRadius: "14px" }}>
              <h3 style={{ fontSize: "0.95rem", fontWeight: 700, marginBottom: "0.75rem" }}>Resultado</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {statuses.map((s) => (
                  <div key={s.accountId} style={{ display: "flex", alignItems: "flex-start", gap: "0.6rem", padding: "0.6rem 0.75rem", borderRadius: "8px", fontSize: "0.875rem", background: s.pending ? "rgba(255,255,255,0.03)" : s.success ? "rgba(34,197,94,0.07)" : "rgba(239,68,68,0.07)" }}>
                    {s.pending
                      ? <Loader2 size={16} style={{ flexShrink: 0, animation: "spin 1s linear infinite", marginTop: "2px" }} />
                      : s.success
                      ? <CheckCircle2 size={16} color="#22c55e" style={{ flexShrink: 0, marginTop: "2px" }} />
                      : <XCircle size={16} color="#ef4444" style={{ flexShrink: 0, marginTop: "2px" }} />}
                    <span>
                      <strong>@{s.username}</strong>
                      {s.pending && " — publicando…"}
                      {!s.pending && s.success && " — publicado!"}
                      {!s.pending && !s.success && s.error && ` — ${s.error}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* History — always visible */}
      <div style={{ marginTop: "2.5rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <h2 style={{ fontSize: "1rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Clock size={16} color="var(--accent-gold)" />
            Histórico de Postagens
          </h2>
          {history.length > 0 && (
            <button
              onClick={clearHistory}
              style={{ display: "flex", alignItems: "center", gap: "0.35rem", padding: "0.35rem 0.75rem", borderRadius: "7px", border: "1px solid rgba(239,68,68,0.2)", background: "rgba(239,68,68,0.07)", color: "#f87171", fontSize: "0.75rem", cursor: "pointer", fontWeight: 600 }}>
              <Trash2 size={12} /> Limpar histórico
            </button>
          )}
        </div>

        {history.length === 0 ? (
          <div className="glass-panel" style={{ padding: "2rem", borderRadius: "14px", textAlign: "center" }}>
            <Clock size={28} color="rgba(255,255,255,0.1)" style={{ margin: "0 auto 0.75rem" }} />
            <p style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>Nenhuma postagem em massa realizada ainda.</p>
            <p style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.2)", marginTop: "0.3rem" }}>O histórico aparece aqui após cada envio.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {history.map((entry) => {
              const ok = entry.results.filter((r) => r.success).length;
              const fail = entry.results.filter((r) => !r.success).length;
              return (
                <div key={entry.id} className="glass-panel" style={{ padding: "1rem 1.25rem", borderRadius: "12px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", marginBottom: "0.6rem" }}>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: "0.88rem", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: "0.15rem" }}>
                        {entry.videoName}
                      </p>
                      {entry.caption && (
                        <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {entry.caption.slice(0, 80)}{entry.caption.length > 80 ? "…" : ""}
                        </p>
                      )}
                    </div>
                    <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.2rem" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.72rem", color: "var(--text-muted)" }}>
                        <Clock size={11} /> {fmtDate(entry.timestamp)}
                      </span>
                      <div style={{ display: "flex", gap: "0.4rem" }}>
                        {ok > 0 && <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "#4ade80", background: "rgba(74,222,128,0.1)", padding: "2px 7px", borderRadius: "5px" }}>✓ {ok}</span>}
                        {fail > 0 && <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "#f87171", background: "rgba(239,68,68,0.1)", padding: "2px 7px", borderRadius: "5px" }}>✗ {fail}</span>}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", marginTop: "0.25rem" }}>
                    {entry.results.map((r) => (
                      <div key={r.username} style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", padding: "0.45rem 0.65rem", borderRadius: "8px", fontSize: "0.82rem", background: r.success ? "rgba(34,197,94,0.07)" : "rgba(239,68,68,0.07)" }}>
                        {r.success
                          ? <CheckCircle2 size={14} color="#22c55e" style={{ flexShrink: 0, marginTop: "1px" }} />
                          : <XCircle size={14} color="#ef4444" style={{ flexShrink: 0, marginTop: "1px" }} />}
                        <span style={{ color: r.success ? "#4ade80" : "#f87171" }}>
                          <strong>@{r.username}</strong>
                          {r.success ? " — Publicado" : r.error ? ` — ${r.error}` : " — Falha"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
