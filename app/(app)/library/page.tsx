"use client";

import { useState, useEffect, useRef, useCallback, memo } from "react";
import {
  UploadCloud, FileVideo, Trash2, Clock, HardDrive,
  CheckCircle, XCircle, Loader2, Film, Copy, AlertTriangle, Wand2, ImagePlus, X
} from "lucide-react";

interface Video {
  id: string;
  originalName: string;
  publicUrl: string;
  coverUrl?: string | null;
  sizeBytes: number;
  durationSecs: number | null;
  mimeType: string;
  createdAt: string;
}

const videoThumbStyle: React.CSSProperties = { width: "100%", height: "100%", objectFit: "cover" };

const LazyVideoThumb = memo(function LazyVideoThumb({ src, coverUrl }: { src: string; coverUrl?: string | null }) {
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
    <div ref={wrapRef} style={{ width: "100%", height: "100%", position: "relative" }}>
      {active ? (
        // poster=coverUrl shows instantly; preload="none" when poster available (no video bytes loaded)
        <video
          src={src}
          poster={coverUrl || undefined}
          style={videoThumbStyle}
          preload={coverUrl ? "none" : "metadata"}
          muted
          playsInline
          onLoadedMetadata={!coverUrl ? (e) => {
            const v = e.target as HTMLVideoElement;
            if (v.duration > 0.5) v.currentTime = 0.5;
          } : undefined}
        />
      ) : coverUrl ? (
        <img src={coverUrl} alt="" style={videoThumbStyle} />
      ) : (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(10,12,20,0.9)" }}>
          <Film size={20} color="rgba(255,255,255,0.12)" />
        </div>
      )}
    </div>
  );
});

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
  const [uploadingCoverId, setUploadingCoverId] = useState<string | null>(null);
  const [uploadingCoverAll, setUploadingCoverAll] = useState(false);
  const [globalCoverPreview, setGlobalCoverPreview] = useState<string | null>(null);
  const [showCoverModal, setShowCoverModal] = useState(false);
  const [modalCoverFile, setModalCoverFile] = useState<File | null>(null);
  const [modalCoverPreview, setModalCoverPreview] = useState<string | null>(null);
  const [modalDragOver, setModalDragOver] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const coverTargetId = useRef<string | null>(null);
  const modalCoverInputRef = useRef<HTMLInputElement>(null);
  const [removingCoverAll, setRemovingCoverAll] = useState(false);
  const [removingCoverId, setRemovingCoverId] = useState<string | null>(null);
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

  // Restore global cover from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("library_global_cover");
    if (saved) setGlobalCoverPreview(saved);
  }, []);

  useEffect(() => {
    if (videos.length > 0 && videos.every((v) => v.coverUrl && v.coverUrl === videos[0].coverUrl)) {
      setGlobalCoverPreview(videos[0].coverUrl!);
      localStorage.setItem("library_global_cover", videos[0].coverUrl!);
    }
  }, [videos]);

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

  async function uploadCoverForAll(file: File): Promise<boolean> {
    setUploadingCoverAll(true);
    try {
      const signRes = await fetch(`/api/media/sign-upload?type=cover&filename=${encodeURIComponent(file.name)}`);
      const { signedUrl, publicUrl } = await signRes.json() as { signedUrl: string; publicUrl: string };
      await fetch(signedUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      const BATCH = 5;
      for (let i = 0; i < videos.length; i += BATCH) {
        await Promise.all(videos.slice(i, i + BATCH).map((v) =>
          fetch(`/api/media/${v.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ coverUrl: publicUrl }),
          })
        ));
      }
      setVideos((vs) => vs.map((v) => ({ ...v, coverUrl: publicUrl })));
      setGlobalCoverPreview(publicUrl);
      localStorage.setItem("library_global_cover", publicUrl);
      showToast("success", `Capa definida para ${videos.length} vídeo${videos.length !== 1 ? "s" : ""}!`);
      return true;
    } catch {
      showToast("error", "Erro ao definir capa para todos");
      return false;
    } finally {
      setUploadingCoverAll(false);
    }
  }

  async function uploadCover(file: File, videoId: string) {
    setUploadingCoverId(videoId);
    try {
      const signRes = await fetch(`/api/media/sign-upload?type=cover&filename=${encodeURIComponent(file.name)}`);
      const { signedUrl, publicUrl } = await signRes.json() as { signedUrl: string; publicUrl: string };
      await fetch(signedUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      const patchRes = await fetch(`/api/media/${videoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coverUrl: publicUrl }),
      });
      if (patchRes.ok) {
        setVideos((vs) => vs.map((v) => v.id === videoId ? { ...v, coverUrl: publicUrl } : v));
        showToast("success", "Capa definida com sucesso");
      } else {
        showToast("error", "Erro ao salvar capa");
      }
    } catch {
      showToast("error", "Erro no upload da capa");
    }
    setUploadingCoverId(null);
  }

  async function removeCoverFromAll() {
    setRemovingCoverAll(true);
    try {
      const BATCH = 5;
      for (let i = 0; i < videos.length; i += BATCH) {
        await Promise.all(videos.slice(i, i + BATCH).map((v) =>
          fetch(`/api/media/${v.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ coverUrl: null }),
          })
        ));
      }
      setVideos((vs) => vs.map((v) => ({ ...v, coverUrl: null })));
      setGlobalCoverPreview(null);
      localStorage.removeItem("library_global_cover");
      showToast("success", "Capa removida de todos os vídeos");
    } catch {
      showToast("error", "Erro ao remover capas");
    } finally {
      setRemovingCoverAll(false);
    }
  }

  async function removeCover(videoId: string) {
    setRemovingCoverId(videoId);
    try {
      const res = await fetch(`/api/media/${videoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coverUrl: null }),
      });
      if (res.ok) {
        setVideos((vs) => vs.map((v) => v.id === videoId ? { ...v, coverUrl: null } : v));
        // Update global cover banner if needed
        const remaining = videos.filter((v) => v.id !== videoId && v.coverUrl);
        if (remaining.length === 0) {
          setGlobalCoverPreview(null);
          localStorage.removeItem("library_global_cover");
        }
        showToast("success", "Capa removida");
      } else {
        showToast("error", "Erro ao remover capa");
      }
    } catch {
      showToast("error", "Erro ao remover capa");
    } finally {
      setRemovingCoverId(null);
    }
  }

  function openCoverAllModal() {
    setModalCoverFile(null);
    setModalCoverPreview(globalCoverPreview);
    setShowCoverModal(true);
  }

  function closeModal() {
    if (modalCoverPreview && modalCoverPreview.startsWith("blob:")) {
      URL.revokeObjectURL(modalCoverPreview);
    }
    setShowCoverModal(false);
    setModalCoverFile(null);
    setModalCoverPreview(null);
  }

  function handleModalCoverFile(file: File) {
    if (modalCoverPreview && modalCoverPreview.startsWith("blob:")) {
      URL.revokeObjectURL(modalCoverPreview);
    }
    setModalCoverFile(file);
    setModalCoverPreview(URL.createObjectURL(file));
  }

  async function applyGlobalCover() {
    if (!modalCoverFile) { closeModal(); return; }
    const ok = await uploadCoverForAll(modalCoverFile);
    if (ok) closeModal();
  }

  function openCoverPicker(videoId: string) {
    coverTargetId.current = videoId;
    coverInputRef.current?.click();
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
                onClick={openCoverAllModal}
                disabled={uploadingCoverAll || cleaning || cleaningMeta}
                title="Aplica a mesma imagem de capa em todos os vídeos da biblioteca"
                style={{ display: "flex", alignItems: "center", gap: "0.35rem", padding: "0.45rem 0.85rem", borderRadius: "8px", border: "1px solid rgba(255,184,0,0.3)", background: "rgba(255,184,0,0.08)", color: "var(--accent-gold)", fontSize: "0.78rem", cursor: uploadingCoverAll ? "not-allowed" : "pointer", fontWeight: 600, opacity: uploadingCoverAll ? 0.7 : 1 }}>
                {uploadingCoverAll
                  ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />
                  : <ImagePlus size={13} />}
                {uploadingCoverAll ? "Aplicando..." : "Capa para todos"}
              </button>
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
          {globalCoverPreview && (
            <div style={{
              display: "flex", alignItems: "center", gap: "1rem",
              padding: "0.85rem 1.1rem", borderRadius: "12px", marginBottom: "1.25rem",
              background: "rgba(255,184,0,0.06)", border: "1px solid rgba(255,184,0,0.2)",
            }}>
              <img
                src={globalCoverPreview}
                alt="Capa global"
                style={{ width: "52px", height: "52px", borderRadius: "8px", objectFit: "cover", border: "1px solid rgba(255,184,0,0.3)", flexShrink: 0 }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--accent-gold)", marginBottom: "0.15rem" }}>Capa global ativa</p>
                <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Esta imagem será usada como capa de todos os Reels ao publicar no Instagram.</p>
              </div>
              <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
                <button
                  onClick={openCoverAllModal}
                  disabled={uploadingCoverAll || removingCoverAll}
                  style={{ padding: "0.4rem 0.8rem", borderRadius: "7px", border: "1px solid rgba(255,184,0,0.3)", background: "rgba(255,184,0,0.1)", color: "var(--accent-gold)", fontSize: "0.75rem", cursor: "pointer", fontWeight: 600 }}>
                  Trocar
                </button>
                <button
                  onClick={() => void removeCoverFromAll()}
                  disabled={removingCoverAll || uploadingCoverAll}
                  title="Remove a capa de todos os vídeos"
                  style={{ padding: "0.4rem 0.8rem", borderRadius: "7px", border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.08)", color: "#f87171", fontSize: "0.75rem", cursor: removingCoverAll ? "not-allowed" : "pointer", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.3rem" }}>
                  {removingCoverAll ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> : <X size={12} />}
                  {removingCoverAll ? "Removendo..." : "Remover"}
                </button>
              </div>
            </div>
          )}
          <h2 style={{ marginBottom: "1rem", fontSize: "1rem", fontWeight: 600, color: "var(--text-secondary)" }}>
            Seus Vídeos
          </h2>
          {/* Hidden input for cover image upload */}
          <input
            ref={coverInputRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file && coverTargetId.current) void uploadCover(file, coverTargetId.current);
              e.target.value = "";
            }}
          />

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
                <div style={{ height: "130px", position: "relative", overflow: "hidden" }}>
                  <LazyVideoThumb src={video.publicUrl} coverUrl={video.coverUrl} />
                  <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.55) 0%, transparent 55%)", pointerEvents: "none" }} />
                  {video.durationSecs != null && (
                    <div style={{
                      position: "absolute", bottom: "0.5rem", right: "0.5rem",
                      background: "rgba(0,0,0,0.7)", borderRadius: "4px",
                      padding: "2px 6px", fontSize: "0.7rem", color: "#fff",
                      display: "flex", alignItems: "center", gap: "3px",
                    }}>
                      <Clock size={10} />
                      {Math.floor(video.durationSecs / 60)}:{String(Math.round(video.durationSecs % 60)).padStart(2, "0")}
                    </div>
                  )}
                  {video.coverUrl && (
                    <div style={{
                      position: "absolute", top: "0.4rem", left: "0.4rem",
                      background: "rgba(255,184,0,0.92)", borderRadius: "4px",
                      padding: "2px 6px", fontSize: "0.62rem", fontWeight: 700, color: "#1a1300",
                    }}>
                      CAPA
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

                  <div style={{ marginTop: "0.75rem", display: "flex", gap: "0.35rem" }}>
                    <button
                      onClick={() => openCoverPicker(video.id)}
                      disabled={uploadingCoverId === video.id || removingCoverId === video.id}
                      style={{
                        flex: 1,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "0.4rem",
                        padding: "0.5rem",
                        background: video.coverUrl ? "rgba(255,184,0,0.1)" : "rgba(255,255,255,0.04)",
                        border: `1px solid ${video.coverUrl ? "rgba(255,184,0,0.3)" : "rgba(255,255,255,0.1)"}`,
                        borderRadius: "8px",
                        color: video.coverUrl ? "var(--accent)" : "var(--text-secondary)",
                        fontSize: "0.78rem",
                        cursor: uploadingCoverId === video.id ? "not-allowed" : "pointer",
                      }}
                    >
                      {uploadingCoverId === video.id
                        ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />
                        : <Film size={13} />}
                      {video.coverUrl ? "Trocar capa" : "Definir capa"}
                    </button>
                    {video.coverUrl && (
                      <button
                        onClick={() => void removeCover(video.id)}
                        disabled={removingCoverId === video.id || uploadingCoverId === video.id}
                        title="Remover capa"
                        style={{
                          flexShrink: 0,
                          padding: "0.5rem 0.55rem",
                          background: "rgba(239,68,68,0.07)",
                          border: "1px solid rgba(239,68,68,0.2)",
                          borderRadius: "8px",
                          color: "#f87171",
                          cursor: removingCoverId === video.id ? "not-allowed" : "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {removingCoverId === video.id
                          ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />
                          : <X size={13} />}
                      </button>
                    )}
                  </div>

                  <button
                    onClick={() => deleteVideo(video.id)}
                    disabled={deletingId === video.id}
                    style={{
                      marginTop: "0.4rem",
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

      {/* Capa para todos modal */}
      {showCoverModal && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
          style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <div className="glass-panel" style={{ padding: "1.75rem", borderRadius: "18px", maxWidth: "420px", width: "90%", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            {/* Title row */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h3 style={{ fontWeight: 700, fontSize: "1rem", marginBottom: "0.2rem" }}>Capa para todos os vídeos</h3>
                <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Esta imagem será usada como capa de todos os Reels ao publicar.</p>
              </div>
              <button onClick={closeModal} style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", padding: "0.25rem", flexShrink: 0 }}>
                <X size={18} />
              </button>
            </div>

            {/* Preview / drop zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setModalDragOver(true); }}
              onDragLeave={() => setModalDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setModalDragOver(false);
                const file = e.dataTransfer.files?.[0];
                if (file && file.type.startsWith("image/")) handleModalCoverFile(file);
              }}
              onClick={() => modalCoverInputRef.current?.click()}
              style={{
                height: "210px",
                borderRadius: "12px",
                border: `2px dashed ${modalDragOver ? "rgba(255,184,0,0.7)" : modalCoverPreview ? "rgba(255,184,0,0.35)" : "rgba(255,184,0,0.25)"}`,
                background: modalDragOver ? "rgba(255,184,0,0.05)" : "rgba(0,0,0,0.3)",
                overflow: "hidden",
                cursor: "pointer",
                position: "relative",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "border-color 0.2s",
              }}
            >
              {modalCoverPreview ? (
                <>
                  <img src={modalCoverPreview} alt="Capa" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  <div
                    className="cover-hover-overlay"
                    style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "0.5rem", opacity: 0, transition: "opacity 0.2s" }}
                  >
                    <ImagePlus size={24} color="#fff" />
                    <p style={{ color: "#fff", fontSize: "0.82rem", fontWeight: 600 }}>Clique para trocar</p>
                  </div>
                </>
              ) : (
                <div style={{ textAlign: "center", padding: "1rem" }}>
                  <ImagePlus size={36} color="rgba(255,184,0,0.45)" style={{ margin: "0 auto 0.75rem" }} />
                  <p style={{ fontSize: "0.88rem", color: "var(--text-secondary)", fontWeight: 500 }}>Clique ou arraste uma imagem</p>
                  <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.3rem" }}>JPG ou PNG</p>
                </div>
              )}
              <input
                ref={modalCoverInputRef}
                type="file"
                accept="image/jpeg,image/jpg,image/png"
                style={{ display: "none" }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleModalCoverFile(file);
                  e.target.value = "";
                }}
              />
            </div>

            {modalCoverPreview && !modalCoverFile && (
              <p style={{ fontSize: "0.74rem", color: "var(--text-muted)", textAlign: "center", marginTop: "-0.5rem" }}>
                Capa salva · Clique na imagem para trocar
              </p>
            )}

            {/* Actions */}
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button
                onClick={closeModal}
                style={{ flex: 1, padding: "0.65rem", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "var(--text-secondary)", cursor: "pointer", fontSize: "0.875rem" }}
              >
                Cancelar
              </button>
              <button
                onClick={() => void applyGlobalCover()}
                disabled={uploadingCoverAll || !modalCoverFile}
                style={{
                  flex: 1, padding: "0.65rem", borderRadius: "8px",
                  border: "1px solid rgba(255,184,0,0.4)", background: "rgba(255,184,0,0.12)",
                  color: "var(--accent-gold)", cursor: (!modalCoverFile || uploadingCoverAll) ? "not-allowed" : "pointer",
                  fontSize: "0.875rem", fontWeight: 600,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: "0.45rem",
                  opacity: !modalCoverFile ? 0.5 : 1,
                  transition: "opacity 0.2s",
                }}
              >
                {uploadingCoverAll
                  ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Aplicando...</>
                  : "Aplicar para todos"}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes slideIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
        .cover-hover-overlay:hover { opacity: 1 !important; }
      `}</style>
    </div>
  );
}
