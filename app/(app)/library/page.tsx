"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  UploadCloud, FileVideo, Trash2, Clock, HardDrive,
  CheckCircle, XCircle, Loader2, Film, Copy, AlertTriangle, Wand2
} from "lucide-react";

interface Video {
  id: string;
  originalName: string;
  publicUrl: string;
  sizeBytes: number;
  durationSecs: number | null;
  mimeType: string;
  createdAt: string;
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

export default function LibraryPage() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadCurrent, setUploadCurrent] = useState(0);
  const [uploadTotal, setUploadTotal] = useState(0);
  const [uploadFileName, setUploadFileName] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [cleaning, setCleaning] = useState(false);
  const [confirmClean, setConfirmClean] = useState<"duplicates" | "all" | null>(null);
  const [cleaningMeta, setCleaningMeta] = useState(false);
  const [cleanMetaProgress, setCleanMetaProgress] = useState<{ done: number; total: number } | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const showToast = (type: "success" | "error", msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchVideos = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/media/upload");
    const data = await res.json();
    setVideos(data.videos ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchVideos(); }, [fetchVideos]);

  async function uploadFile(file: File): Promise<boolean> {
    const allowed = ["video/mp4", "video/quicktime", "video/mov", "video/x-msvideo"];
    if (!allowed.includes(file.type)) {
      showToast("error", `"${file.name}" — formato inválido. Use MP4 ou MOV.`);
      return false;
    }
    if (file.size > 200 * 1024 * 1024) {
      showToast("error", `"${file.name}" — muito grande. Máximo 200MB.`);
      return false;
    }

    setUploadProgress(0);
    setUploadFileName(file.name);

    try {
      const signRes = await fetch(`/api/media/sign-upload?filename=${encodeURIComponent(file.name)}`);
      if (!signRes.ok) {
        const d = await signRes.json();
        showToast("error", d.error ?? "Erro ao preparar upload");
        return false;
      }
      const { signedUrl, storagePath, publicUrl } = await signRes.json() as {
        signedUrl: string; storagePath: string; publicUrl: string;
      };

      setUploadProgress(5);

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            setUploadProgress(5 + Math.floor((e.loaded / e.total) * 85));
          }
        });
        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`Upload falhou: ${xhr.status}`));
        });
        xhr.addEventListener("error", () => reject(new Error("Erro de rede")));
        xhr.open("PUT", signedUrl);
        xhr.setRequestHeader("Content-Type", file.type);
        xhr.send(file);
      });

      setUploadProgress(95);

      const metaRes = await fetch("/api/media/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storagePath, originalName: file.name, sizeBytes: file.size, mimeType: file.type, publicUrl }),
      });

      setUploadProgress(100);

      if (!metaRes.ok) {
        const d = await metaRes.json();
        showToast("error", d.error ?? "Erro ao registrar vídeo");
        return false;
      }
      return true;
    } catch (err: unknown) {
      showToast("error", err instanceof Error ? err.message : "Erro de conexão no upload");
      return false;
    }
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const fileArray = Array.from(files);
    setUploading(true);
    setUploadTotal(fileArray.length);
    let successCount = 0;

    for (let i = 0; i < fileArray.length; i++) {
      setUploadCurrent(i + 1);
      const ok = await uploadFile(fileArray[i]);
      if (ok) successCount++;
    }

    await fetchVideos();

    if (successCount === fileArray.length) {
      showToast("success", fileArray.length === 1 ? "Vídeo enviado com sucesso!" : `${successCount} vídeos enviados!`);
    } else if (successCount > 0) {
      showToast("success", `${successCount} de ${fileArray.length} vídeos enviados.`);
    }

    setTimeout(() => {
      setUploading(false);
      setUploadProgress(0);
      setUploadCurrent(0);
      setUploadTotal(0);
      setUploadFileName("");
    }, 600);
  }

  async function deleteVideo(id: string) {
    setDeletingId(id);
    const res = await fetch(`/api/media/${id}`, { method: "DELETE" });
    if (res.ok) {
      setVideos((v) => v.filter((x) => x.id !== id));
      showToast("success", "Vídeo removido");
    } else {
      showToast("error", "Erro ao remover vídeo");
    }
    setDeletingId(null);
  }

  async function cleanupVideos(type: "duplicates" | "all") {
    setCleaning(true);
    setConfirmClean(null);
    const res = await fetch("/api/media/cleanup", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type }),
    });
    if (res.ok) {
      const data = await res.json();
      showToast("success", data.deleted === 0 ? "Nenhum duplicado encontrado" : `${data.deleted} vídeo(s) removido(s)`);
      await fetchVideos();
    } else {
      showToast("error", "Erro ao limpar vídeos");
    }
    setCleaning(false);
  }

  async function cleanVideoMeta(videoIds?: string[]) {
    const targets = (videoIds ?? videos.filter(v => v.mimeType === "video/mp4").map(v => v.id));
    if (!targets.length) return;
    setCleaningMeta(true);
    setCleanMetaProgress({ done: 0, total: targets.length });

    // Process in batches of 3 to avoid timeout
    const BATCH = 3;
    let done = 0;
    for (let i = 0; i < targets.length; i += BATCH) {
      const batch = targets.slice(i, i + BATCH);
      try {
        await fetch("/api/media/clean", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ videoIds: batch }),
        });
      } catch { /* continue */ }
      done += batch.length;
      setCleanMetaProgress({ done, total: targets.length });
    }

    showToast("success", `${done} vídeo${done !== 1 ? "s" : ""} limpo${done !== 1 ? "s" : ""} com sucesso!`);
    setCleaningMeta(false);
    setCleanMetaProgress(null);
    await fetchVideos();
  }

  const totalSize = videos.reduce((acc, v) => acc + v.sizeBytes, 0);

  return (
    <div style={{ position: "relative" }}>
      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed",
          top: "1.5rem",
          right: "1.5rem",
          zIndex: 100,
          display: "flex",
          alignItems: "center",
          gap: "0.6rem",
          padding: "0.85rem 1.2rem",
          borderRadius: "12px",
          background: toast.type === "success"
            ? "rgba(34, 197, 94, 0.12)"
            : "rgba(239, 68, 68, 0.12)",
          border: `1px solid ${toast.type === "success" ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
          backdropFilter: "blur(12px)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          animation: "slideIn 0.3s ease",
        }}>
          {toast.type === "success"
            ? <CheckCircle size={16} color="#4ade80" />
            : <XCircle size={16} color="#f87171" />}
          <span style={{ fontSize: "0.875rem", color: toast.type === "success" ? "#4ade80" : "#f87171" }}>
            {toast.msg}
          </span>
        </div>
      )}

      {/* Confirm clean modal */}
      {confirmClean && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div className="glass-panel" style={{ padding: "2rem", borderRadius: "16px", maxWidth: "400px", width: "90%", textAlign: "center" }}>
            <AlertTriangle size={32} color="#f87171" style={{ margin: "0 auto 1rem" }} />
            <h3 style={{ fontWeight: 700, marginBottom: "0.5rem" }}>Confirmar limpeza</h3>
            <p style={{ fontSize: "0.88rem", color: "var(--text-secondary)", marginBottom: "1.5rem" }}>
              {confirmClean === "duplicates"
                ? "Remove todos os vídeos duplicados, mantendo apenas 1 cópia de cada."
                : "Remove TODOS os vídeos da biblioteca permanentemente."}
            </p>
            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center" }}>
              <button onClick={() => setConfirmClean(null)} style={{ padding: "0.6rem 1.25rem", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "var(--text-secondary)", cursor: "pointer", fontSize: "0.875rem" }}>Cancelar</button>
              <button onClick={() => void cleanupVideos(confirmClean)} disabled={cleaning} style={{ padding: "0.6rem 1.25rem", borderRadius: "8px", border: "none", background: "rgba(239,68,68,0.15)", color: "#f87171", cursor: "pointer", fontSize: "0.875rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.4rem" }}>
                {cleaning ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Trash2 size={14} />} Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "2rem" }}>
        <div>
          <h1 className="page-title">Biblioteca de Mídia</h1>
          <p className="page-subtitle">Gerencie seus vídeos para postagem</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          {videos.length > 0 && (
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.5rem 1rem",
              background: "rgba(201,162,39,0.08)",
              border: "1px solid rgba(201,162,39,0.15)",
              borderRadius: "8px",
            }}>
              <HardDrive size={14} color="var(--accent-gold)" />
              <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                {videos.length} vídeo{videos.length !== 1 ? "s" : ""} · {formatBytes(totalSize)}
              </span>
            </div>
          )}
          {videos.length > 0 && (
            <div style={{ display: "flex", gap: "0.4rem" }}>
              <button
                onClick={() => void cleanVideoMeta()}
                disabled={cleaningMeta || cleaning}
                title="Remove metadados, re-encoda e aplica micro-variações para o Instagram tratar como vídeo novo"
                style={{ display: "flex", alignItems: "center", gap: "0.35rem", padding: "0.45rem 0.85rem", borderRadius: "8px", border: "1px solid rgba(167,139,250,0.3)", background: "rgba(167,139,250,0.08)", color: "#a78bfa", fontSize: "0.78rem", cursor: cleaningMeta ? "not-allowed" : "pointer", fontWeight: 600, opacity: cleaningMeta ? 0.7 : 1 }}>
                {cleaningMeta
                  ? <><Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> {cleanMetaProgress ? `${cleanMetaProgress.done}/${cleanMetaProgress.total}` : "Limpando..."}</>
                  : <><Wand2 size={13} /> Limpar dados</>}
              </button>
              <button onClick={() => setConfirmClean("duplicates")} disabled={cleaning || cleaningMeta}
                style={{ display: "flex", alignItems: "center", gap: "0.35rem", padding: "0.45rem 0.85rem", borderRadius: "8px", border: "1px solid rgba(96,165,250,0.2)", background: "rgba(96,165,250,0.07)", color: "#60a5fa", fontSize: "0.78rem", cursor: "pointer", fontWeight: 600 }}>
                <Copy size={13} /> Remover duplicados
              </button>
              <button onClick={() => setConfirmClean("all")} disabled={cleaning || cleaningMeta}
                style={{ display: "flex", alignItems: "center", gap: "0.35rem", padding: "0.45rem 0.85rem", borderRadius: "8px", border: "1px solid rgba(239,68,68,0.2)", background: "rgba(239,68,68,0.07)", color: "#f87171", fontSize: "0.78rem", cursor: "pointer", fontWeight: 600 }}>
                <Trash2 size={13} /> Apagar tudo
              </button>
            </div>
          )}
          <button
            className="btn btn-primary"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
          >
            <UploadCloud size={16} />
            {uploading ? "Enviando..." : "Upload"}
          </button>
        </div>
      </div>

      {/* Upload Zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
        onClick={() => !uploading && inputRef.current?.click()}
        style={{
          padding: "2.5rem",
          textAlign: "center",
          borderRadius: "14px",
          border: `2px dashed ${dragOver ? "rgba(201,162,39,0.55)" : "rgba(201,162,39,0.18)"}`,
          background: dragOver ? "rgba(201,162,39,0.05)" : "rgba(12,16,24,0.5)",
          cursor: uploading ? "not-allowed" : "pointer",
          marginBottom: "2rem",
          transition: "all 0.2s",
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="video/mp4,video/quicktime,video/mov"
          multiple
          style={{ display: "none" }}
          onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }}
        />

        {uploading ? (
          <div>
            <Loader2 size={40} color="var(--accent-gold)" style={{ margin: "0 auto 1rem", animation: "spin 1s linear infinite" }} />
            <p style={{ fontWeight: 600, marginBottom: "0.3rem" }}>
              {uploadTotal > 1 ? `Enviando ${uploadCurrent} de ${uploadTotal}...` : "Enviando vídeo..."}
            </p>
            {uploadFileName && (
              <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginBottom: "0.75rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "260px", margin: "0 auto 0.75rem" }}>
                {uploadFileName}
              </p>
            )}
            <div style={{
              maxWidth: "280px",
              margin: "0 auto",
              height: "6px",
              background: "rgba(255,255,255,0.06)",
              borderRadius: "99px",
              overflow: "hidden",
            }}>
              <div style={{
                height: "100%",
                width: `${uploadProgress}%`,
                background: "linear-gradient(90deg, #c9a227, #e8c54a)",
                borderRadius: "99px",
                transition: "width 0.3s ease",
              }} />
            </div>
            <p style={{ marginTop: "0.5rem", fontSize: "0.8rem", color: "var(--text-muted)" }}>
              {uploadProgress}%
            </p>
          </div>
        ) : (
          <>
            <UploadCloud size={40} color={dragOver ? "var(--accent-gold)" : "var(--text-secondary)"} style={{ margin: "0 auto 0.85rem" }} />
            <p style={{ fontWeight: 600, marginBottom: "0.4rem" }}>
              {dragOver ? "Solte os arquivos aqui" : "Arraste seus vídeos ou clique para selecionar"}
            </p>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>
              MP4 ou MOV · Máximo 200MB · Múltiplos arquivos suportados
            </p>
          </>
        )}
      </div>

      {/* Videos Grid */}
      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "3rem" }}>
          <Loader2 size={28} color="var(--accent-gold)" style={{ animation: "spin 1s linear infinite" }} />
        </div>
      ) : videos.length === 0 ? (
        <div style={{
          textAlign: "center",
          padding: "3rem",
          background: "rgba(12,16,24,0.5)",
          borderRadius: "14px",
          border: "1px solid var(--border-color)",
        }}>
          <Film size={40} color="var(--text-muted)" style={{ margin: "0 auto 1rem" }} />
          <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem" }}>
            Nenhum vídeo na biblioteca ainda
          </p>
        </div>
      ) : (
        <>
          <h2 style={{ marginBottom: "1rem", fontSize: "1rem", fontWeight: 600, color: "var(--text-secondary)" }}>
            Seus Vídeos
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "1rem" }}>
            {videos.map((video) => (
              <div key={video.id} className="glass-panel" style={{
                overflow: "hidden",
                borderRadius: "12px",
                transition: "transform 0.2s, border-color 0.2s",
                position: "relative",
              }}
                onMouseEnter={(e) => (e.currentTarget.style.transform = "translateY(-2px)")}
                onMouseLeave={(e) => (e.currentTarget.style.transform = "translateY(0)")}
              >
                {/* Thumbnail */}
                <div style={{
                  height: "130px",
                  background: "rgba(10,12,20,0.9)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  position: "relative",
                  overflow: "hidden",
                }}>
                  <video
                    src={video.publicUrl}
                    style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.7 }}
                    preload="metadata"
                    muted
                  />
                  <div style={{
                    position: "absolute",
                    inset: 0,
                    background: "linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 50%)",
                  }} />
                  {video.durationSecs && (
                    <div style={{
                      position: "absolute",
                      bottom: "0.5rem",
                      right: "0.5rem",
                      background: "rgba(0,0,0,0.7)",
                      borderRadius: "4px",
                      padding: "2px 6px",
                      fontSize: "0.7rem",
                      color: "#fff",
                      display: "flex",
                      alignItems: "center",
                      gap: "3px",
                    }}>
                      <Clock size={10} />
                      {Math.floor(video.durationSecs / 60)}:{String(Math.round(video.durationSecs % 60)).padStart(2, "0")}
                    </div>
                  )}
                </div>

                {/* Info */}
                <div style={{ padding: "0.85rem" }}>
                  <p style={{
                    fontSize: "0.875rem",
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    marginBottom: "0.3rem",
                  }}>
                    {video.originalName}
                  </p>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                      {formatBytes(video.sizeBytes)}
                    </span>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                      {formatDate(video.createdAt)}
                    </span>
                  </div>

                  <button
                    onClick={() => deleteVideo(video.id)}
                    disabled={deletingId === video.id}
                    style={{
                      marginTop: "0.75rem",
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "0.4rem",
                      padding: "0.5rem",
                      background: "rgba(239,68,68,0.07)",
                      border: "1px solid rgba(239,68,68,0.15)",
                      borderRadius: "8px",
                      color: "#f87171",
                      fontSize: "0.78rem",
                      cursor: deletingId === video.id ? "not-allowed" : "pointer",
                      transition: "all 0.2s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "rgba(239,68,68,0.14)";
                      e.currentTarget.style.borderColor = "rgba(239,68,68,0.3)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "rgba(239,68,68,0.07)";
                      e.currentTarget.style.borderColor = "rgba(239,68,68,0.15)";
                    }}
                  >
                    {deletingId === video.id
                      ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />
                      : <Trash2 size={13} />}
                    Remover
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes slideIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
      `}</style>
    </div>
  );
}
