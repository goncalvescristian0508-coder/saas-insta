"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Camera, Loader2, Download, Trash2, CheckCircle, XCircle,
  Play, Image as ImageIcon, Search, RefreshCw,
} from "lucide-react";

interface StoryItem {
  id: string;
  originalName: string;
  publicUrl: string;
  sizeBytes: number;
  mimeType: string;
  storagePath: string;
  createdAt: string;
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function usernameFromPath(storagePath: string) {
  return storagePath.split("/")[2] ?? "desconhecido";
}

function Toast({ type, msg }: { type: "success" | "error"; msg: string }) {
  return (
    <div style={{
      position: "fixed", top: "1.5rem", right: "1.5rem", zIndex: 100,
      display: "flex", alignItems: "center", gap: ".6rem",
      padding: ".85rem 1.2rem", borderRadius: "12px",
      background: type === "success" ? "rgba(34,197,94,.12)" : "rgba(239,68,68,.12)",
      border: `1px solid ${type === "success" ? "rgba(34,197,94,.3)" : "rgba(239,68,68,.3)"}`,
      backdropFilter: "blur(12px)", boxShadow: "0 8px 32px rgba(0,0,0,.4)",
      animation: "slideIn .3s ease",
    }}>
      {type === "success" ? <CheckCircle size={16} color="#4ade80" /> : <XCircle size={16} color="#f87171" />}
      <span style={{ fontSize: ".875rem", color: type === "success" ? "#4ade80" : "#f87171" }}>{msg}</span>
    </div>
  );
}

function StoryCard({ item, onDelete, onDownload, isDeleting }: {
  item: StoryItem;
  onDelete: () => void;
  onDownload: () => void;
  isDeleting: boolean;
}) {
  const isVideo = item.mimeType === "video/mp4";
  return (
    <div
      className="glass-panel"
      style={{ overflow: "hidden", borderRadius: "12px", transition: "transform .2s" }}
      onMouseEnter={e => (e.currentTarget.style.transform = "translateY(-3px)")}
      onMouseLeave={e => (e.currentTarget.style.transform = "translateY(0)")}
    >
      {/* Portrait thumbnail (9:16) */}
      <div style={{ aspectRatio: "9/16", background: "#07090f", position: "relative", overflow: "hidden" }}>
        {isVideo ? (
          <video
            src={item.publicUrl}
            style={{ width: "100%", height: "100%", objectFit: "cover", opacity: .85 }}
            preload="metadata"
            muted
          />
        ) : (
          <img
            src={item.publicUrl}
            alt={item.originalName}
            style={{ width: "100%", height: "100%", objectFit: "cover", opacity: .85 }}
            loading="lazy"
          />
        )}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,.65) 0%, transparent 55%)" }} />

