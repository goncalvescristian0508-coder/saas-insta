"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  UploadCloud, FileVideo, Trash2, Clock, HardDrive,
  CheckCircle, XCircle, Loader2, Film
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
  const [dragOver, setDragOver] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
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

  async function uploadFile(file: File) {
    setUploading(true);
    setUploadProgress(0);

    const formData = new FormData();
    formData.append("file", file);

    const interval = setInterval(() => {
      setUploadProgress((p) => Math.min(p + 8, 85));
    }, 200);

    try {
      const res = await fetch("/api/media/upload", { method: "POST", body: formData });
      clearInterval(interval);
      setUploadProgress(100);

      if (!res.ok) {
        const data = await res.json();
        showToast("error", data.error ?? "Erro no upload");
      } else {
        showToast("success", "Vídeo enviado com sucesso!");
        await fetchVideos();
      }
    } catch {
      clearInterval(interval);
      showToast("error", "Erro de conexão no upload");
    } finally {
      setTimeout(() => {
        setUploading(false);
        setUploadProgress(0);
      }, 600);
    }
  }

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    uploadFile(files[0]);
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
          style={{ display: "none" }}
          onChange={(e) => handleFiles(e.target.files)}
        />

        {uploading ? (
          <div>
            <Loader2 size={40} color="var(--accent-gold)" style={{ margin: "0 auto 1rem", animation: "spin 1s linear infinite" }} />
            <p style={{ fontWeight: 600, marginBottom: "0.75rem" }}>Enviando vídeo...</p>
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
              {dragOver ? "Solte o arquivo aqui" : "Arraste seus vídeos ou clique para selecionar"}
            </p>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>
              MP4 ou MOV · Máximo 200MB
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
