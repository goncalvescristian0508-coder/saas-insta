"use client";

import { Search, Plus, X, Download, Play, FolderOpen, Trash2, ExternalLink, Sparkles, Loader2, AlertTriangle, Heart, MessageCircle, Eye, CalendarPlus, Key, CheckCircle } from "lucide-react";
import { useState, useEffect } from "react";

interface ApifyToken {
  id: string;
  masked: string;
  label: string;
  isActive: boolean;
}

interface VideoItem {
  id: number;
  shortCode: string;
  caption: string;
  videoUrl: string;
  thumbnailUrl: string;
  likes: number;
  comments: number;
  views: number;
  timestamp: string;
}

interface Model {
  id: number;
  username: string;
  fullName: string;
  profilePicUrl: string;
  totalVideos: number;
  videos: VideoItem[];
}

export default function InspiracoesPage() {
  const [models, setModels] = useState<Model[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [searchUsername, setSearchUsername] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchProgress, setSearchProgress] = useState(0);
  const [searchError, setSearchError] = useState("");
  const [selectedModel, setSelectedModel] = useState<Model | null>(null);
  const [downloadingIds, setDownloadingIds] = useState<Set<number>>(new Set());
  const [modelToDelete, setModelToDelete] = useState<number | null>(null);

  const [isLoaded, setIsLoaded] = useState(false);

  // Apify token management
  const [apifyTokens, setApifyTokens] = useState<ApifyToken[]>([]);
  const [apifyActiveCount, setApifyActiveCount] = useState(0);
  const [newTokenValue, setNewTokenValue] = useState("");
  const [newTokenLabel, setNewTokenLabel] = useState("");
  const [addingToken, setAddingToken] = useState(false);
  const [tokenAdded, setTokenAdded] = useState(false);

  const loadApifyTokens = async () => {
    try {
      const res = await fetch("/api/apify-tokens");
      if (!res.ok) return;
      const d = await res.json();
      setApifyTokens(d.tokens ?? []);
      setApifyActiveCount(d.activeCount ?? 0);
    } catch {}
  };

  const handleAddToken = async () => {
    if (!newTokenValue.trim()) return;
    setAddingToken(true);
    try {
      const res = await fetch("/api/apify-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: newTokenValue.trim(), label: newTokenLabel.trim() }),
      });
      if (res.ok) {
        setNewTokenValue("");
        setNewTokenLabel("");
        setTokenAdded(true);
        setTimeout(() => setTokenAdded(false), 2000);
        void loadApifyTokens();
      }
    } finally {
      setAddingToken(false);
    }
  };

  const handleDeleteToken = async (id: string) => {
    await fetch(`/api/apify-tokens/${id}`, { method: "DELETE" });
    setApifyTokens((prev) => prev.filter((t) => t.id !== id));
  };

  // Carregar modelos do localStorage ao montar o componente
  useEffect(() => {
    const saved = localStorage.getItem("wayne_inspiracoes_models");
    if (saved) {
      try { setModels(JSON.parse(saved)); } catch {}
    }
    setIsLoaded(true);
    void loadApifyTokens();
  }, []);

  // Salvar modelos no localStorage sempre que a lista mudar
  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem("wayne_inspiracoes_models", JSON.stringify(models));
    }
  }, [models, isLoaded]);

  const handleSearch = async () => {
    if (!searchUsername.trim()) return;
    setIsSearching(true);
    setSearchError("");
    setSearchProgress(0);

    const progressInterval = setInterval(() => {
      setSearchProgress(prev => {
        if (prev >= 95) return prev;
        const increment = prev < 50 ? Math.random() * 5 + 2 : Math.random() * 2 + 0.5;
        return Math.min(95, prev + increment);
      });
    }, 800);

    try {
      const res = await fetch("/api/instagram/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: searchUsername }),
      });

      const data = await res.json();

      if (!res.ok) {
        clearInterval(progressInterval);
        setSearchError(data.error || "Erro ao buscar perfil.");
        setIsSearching(false);
        return;
      }

      if (data.videos.length === 0) {
        clearInterval(progressInterval);
        setSearchError("Nenhum vídeo encontrado para este perfil. Verifique se é um perfil público e possui reels/vídeos.");
        setIsSearching(false);
        return;
      }

      clearInterval(progressInterval);
      setSearchProgress(100);
      await new Promise(r => setTimeout(r, 500));

      const newModel: Model = {
        id: Date.now(),
        username: data.profile.username,
        fullName: data.profile.fullName,
        profilePicUrl: data.profile.profilePicUrl,
        totalVideos: data.totalVideos,
        videos: data.videos,
      };

      setModels([newModel, ...models]);
      setSearchUsername("");
      setShowSearch(false);
    } catch (err: any) {
      clearInterval(progressInterval);
      setSearchError("Erro de conexão. Tente novamente.");
    } finally {
      clearInterval(progressInterval);
      setIsSearching(false);
    }
  };

  const handleDownload = async (video: VideoItem) => {
    if (!video.videoUrl) {
      alert("URL do vídeo não disponível.");
      return;
    }

    setDownloadingIds((prev) => new Set(prev).add(video.id));

    try {
      // Baixar via proxy para evitar CORS e limpar metadados
      const res = await fetch("/api/instagram/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoUrl: video.videoUrl, filename: `${video.shortCode || 'video'}.mp4` }),
      });

      if (!res.ok) {
        throw new Error("Erro no download");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${video.shortCode || 'video_' + video.id}_sem_metadados.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert("Erro ao baixar vídeo. Tente novamente.");
    } finally {
      setDownloadingIds((prev) => {
        const next = new Set(prev);
        next.delete(video.id);
        return next;
      });
    }
  };

  const handleDownloadAll = async (model: Model) => {
    for (const video of model.videos) {
      await handleDownload(video);
      // Pausa entre downloads para evitar sobrecarga
      await new Promise((r) => setTimeout(r, 500));
    }
  };

  const handleRemoveModel = (id: number) => {
    setModels(models.filter((m) => m.id !== id));
    if (selectedModel?.id === id) setSelectedModel(null);
  };

  const formatNumber = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <div style={{
            width: "48px", height: "48px", borderRadius: "12px",
            background: "linear-gradient(135deg, #3b82f6, #8b5cf6)",
            display: "flex", justifyContent: "center", alignItems: "center",
          }}>
            <Sparkles size={24} color="#fff" />
          </div>
          <div>
            <h1 className="page-title" style={{ marginBottom: 0 }}>Inspirações</h1>
            <p className="page-subtitle" style={{ marginBottom: 0 }}>Modelos importados e seus conteúdos</p>
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => { setShowSearch(true); setSearchError(""); }} style={{
          background: "linear-gradient(135deg, #3b82f6, #2563eb)",
          border: "none", borderRadius: "20px", padding: "0.7rem 1.5rem",
        }}>
          <Plus size={18} /> Adicionar Modelo
        </button>
      </div>

      {/* Apify API Keys section */}
      <div style={{
        marginTop: "1.5rem", padding: "1.25rem 1.5rem", borderRadius: "12px",
        background: "rgba(255,255,255,0.02)", border: "1px solid var(--border-color)",
        marginBottom: "1.5rem",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Key size={16} color="var(--accent-gold)" />
            <span style={{ fontWeight: 700, fontSize: "0.9rem" }}>API Keys da Apify</span>
          </div>
          <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
            {apifyActiveCount} ativa(s) / {apifyTokens.length} total
          </span>
        </div>

        {/* Add form */}
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem" }}>
          <input
            type="text"
            placeholder="apify_api_..."
            value={newTokenValue}
            onChange={(e) => setNewTokenValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void handleAddToken()}
            style={{
              flex: 2, padding: "0.5rem 0.75rem", borderRadius: "8px",
              background: "rgba(255,255,255,0.06)", border: "1px solid var(--border-color)",
              color: "#fff", fontSize: "0.85rem", outline: "none",
            }}
          />
          <input
            type="text"
            placeholder="Label (opcional)"
            value={newTokenLabel}
            onChange={(e) => setNewTokenLabel(e.target.value)}
            style={{
              flex: 1, padding: "0.5rem 0.75rem", borderRadius: "8px",
              background: "rgba(255,255,255,0.06)", border: "1px solid var(--border-color)",
              color: "#fff", fontSize: "0.85rem", outline: "none",
            }}
          />
          <button
            onClick={() => void handleAddToken()}
            disabled={addingToken || !newTokenValue.trim()}
            style={{
              padding: "0.5rem 1rem", borderRadius: "8px",
              background: tokenAdded ? "rgba(74,222,128,0.2)" : "rgba(96,165,250,0.2)",
              border: `1px solid ${tokenAdded ? "rgba(74,222,128,0.4)" : "rgba(96,165,250,0.4)"}`,
              color: tokenAdded ? "#4ade80" : "#60a5fa", cursor: "pointer",
              fontWeight: 700, fontSize: "0.82rem", display: "flex", alignItems: "center", gap: "0.3rem",
            }}
          >
            {tokenAdded ? <CheckCircle size={14} /> : <Plus size={14} />}
            {tokenAdded ? "Adicionada" : "Add"}
          </button>
        </div>

        {/* Token list */}
        {apifyTokens.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            {apifyTokens.map((t) => (
              <div key={t.id} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "0.5rem 0.75rem", borderRadius: "8px",
                background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flex: 1, minWidth: 0 }}>
                  <CheckCircle size={14} color={t.isActive ? "#22c55e" : "var(--text-muted)"} />
                  <span style={{ fontSize: "0.82rem", fontFamily: "monospace", color: "var(--text-secondary)" }}>
                    {t.masked}
                  </span>
                  {t.label && (
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{t.label}</span>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexShrink: 0 }}>
                  <span style={{ fontSize: "0.72rem", color: t.isActive ? "#22c55e" : "var(--text-muted)" }}>
                    {t.isActive ? "Active" : "Inativa"}
                  </span>
                  <button
                    onClick={() => void handleDeleteToken(t.id)}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", padding: "0.2rem" }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = "#f87171"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-secondary)"; }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Search Panel */}
      {showSearch && (
        <div style={{
          marginTop: "2rem", padding: "1.5rem 2rem",
          borderRadius: "16px", border: "1px solid var(--border-color)",
          backgroundColor: "rgba(255,255,255,0.02)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Search size={16} color="var(--text-secondary)" />
              <span style={{ fontWeight: 500 }}>Adicionar modelo do Instagram</span>
            </div>
            <button onClick={() => setShowSearch(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", padding: "0.3rem" }}>
              <X size={18} />
            </button>
          </div>

          <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
            <input
              type="text"
              className="input-field"
              placeholder="@username"
              value={searchUsername}
              onChange={(e) => setSearchUsername(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !isSearching && handleSearch()}
              style={{ flex: 1, borderRadius: "12px", padding: "0.9rem 1.2rem" }}
              autoFocus
              disabled={isSearching}
            />
            <button
              className="btn btn-primary"
              onClick={handleSearch}
              disabled={isSearching}
              style={{
                background: "linear-gradient(135deg, #3b82f6, #2563eb)",
                border: "none", borderRadius: "12px", padding: "0.9rem 1.5rem",
                opacity: isSearching ? 0.7 : 1, minWidth: "140px",
              }}
            >
              {isSearching ? (
                <><Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> Buscando...</>
              ) : (
                <><Search size={16} /> Buscar</>
              )}
            </button>
          </div>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginTop: "0.8rem" }}>
            TODOS os posts, reels, dados do perfil, capas e legendas serão importados.
          </p>

          {/* Error message */}
          {searchError && (
            <div style={{
              marginTop: "1rem", padding: "0.8rem 1rem",
              borderRadius: "8px", backgroundColor: "rgba(239,68,68,0.1)",
              border: "1px solid rgba(239,68,68,0.3)",
              display: "flex", alignItems: "center", gap: "0.5rem",
              color: "#f87171", fontSize: "0.9rem",
            }}>
              <AlertTriangle size={16} />
              {searchError}
            </div>
          )}

          {/* Loading indicator */}
          {isSearching && (
            <div style={{
              marginTop: "1rem", padding: "1rem",
              textAlign: "center", color: "var(--text-secondary)", fontSize: "0.9rem",
            }}>
              <Loader2 size={24} style={{ animation: "spin 1s linear infinite", marginBottom: "0.5rem" }} />
              <p>Importando dados do Instagram via Apify... Isso pode levar até 1 minuto.</p>
            </div>
          )}
        </div>
      )}

      {/* Content */}
      <div style={{ marginTop: "2rem" }}>
        {selectedModel ? (
          /* Video Grid for Selected Model */
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                <button
                  className="btn btn-outline"
                  onClick={() => setSelectedModel(null)}
                  style={{ padding: "0.5rem 0.8rem", fontSize: "0.85rem" }}
                >
                  ← Voltar
                </button>
                {selectedModel.profilePicUrl ? (
                  <img
                    src={`/api/media/proxy?url=${encodeURIComponent(selectedModel.profilePicUrl)}`}
                    alt={selectedModel.username}
                    referrerPolicy="no-referrer"
                    style={{ width: "40px", height: "40px", borderRadius: "50%", objectFit: "cover" }}
                  />
                ) : (
                  <div style={{
                    width: "40px", height: "40px", borderRadius: "50%",
                    background: `hsl(${selectedModel.username.length * 50}, 60%, 40%)`,
                    display: "flex", justifyContent: "center", alignItems: "center",
                    fontWeight: 700, fontSize: "1rem", color: "#fff",
                  }}>
                    {selectedModel.username.charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <span style={{ fontWeight: 600 }}>@{selectedModel.username}</span>
                  <span style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginLeft: "1rem" }}>
                    {selectedModel.videos.length} vídeos
                  </span>
                </div>
              </div>
              <button
                className="btn btn-primary"
                onClick={() => handleDownloadAll(selectedModel)}
                style={{ background: "linear-gradient(135deg, #3b82f6, #2563eb)", border: "none", borderRadius: "12px" }}
              >
                <Download size={16} /> Baixar Todos (Sem Metadados)
              </button>
            </div>

            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
              gap: "1rem",
            }}>
              {selectedModel.videos.map((video) => {
                const isDownloading = downloadingIds.has(video.id);
                return (
                  <div key={video.id} className="video-card glass-panel" style={{ 
                    overflow: "hidden", 
                    position: "relative",
                    height: "360px",
                    cursor: "pointer",
                    borderRadius: "16px"
                  }}>
                    {/* Video Thumbnail Full Cover */}
                    {video.thumbnailUrl ? (
                      <img
                        src={`/api/media/proxy?url=${encodeURIComponent(video.thumbnailUrl)}`}
                        alt={video.caption?.slice(0, 30) || "Video"}
                        referrerPolicy="no-referrer"
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    ) : (
                      <div style={{
                        width: "100%", height: "100%",
                        display: "flex", justifyContent: "center", alignItems: "center",
                        background: `hsl(${(video.id * 37) % 360}, 25%, 18%)`,
                      }}>
                        <Play size={32} color="rgba(255,255,255,0.3)" />
                      </div>
                    )}

                    {/* Play icon at top right when not hovered */}
                    <div className="play-icon-static" style={{
                      position: "absolute", top: "12px", right: "12px",
                      width: "32px", height: "32px", borderRadius: "50%",
                      backgroundColor: "rgba(0,0,0,0.5)", display: "flex",
                      justifyContent: "center", alignItems: "center",
                      backdropFilter: "blur(4px)",
                    }}>
                      <Play size={14} color="#fff" fill="#fff" />
                    </div>

                    {/* Hover Overlay */}
                    <div className="video-card-overlay" style={{
                      position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
                      background: "rgba(0,0,0,0.7)",
                      backdropFilter: "blur(2px)",
                      display: "flex", flexDirection: "column",
                      padding: "1.2rem",
                    }}>
                      
                      {/* Center Stats */}
                      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: "1rem" }}>
                        <div style={{ display: "flex", gap: "1.5rem" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                            <Heart size={16} color="#ef4444" />
                            <span style={{ fontSize: "0.9rem", fontWeight: 600 }}>{formatNumber(video.likes)}</span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                            <MessageCircle size={16} color="#3b82f6" />
                            <span style={{ fontSize: "0.9rem", fontWeight: 600 }}>{formatNumber(video.comments)}</span>
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", color: "var(--text-secondary)" }}>
                          <Eye size={14} />
                          <span style={{ fontSize: "0.85rem" }}>{formatNumber(video.views)}</span>
                        </div>

                        {/* Action Buttons */}
                        <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem", width: "100%" }}>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDownload(video); }}
                            disabled={isDownloading}
                            style={{
                              flex: 1, padding: "0.6rem",
                              background: isDownloading ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.15)",
                              border: "1px solid rgba(255,255,255,0.2)",
                              borderRadius: "8px", cursor: isDownloading ? "default" : "pointer",
                              color: "#fff", fontSize: "0.8rem", fontWeight: 500,
                              display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem",
                              transition: "all 0.2s", fontFamily: "inherit",
                            }}
                            onMouseEnter={(e) => { if (!isDownloading) e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.25)"; }}
                            onMouseLeave={(e) => { if (!isDownloading) e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.15)"; }}
                          >
                            {isDownloading ? (
                              <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> ...</>
                            ) : (
                              <><Download size={14} /> Baixar</>
                            )}
                          </button>
                          
                          <button
                            onClick={(e) => { e.stopPropagation(); /* TODO: Implement Agendar */ }}
                            style={{
                              flex: 1, padding: "0.6rem",
                              background: "rgba(0,0,0,0.4)",
                              border: "1px solid rgba(255,255,255,0.1)",
                              borderRadius: "8px", cursor: "pointer",
                              color: "#fff", fontSize: "0.8rem", fontWeight: 500,
                              display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem",
                              transition: "all 0.2s", fontFamily: "inherit",
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "rgba(0,0,0,0.6)"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "rgba(0,0,0,0.4)"; }}
                          >
                            <CalendarPlus size={14} /> Agendar
                          </button>
                        </div>
                      </div>

                      {/* Caption at bottom */}
                      <div style={{ marginTop: "auto" }}>
                        <p style={{
                          fontSize: "0.75rem", color: "rgba(255,255,255,0.8)",
                          overflow: "hidden", textOverflow: "ellipsis",
                          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as any,
                          lineHeight: 1.4,
                        }}>
                          {video.caption || "(sem legenda)"}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : models.length === 0 ? (
          /* Empty State */
          <div style={{
            textAlign: "center", padding: "5rem 2rem",
            borderRadius: "16px", border: "1px solid var(--border-color)",
          }}>
            <FolderOpen size={48} color="var(--text-secondary)" style={{ marginBottom: "1rem", opacity: 0.4 }} />
            <h3 style={{ color: "var(--text-secondary)", fontWeight: 500, marginBottom: "0.5rem" }}>Nenhuma modelo ainda</h3>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", opacity: 0.7 }}>
              Clique em &quot;Adicionar Modelo&quot; para importar conteúdos do Instagram.
            </p>
          </div>
        ) : (
          /* Model Cards List */
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {models.map((model) => (
              <div
                key={model.id}
                className="glass-panel"
                style={{
                  padding: "1.5rem",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  cursor: "pointer", transition: "all 0.2s",
                }}
                onClick={() => setSelectedModel(model)}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                  {model.profilePicUrl ? (
                    <img
                      src={`/api/media/proxy?url=${encodeURIComponent(model.profilePicUrl)}`}
                      alt={model.username}
                      referrerPolicy="no-referrer"
                      style={{ width: "50px", height: "50px", borderRadius: "50%", objectFit: "cover" }}
                    />
                  ) : (
                    <div style={{
                      width: "50px", height: "50px", borderRadius: "50%",
                      background: `hsl(${model.username.length * 50}, 60%, 40%)`,
                      display: "flex", justifyContent: "center", alignItems: "center",
                      fontWeight: 700, fontSize: "1.2rem", color: "#fff",
                    }}>
                      {model.username.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <p style={{ fontWeight: 600, fontSize: "1rem" }}>@{model.username}</p>
                    <div style={{ display: "flex", gap: "1.5rem", marginTop: "0.3rem" }}>
                      {model.fullName && model.fullName !== model.username && (
                        <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                          {model.fullName}
                        </span>
                      )}
                      <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                        {model.totalVideos} vídeos importados
                      </span>
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <button
                    className="btn btn-outline"
                    onClick={(e) => { e.stopPropagation(); setSelectedModel(model); }}
                    style={{ padding: "0.4rem 1rem", fontSize: "0.85rem", borderRadius: "8px" }}
                  >
                    <ExternalLink size={14} /> Ver Vídeos
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setModelToDelete(model.id); }}
                    style={{
                      background: "none", border: "none", cursor: "pointer",
                      color: "var(--text-secondary)", padding: "0.5rem",
                      borderRadius: "8px", transition: "all 0.2s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = "#ef4444"; e.currentTarget.style.backgroundColor = "rgba(239,68,68,0.1)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-secondary)"; e.currentTarget.style.backgroundColor = "transparent"; }}
                    title="Remover modelo"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Spinner animation */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .video-card-overlay {
          opacity: 0;
          transition: opacity 0.3s ease;
        }
        .play-icon-static {
          opacity: 1;
          transition: opacity 0.3s ease;
        }
        .video-card:hover .video-card-overlay {
          opacity: 1;
        }
        .video-card:hover .play-icon-static {
          opacity: 0;
        }
      `}</style>

      {/* Loading Modal Overlay */}
      {isSearching && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: "rgba(0,0,0,0.8)", backdropFilter: "blur(4px)",
          display: "flex", justifyContent: "center", alignItems: "center",
          zIndex: 9999,
        }}>
          <div className="glass-panel" style={{
            width: "400px", padding: "2.5rem", borderRadius: "16px",
            display: "flex", flexDirection: "column", alignItems: "center",
            textAlign: "center"
          }}>
            {/* Logo/Icon */}
            <div style={{
              width: "64px", height: "64px", borderRadius: "16px",
              background: "linear-gradient(135deg, #1e3a8a, #3b82f6)",
              display: "flex", justifyContent: "center", alignItems: "center",
              marginBottom: "1.5rem", boxShadow: "0 8px 32px rgba(59,130,246,0.3)"
            }}>
              <Loader2 size={32} color="#fff" style={{ animation: "spin 2s linear infinite" }} />
            </div>

            <h2 style={{ fontSize: "1.2rem", fontWeight: 700, color: "#fff", marginBottom: "0.5rem" }}>
              Importando {searchUsername.startsWith('@') ? searchUsername : `@${searchUsername}`}
            </h2>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", marginBottom: "2rem" }}>
              Buscando todos os vídeos e posts...
            </p>

            <div style={{ width: "100%", marginBottom: "1.5rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem", fontSize: "0.85rem" }}>
                <span style={{ color: "var(--text-secondary)" }}>Buscando via API...</span>
                <span style={{ color: "#3b82f6", fontWeight: 600 }}>{Math.round(searchProgress)}%</span>
              </div>
              <div style={{ width: "100%", height: "6px", backgroundColor: "rgba(255,255,255,0.1)", borderRadius: "3px", overflow: "hidden" }}>
                <div style={{
                  width: `${searchProgress}%`, height: "100%",
                  backgroundColor: "#3b82f6", transition: "width 0.3s ease",
                }} />
              </div>
            </div>

            <p style={{ color: "var(--text-secondary)", fontSize: "0.8rem", opacity: 0.7, marginBottom: "1.5rem" }}>
              Isso pode levar alguns minutos
            </p>

            <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "1rem", textAlign: "left" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.8rem", color: "#fff" }}>
                <Loader2 size={18} color="#3b82f6" style={{ animation: "spin 2s linear infinite" }} />
                <span style={{ fontSize: "0.9rem" }}>Buscando posts via API</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.8rem", color: "var(--text-secondary)" }}>
                <div style={{ width: "18px", height: "18px", borderRadius: "50%", border: "2px solid rgba(255,255,255,0.2)" }} />
                <span style={{ fontSize: "0.9rem" }}>Salvando localmente</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {modelToDelete !== null && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)",
          display: "flex", justifyContent: "center", alignItems: "center",
          zIndex: 10000,
        }} onClick={() => setModelToDelete(null)}>
          <div className="glass-panel" style={{
            width: "350px", padding: "2rem", borderRadius: "16px",
            display: "flex", flexDirection: "column", alignItems: "center",
            textAlign: "center"
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{
              width: "56px", height: "56px", borderRadius: "50%",
              backgroundColor: "rgba(239,68,68,0.1)", display: "flex",
              justifyContent: "center", alignItems: "center", marginBottom: "1rem"
            }}>
              <Trash2 size={28} color="#ef4444" />
            </div>
            <h3 style={{ fontSize: "1.2rem", fontWeight: 600, marginBottom: "0.5rem" }}>
              Excluir Modelo
            </h3>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", marginBottom: "1.5rem" }}>
              Tem certeza que deseja remover esta modelo? Todos os vídeos importados sumirão da sua lista.
            </p>
            <div style={{ display: "flex", gap: "1rem", width: "100%" }}>
              <button
                onClick={() => setModelToDelete(null)}
                style={{
                  flex: 1, padding: "0.7rem", borderRadius: "8px",
                  background: "rgba(255,255,255,0.05)", color: "#fff",
                  border: "1px solid rgba(255,255,255,0.1)", cursor: "pointer",
                  fontWeight: 500, transition: "background 0.2s"
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.1)"}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.05)"}
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  handleRemoveModel(modelToDelete);
                  setModelToDelete(null);
                }}
                style={{
                  flex: 1, padding: "0.7rem", borderRadius: "8px",
                  background: "#ef4444", color: "#fff",
                  border: "none", cursor: "pointer",
                  fontWeight: 500, transition: "background 0.2s"
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#dc2626"}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "#ef4444"}
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