        {/* Type badge */}
        <div style={{ position: "absolute", top: ".5rem", left: ".5rem", display: "flex", alignItems: "center", gap: "3px", padding: "2px 7px", borderRadius: "20px", background: "rgba(0,0,0,.55)", backdropFilter: "blur(8px)" }}>
          {isVideo
            ? <Play size={8} color="#fff" fill="#fff" />
            : <ImageIcon size={8} color="#fff" />}
          <span style={{ fontSize: ".6rem", color: "#fff", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em" }}>
            {isVideo ? "vídeo" : "foto"}
          </span>
        </div>

        {/* Size */}
        <p style={{ position: "absolute", bottom: ".45rem", right: ".5rem", fontSize: ".62rem", color: "rgba(255,255,255,.65)", background: "rgba(0,0,0,.4)", padding: "1px 5px", borderRadius: "4px" }}>
          {formatBytes(item.sizeBytes)}
        </p>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: ".35rem", padding: ".55rem" }}>
        <button
          onClick={onDownload}
          style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 4, padding: "7px", borderRadius: "7px", background: "rgba(255,213,79,.1)", border: "1px solid rgba(255,213,79,.2)", color: "#FFD54F", fontSize: ".72rem", cursor: "pointer", fontWeight: 600, fontFamily: "var(--font-sans)" }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,213,79,.18)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,213,79,.1)"; }}
        >
          <Download size={11} /> Baixar
        </button>
        <button
          onClick={onDelete}
          disabled={isDeleting}
          style={{ width: 33, display: "flex", alignItems: "center", justifyContent: "center", padding: "7px", borderRadius: "7px", background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.15)", color: "#f87171", cursor: isDeleting ? "not-allowed" : "pointer", flexShrink: 0 }}
          onMouseEnter={e => { if (!isDeleting) e.currentTarget.style.background = "rgba(239,68,68,.16)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "rgba(239,68,68,.08)"; }}
        >
          {isDeleting
            ? <Loader2 size={11} style={{ animation: "spin 1s linear infinite" }} />
            : <Trash2 size={11} />}
        </button>
      </div>
    </div>
  );
}

export default function StoriesPage() {
  const [stories, setStories] = useState<StoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState("");
  const [fetching, setFetching] = useState(false);
  const [fetchResult, setFetchResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  function showToast(type: "success" | "error", msg: string) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  }

  const loadStories = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/stories");
    const d = await res.json();
    setStories(d.stories ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { loadStories(); }, [loadStories]);

  async function handleFetch() {
    const clean = username.replace(/^@/, "").trim();
    if (!clean || fetching) return;
    setFetching(true);
    setFetchResult(null);
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 80_000);
      let res: Response;
      try {
        res = await fetch("/api/stories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: clean }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
      const d = await res.json();
      if (res.ok) {
        setFetchResult({ ok: true, text: `${d.saved} stor${d.saved !== 1 ? "ies" : "y"} de @${clean} salvo${d.saved !== 1 ? "s" : ""}!` });
        await loadStories();
      } else {
        setFetchResult({ ok: false, text: d.error ?? "Erro ao buscar stories" });
      }
    } catch (err) {
      const isAbort = err instanceof DOMException && err.name === "AbortError";
      setFetchResult({ ok: false, text: isAbort ? "Tempo limite atingido. Tente novamente." : "Erro de conexão" });
    } finally {
      setFetching(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    const res = await fetch(`/api/media/${id}`, { method: "DELETE" });
    if (res.ok) {
      setStories(s => s.filter(x => x.id !== id));
      showToast("success", "Story removido");
    } else {
      showToast("error", "Erro ao remover");
    }
    setDeletingId(null);
  }

  function handleDownload(item: StoryItem) {
    const a = document.createElement("a");
    a.href = `/api/media/proxy?url=${encodeURIComponent(item.publicUrl)}&download=1&filename=${encodeURIComponent(item.originalName)}`;
    a.download = item.originalName;
    a.click();
  }

  // Group by username
  const grouped: Record<string, StoryItem[]> = {};
  for (const s of stories) {
    const u = usernameFromPath(s.storagePath);
    if (!grouped[u]) grouped[u] = [];
    grouped[u].push(s);
  }

  const totalVideos = stories.filter(s => s.mimeType === "video/mp4").length;
  const totalImages = stories.length - totalVideos;

  return (
    <div style={{ position: "relative" }}>
      {toast && <Toast type={toast.type} msg={toast.msg} />}

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "2rem" }}>
        <div>
          <h1 className="page-title">Biblioteca de Stories</h1>
          <p className="page-subtitle">Salve e organize stories do Instagram por perfil</p>
        </div>
        <div style={{ display: "flex", gap: ".5rem", alignItems: "center" }}>
          {stories.length > 0 && (
            <div style={{ padding: ".5rem 1rem", background: "rgba(201,162,39,.08)", border: "1px solid rgba(201,162,39,.15)", borderRadius: "8px", display: "flex", alignItems: "center", gap: ".5rem" }}>
              <Camera size={13} color="var(--accent-gold)" />
              <span style={{ fontSize: ".78rem", color: "var(--text-secondary)" }}>
                {stories.length} salvo{stories.length !== 1 ? "s" : ""} · {totalVideos} vídeo{totalVideos !== 1 ? "s" : ""} · {totalImages} foto{totalImages !== 1 ? "s" : ""}
              </span>
            </div>
          )}
          <button onClick={loadStories} style={{ padding: ".5rem", borderRadius: "8px", background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", color: "#666", cursor: "pointer", display: "flex" }}>
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Fetch panel */}
      <div className="glass-panel" style={{ padding: "1.5rem", marginBottom: "2rem" }}>
        <p style={{ fontSize: ".8rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: "1rem" }}>
          Buscar Stories de um Perfil
        </p>
        <div style={{ display: "flex", gap: ".75rem" }}>
          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: ".5rem", padding: "0 14px", borderRadius: "10px", background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.1)" }}>
            <span style={{ color: "#555", fontWeight: 600 }}>@</span>
            <input
              value={username}
              onChange={e => setUsername(e.target.value.replace(/^@/, ""))}
              onKeyDown={e => e.key === "Enter" && handleFetch()}
              placeholder="usuario"
              style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: ".9rem", color: "#f0f0f0", fontFamily: "var(--font-sans)", padding: "12px 0" }}
            />
          </div>
          <button
            onClick={handleFetch}
            disabled={fetching || !username.trim()}
            className="btn btn-primary"
            style={{ display: "flex", alignItems: "center", gap: ".5rem", whiteSpace: "nowrap", opacity: !username.trim() ? .5 : 1 }}
          >
            {fetching
              ? <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} />
              : <Search size={15} />}
            {fetching ? "Buscando (pode levar ~30s)..." : "Buscar Stories"}
          </button>
        </div>

        {fetchResult && (
          <div style={{ marginTop: ".875rem", padding: ".75rem 1rem", borderRadius: "9px", background: fetchResult.ok ? "rgba(34,197,94,.08)" : "rgba(239,68,68,.08)", border: `1px solid ${fetchResult.ok ? "rgba(34,197,94,.2)" : "rgba(239,68,68,.2)"}`, display: "flex", alignItems: "center", gap: ".5rem" }}>
            {fetchResult.ok
              ? <CheckCircle size={14} color="#4ade80" />
              : <XCircle size={14} color="#f87171" />}
            <span style={{ fontSize: ".875rem", color: fetchResult.ok ? "#4ade80" : "#f87171" }}>{fetchResult.text}</span>
          </div>
        )}

        <p style={{ marginTop: ".875rem", fontSize: ".75rem", color: "#444" }}>
          Stories são salvos permanentemente na sua biblioteca. Perfis privados requerem acesso à conta.
        </p>
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "3rem" }}>
          <Loader2 size={28} color="var(--accent-gold)" style={{ animation: "spin 1s linear infinite" }} />
        </div>
      ) : stories.length === 0 ? (
        <div style={{ textAlign: "center", padding: "4rem 2rem", background: "rgba(12,16,24,.5)", borderRadius: "14px", border: "1px solid var(--border-color)" }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(255,213,79,.08)", border: "1px solid rgba(255,213,79,.15)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1.25rem" }}>
            <Camera size={28} color="rgba(255,213,79,.4)" />
          </div>
          <p style={{ color: "var(--text-secondary)", fontSize: ".95rem", fontWeight: 600, marginBottom: ".5rem" }}>Nenhum story salvo ainda</p>
          <p style={{ color: "var(--text-muted)", fontSize: ".8rem" }}>Digite um @usuario acima para buscar e salvar os stories ativos</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "2.5rem" }}>
          {Object.entries(grouped).map(([uname, items]) => (
            <div key={uname}>
              {/* Username header */}
              <div style={{ display: "flex", alignItems: "center", gap: ".75rem", marginBottom: "1.1rem" }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg,rgba(255,213,79,.25),rgba(255,213,79,.08))", border: "2px solid rgba(255,213,79,.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Camera size={14} color="#FFD54F" />
                </div>
                <div>
                  <p style={{ fontSize: "1rem", fontWeight: 700, color: "#f0f0f0" }}>@{uname}</p>
                  <p style={{ fontSize: ".72rem", color: "var(--text-muted)" }}>
                    {items.length} story{items.length !== 1 ? "s" : ""} · {items.filter(i => i.mimeType === "video/mp4").length} vídeo{items.filter(i => i.mimeType === "video/mp4").length !== 1 ? "s" : ""} · {items.filter(i => i.mimeType !== "video/mp4").length} foto{items.filter(i => i.mimeType !== "video/mp4").length !== 1 ? "s" : ""}
                  </p>
                </div>
                <div style={{ marginLeft: "auto", height: "1px", flex: 1, background: "rgba(255,255,255,.05)" }} />
              </div>

              {/* Portrait grid */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: ".875rem" }}>
                {items.map(item => (
                  <StoryCard
                    key={item.id}
                    item={item}
                    onDelete={() => handleDelete(item.id)}
                    onDownload={() => handleDownload(item)}
                    isDeleting={deletingId === item.id}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes slideIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
      `}</style>
    </div>
  );
}
