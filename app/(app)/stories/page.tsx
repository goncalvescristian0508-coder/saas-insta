"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Camera, Loader2, Download, Trash2, CheckCircle, XCircle,
  Play, Image as ImageIcon, Search, RefreshCw, Send, Users,
  Shuffle, Check, Square, CheckSquare, ChevronDown, ChevronUp,
  UploadCloud,
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

interface Account {
  id: string;
  username: string;
  profilePictureUrl: string | null;
}

interface PublishResult {
  accountId: string;
  username: string;
  status: "ok" | "error";
  error?: string;
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

function StoryCard({ item, onDelete, onDownload, isDeleting, selectable, selected, onSelect }: {
  item: StoryItem;
  onDelete: () => void;
  onDownload: () => void;
  isDeleting: boolean;
  selectable: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const isVideo = item.mimeType === "video/mp4";
  return (
    <div
      className="glass-panel"
      onClick={selectable ? onSelect : undefined}
      style={{
        overflow: "hidden", borderRadius: "12px", transition: "transform .2s, box-shadow .2s",
        cursor: selectable ? "pointer" : "default",
        boxShadow: selected ? "0 0 0 2px #FFD54F" : "none",
        outline: selected ? "2px solid #FFD54F" : "none",
      }}
      onMouseEnter={e => { if (!selectable) e.currentTarget.style.transform = "translateY(-3px)"; }}
      onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; }}
    >
      {/* Portrait thumbnail (9:16) */}
      <div style={{ aspectRatio: "9/16", background: "#07090f", position: "relative", overflow: "hidden" }}>
        {isVideo ? (
          <video src={item.publicUrl} style={{ width: "100%", height: "100%", objectFit: "cover", opacity: .85 }} preload="metadata" muted />
        ) : (
          <img src={item.publicUrl} alt={item.originalName} style={{ width: "100%", height: "100%", objectFit: "cover", opacity: .85 }} loading="lazy" />
        )}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,.65) 0%, transparent 55%)" }} />

        {/* Type badge */}
        <div style={{ position: "absolute", top: ".5rem", left: ".5rem", display: "flex", alignItems: "center", gap: "3px", padding: "2px 7px", borderRadius: "20px", background: "rgba(0,0,0,.55)", backdropFilter: "blur(8px)" }}>
          {isVideo ? <Play size={8} color="#fff" fill="#fff" /> : <ImageIcon size={8} color="#fff" />}
          <span style={{ fontSize: ".6rem", color: "#fff", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em" }}>
            {isVideo ? "vídeo" : "foto"}
          </span>
        </div>

        {/* Selection overlay */}
        {selectable && (
          <div style={{
            position: "absolute", top: ".5rem", right: ".5rem",
            width: 22, height: 22, borderRadius: "50%",
            background: selected ? "#FFD54F" : "rgba(0,0,0,.5)",
            border: selected ? "2px solid #FFD54F" : "2px solid rgba(255,255,255,.4)",
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "all .15s",
          }}>
            {selected && <Check size={12} color="#000" strokeWidth={3} />}
          </div>
        )}

        {/* Size */}
        <p style={{ position: "absolute", bottom: ".45rem", right: ".5rem", fontSize: ".62rem", color: "rgba(255,255,255,.65)", background: "rgba(0,0,0,.4)", padding: "1px 5px", borderRadius: "4px" }}>
          {formatBytes(item.sizeBytes)}
        </p>
      </div>

      {/* Actions — hidden in select mode */}
      {!selectable && (
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
            {isDeleting ? <Loader2 size={11} style={{ animation: "spin 1s linear infinite" }} /> : <Trash2 size={11} />}
          </button>
        </div>
      )}
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

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>("");
  const [dragging, setDragging] = useState(false);

  // Publish state
  const [selectable, setSelectable] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<string>>(new Set());
  const [distribute, setDistribute] = useState(true);
  const [accountLinks, setAccountLinks] = useState<Record<string, string>>({});
  const [publishing, setPublishing] = useState(false);
  const [publishResults, setPublishResults] = useState<PublishResult[] | null>(null);
  const [showAccounts, setShowAccounts] = useState(false);

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

  const loadAccounts = useCallback(async () => {
    const res = await fetch("/api/stories/publish");
    const d = await res.json();
    setAccounts(d.accounts ?? []);
  }, []);

  useEffect(() => { loadStories(); }, [loadStories]);
  useEffect(() => { loadAccounts(); }, [loadAccounts]);

  async function uploadFiles(files: FileList | File[]) {
    const allowed = ["image/jpeg", "image/png", "image/webp", "video/mp4", "video/quicktime", "video/webm"];
    const valid = Array.from(files).filter(f => allowed.includes(f.type));
    if (valid.length === 0) { showToast("error", "Apenas imagens (JPG/PNG) e vídeos (MP4) são suportados"); return; }
    setUploading(true);
    let done = 0;
    for (const file of valid) {
      setUploadProgress(`Enviando ${done + 1}/${valid.length}: ${file.name}`);
      try {
        const signRes = await fetch(`/api/media/sign-upload?filename=${encodeURIComponent(file.name)}&type=stories`);
        const signData = await signRes.json() as { signedUrl?: string; storagePath?: string; publicUrl?: string; error?: string };
        if (!signRes.ok || !signData.signedUrl) throw new Error(signData.error ?? "Erro ao gerar URL de upload");

        const uploadRes = await fetch(signData.signedUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!uploadRes.ok) throw new Error("Erro ao enviar arquivo");

        await fetch("/api/media/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            storagePath: signData.storagePath,
            originalName: file.name,
            sizeBytes: file.size,
            mimeType: file.type,
            publicUrl: signData.publicUrl,
          }),
        });
        done++;
      } catch (err) {
        showToast("error", `Erro ao enviar ${file.name}: ${err instanceof Error ? err.message : "desconhecido"}`);
      }
    }
    setUploading(false);
    setUploadProgress("");
    if (done > 0) {
      showToast("success", `${done} arquivo(s) enviado(s) com sucesso`);
      await loadStories();
    }
  }

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

  function toggleSelectMode() {
    setSelectable(v => !v);
    setSelectedIds(new Set());
    setPublishResults(null);
    setAccountLinks({});
  }

  function setLink(accountId: string, url: string) {
    setAccountLinks(prev => ({ ...prev, [accountId]: url }));
  }

  function toggleStory(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAccount(id: string) {
    setSelectedAccountIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllAccounts() {
    if (selectedAccountIds.size === accounts.length) {
      setSelectedAccountIds(new Set());
    } else {
      setSelectedAccountIds(new Set(accounts.map(a => a.id)));
    }
  }

  async function handlePublish() {
    if (selectedIds.size === 0) { showToast("error", "Selecione ao menos 1 story"); return; }
    if (selectedAccountIds.size === 0) { showToast("error", "Selecione ao menos 1 conta"); return; }
    setPublishing(true);
    setPublishResults(null);
    try {
      const res = await fetch("/api/stories/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storyIds: Array.from(selectedIds),
          accountIds: Array.from(selectedAccountIds),
          distribute,
          links: accountLinks,
        }),
      });
      const d = await res.json();
      if (!res.ok) { showToast("error", d.error ?? "Erro ao publicar"); return; }
      setPublishResults(d.results ?? []);
      showToast("success", `${d.ok} publicado(s) · ${d.errors} erro(s)`);
    } catch {
      showToast("error", "Erro de conexão");
    } finally {
      setPublishing(false);
    }
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
  const allAccountsSelected = accounts.length > 0 && selectedAccountIds.size === accounts.length;

  return (
    <div style={{ position: "relative" }}>
      {toast && <Toast type={toast.type} msg={toast.msg} />}

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "2rem" }}>
        <div>
          <h1 className="page-title">Biblioteca de Stories</h1>
          <p className="page-subtitle">Salve, organize e publique stories do Instagram</p>
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
          {stories.length > 0 && (
            <button
              onClick={toggleSelectMode}
              style={{
                display: "flex", alignItems: "center", gap: ".4rem",
                padding: ".5rem .9rem", borderRadius: "8px", fontSize: ".8rem", fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-sans)",
                background: selectable ? "rgba(255,213,79,.15)" : "rgba(255,255,255,.05)",
                border: selectable ? "1px solid rgba(255,213,79,.35)" : "1px solid rgba(255,255,255,.1)",
                color: selectable ? "#FFD54F" : "var(--text-secondary)",
              }}
            >
              <Send size={13} /> {selectable ? "Cancelar" : "Publicar Stories"}
            </button>
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
            {fetching ? <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} /> : <Search size={15} />}
            {fetching ? "Buscando (pode levar ~30s)..." : "Buscar Stories"}
          </button>
        </div>

        {fetchResult && (
          <div style={{ marginTop: ".875rem", padding: ".75rem 1rem", borderRadius: "9px", background: fetchResult.ok ? "rgba(34,197,94,.08)" : "rgba(239,68,68,.08)", border: `1px solid ${fetchResult.ok ? "rgba(34,197,94,.2)" : "rgba(239,68,68,.2)"}`, display: "flex", alignItems: "center", gap: ".5rem" }}>
            {fetchResult.ok ? <CheckCircle size={14} color="#4ade80" /> : <XCircle size={14} color="#f87171" />}
            <span style={{ fontSize: ".875rem", color: fetchResult.ok ? "#4ade80" : "#f87171" }}>{fetchResult.text}</span>
          </div>
        )}

        <p style={{ marginTop: ".875rem", fontSize: ".75rem", color: "#444" }}>
          Stories são salvos permanentemente na sua biblioteca. Perfis privados requerem acesso à conta.
        </p>
      </div>

      {/* Upload panel */}
      <div
        className="glass-panel"
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); void uploadFiles(e.dataTransfer.files); }}
        style={{ padding: "1.5rem", marginBottom: "2rem", border: dragging ? "1.5px dashed rgba(255,213,79,.6)" : "1.5px dashed rgba(255,255,255,.08)", background: dragging ? "rgba(255,213,79,.04)" : undefined, transition: "all .2s" }}
      >
        <p style={{ fontSize: ".8rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: "1rem" }}>
          Enviar do Dispositivo
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <label style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: ".5rem", padding: "1.5rem", borderRadius: "10px", border: "1px dashed rgba(255,255,255,.12)", cursor: uploading ? "not-allowed" : "pointer", opacity: uploading ? .6 : 1 }}>
            <input
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
              style={{ display: "none" }}
              disabled={uploading}
              onChange={e => e.target.files && void uploadFiles(e.target.files)}
            />
            {uploading
              ? <Loader2 size={24} color="var(--accent-gold)" style={{ animation: "spin 1s linear infinite" }} />
              : <UploadCloud size={24} color="rgba(255,213,79,.5)" />}
            <span style={{ fontSize: ".82rem", color: uploading ? "var(--accent-gold)" : "var(--text-secondary)", textAlign: "center" }}>
              {uploading ? uploadProgress : "Clique ou arraste imagens/vídeos aqui"}
            </span>
            {!uploading && (
              <span style={{ fontSize: ".7rem", color: "var(--text-muted)" }}>JPG · PNG · MP4 · múltiplos arquivos</span>
            )}
          </label>
        </div>
      </div>

      {/* Publish panel — shown when selectable mode is on */}
      {selectable && (
        <div className="glass-panel" style={{ padding: "1.5rem", marginBottom: "2rem", border: "1px solid rgba(255,213,79,.2)" }}>
          <p style={{ fontSize: ".8rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: "1.25rem" }}>
            Publicar Stories
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
            {/* Story count */}
            <div style={{ padding: ".75rem 1rem", borderRadius: "10px", background: "rgba(255,213,79,.06)", border: "1px solid rgba(255,213,79,.15)" }}>
              <p style={{ fontSize: ".7rem", color: "var(--text-muted)", marginBottom: ".25rem", textTransform: "uppercase", letterSpacing: ".08em" }}>Stories selecionados</p>
              <p style={{ fontSize: "1.4rem", fontWeight: 800, color: "#FFD54F" }}>{selectedIds.size}</p>
              <p style={{ fontSize: ".7rem", color: "var(--text-muted)" }}>clique nos cards abaixo para selecionar</p>
            </div>

            {/* Distribute toggle */}
            <div style={{ padding: ".75rem 1rem", borderRadius: "10px", background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.07)" }}>
              <p style={{ fontSize: ".7rem", color: "var(--text-muted)", marginBottom: ".5rem", textTransform: "uppercase", letterSpacing: ".08em" }}>Modo</p>
              <div style={{ display: "flex", gap: ".5rem" }}>
                <button
                  onClick={() => setDistribute(true)}
                  style={{ flex: 1, padding: ".4rem .5rem", borderRadius: "7px", fontSize: ".75rem", fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-sans)", background: distribute ? "rgba(96,165,250,.15)" : "transparent", border: distribute ? "1px solid rgba(96,165,250,.35)" : "1px solid rgba(255,255,255,.08)", color: distribute ? "#60a5fa" : "var(--text-muted)", display: "flex", alignItems: "center", gap: ".3rem", justifyContent: "center" }}
                >
                  <Shuffle size={11} /> Distribuir
                </button>
                <button
                  onClick={() => setDistribute(false)}
                  style={{ flex: 1, padding: ".4rem .5rem", borderRadius: "7px", fontSize: ".75rem", fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-sans)", background: !distribute ? "rgba(96,165,250,.15)" : "transparent", border: !distribute ? "1px solid rgba(96,165,250,.35)" : "1px solid rgba(255,255,255,.08)", color: !distribute ? "#60a5fa" : "var(--text-muted)", display: "flex", alignItems: "center", gap: ".3rem", justifyContent: "center" }}
                >
                  <Users size={11} /> Todos iguais
                </button>
              </div>
              <p style={{ fontSize: ".65rem", color: "var(--text-muted)", marginTop: ".4rem" }}>
                {distribute ? "Cada conta recebe um story diferente (sem cruzar dados)" : "Todas as contas recebem o mesmo story"}
              </p>
            </div>
          </div>

          {/* Account selector */}
          <div style={{ marginBottom: "1rem" }}>
            <button
              onClick={() => setShowAccounts(v => !v)}
              style={{ display: "flex", alignItems: "center", gap: ".5rem", width: "100%", padding: ".75rem 1rem", borderRadius: "10px", background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)", color: "var(--text-secondary)", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: ".85rem", fontWeight: 600, textAlign: "left" }}
            >
              <Users size={14} />
              <span style={{ flex: 1 }}>
                {selectedAccountIds.size === 0
                  ? "Selecionar contas"
                  : `${selectedAccountIds.size} conta(s) selecionada(s)`}
              </span>
              {showAccounts ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {showAccounts && accounts.length > 0 && (
              <div style={{ marginTop: ".5rem", padding: ".75rem", borderRadius: "10px", background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.06)", maxHeight: "220px", overflowY: "auto" }}>
                {/* Select all */}
                <button
                  onClick={selectAllAccounts}
                  style={{ display: "flex", alignItems: "center", gap: ".5rem", width: "100%", padding: ".4rem .5rem", borderRadius: "7px", background: "transparent", border: "none", color: "var(--accent-gold)", fontSize: ".78rem", fontWeight: 700, cursor: "pointer", fontFamily: "var(--font-sans)", marginBottom: ".5rem" }}
                >
                  {allAccountsSelected ? <CheckSquare size={13} /> : <Square size={13} />}
                  {allAccountsSelected ? "Desmarcar todas" : `Selecionar todas (${accounts.length})`}
                </button>
                <div style={{ display: "flex", flexDirection: "column", gap: ".25rem" }}>
                  {accounts.map(acc => (
                    <button
                      key={acc.id}
                      onClick={() => toggleAccount(acc.id)}
                      style={{ display: "flex", alignItems: "center", gap: ".6rem", padding: ".4rem .5rem", borderRadius: "7px", background: selectedAccountIds.has(acc.id) ? "rgba(255,213,79,.08)" : "transparent", border: selectedAccountIds.has(acc.id) ? "1px solid rgba(255,213,79,.2)" : "1px solid transparent", cursor: "pointer", fontFamily: "var(--font-sans)", textAlign: "left" }}
                    >
                      <div style={{ width: 18, height: 18, borderRadius: "50%", background: selectedAccountIds.has(acc.id) ? "#FFD54F" : "rgba(255,255,255,.1)", border: selectedAccountIds.has(acc.id) ? "none" : "1px solid rgba(255,255,255,.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        {selectedAccountIds.has(acc.id) && <Check size={10} color="#000" strokeWidth={3} />}
                      </div>
                      <span style={{ fontSize: ".8rem", color: selectedAccountIds.has(acc.id) ? "#fff" : "var(--text-secondary)" }}>@{acc.username}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {showAccounts && accounts.length === 0 && (
              <p style={{ fontSize: ".8rem", color: "var(--text-muted)", marginTop: ".5rem", padding: ".5rem" }}>Nenhuma conta ativa encontrada.</p>
            )}
          </div>

          {/* Per-account links — shown when accounts are selected */}
          {selectedAccountIds.size > 0 && (
            <div style={{ marginBottom: "1rem" }}>
              <p style={{ fontSize: ".75rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: ".6rem" }}>
                Link por conta <span style={{ color: "#555", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(opcional)</span>
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: ".35rem", maxHeight: "260px", overflowY: "auto" }}>
                {accounts.filter(a => selectedAccountIds.has(a.id)).map(acc => (
                  <div key={acc.id} style={{ display: "flex", alignItems: "center", gap: ".5rem" }}>
                    <span style={{ fontSize: ".78rem", color: "var(--text-secondary)", minWidth: "120px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>@{acc.username}</span>
                    <input
                      value={accountLinks[acc.id] ?? ""}
                      onChange={e => setLink(acc.id, e.target.value)}
                      placeholder="https://..."
                      style={{ flex: 1, background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.1)", borderRadius: "7px", padding: ".35rem .6rem", fontSize: ".78rem", color: "#f0f0f0", outline: "none", fontFamily: "var(--font-sans)" }}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Publish button */}
          <button
            onClick={handlePublish}
            disabled={publishing || selectedIds.size === 0 || selectedAccountIds.size === 0}
            className="btn btn-primary"
            style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: ".5rem", opacity: (selectedIds.size === 0 || selectedAccountIds.size === 0) ? .5 : 1 }}
          >
            {publishing
              ? <><Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} /> Publicando em {selectedAccountIds.size} conta(s)...</>
              : <><Send size={15} /> Publicar {selectedIds.size} story(ies) em {selectedAccountIds.size} conta(s)</>}
          </button>

          {/* Results */}
          {publishResults && (
            <div style={{ marginTop: "1rem" }}>
              <p style={{ fontSize: ".75rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: ".5rem" }}>
                Resultados
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: ".35rem", maxHeight: "200px", overflowY: "auto" }}>
                {publishResults.map(r => (
                  <div key={r.accountId} style={{ display: "flex", alignItems: "center", gap: ".5rem", padding: ".4rem .6rem", borderRadius: "7px", background: r.status === "ok" ? "rgba(34,197,94,.06)" : "rgba(239,68,68,.06)", border: `1px solid ${r.status === "ok" ? "rgba(34,197,94,.15)" : "rgba(239,68,68,.15)"}` }}>
                    {r.status === "ok"
                      ? <CheckCircle size={12} color="#4ade80" />
                      : <XCircle size={12} color="#f87171" />}
                    <span style={{ fontSize: ".78rem", color: r.status === "ok" ? "#4ade80" : "#f87171", fontWeight: 600 }}>@{r.username}</span>
                    {r.error && <span style={{ fontSize: ".7rem", color: "var(--text-muted)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>— {r.error}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

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
          {selectable && (
            <p style={{ fontSize: ".8rem", color: "var(--text-muted)", marginBottom: "-.5rem" }}>
              Clique nos stories abaixo para selecioná-los para publicação
            </p>
          )}
          {Object.entries(grouped).map(([uname, items]) => (
            <div key={uname}>
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

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: ".875rem" }}>
                {items.map(item => (
                  <StoryCard
                    key={item.id}
                    item={item}
                    onDelete={() => handleDelete(item.id)}
                    onDownload={() => handleDownload(item)}
                    isDeleting={deletingId === item.id}
                    selectable={selectable}
                    selected={selectedIds.has(item.id)}
                    onSelect={() => toggleStory(item.id)}
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
