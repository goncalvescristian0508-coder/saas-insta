"use client";

import { useState, useEffect, useCallback } from "react";
import { Copy, Search, Loader2, CheckCircle, XCircle, Users, Clock, CalendarClock, AlertCircle, FileText, RefreshCw, CheckCheck, AlertTriangle, Download, Trash2, Bookmark, BookmarkCheck } from "lucide-react";

interface Account { id: string; username: string; tokenExpired?: boolean; }

interface ProfilePreview {
  username: string;
  fullName: string;
  profilePicUrl: string;
  biography: string;
  totalReels: number;
  followersCount: number;
  avgLikes: number;
  avgViews: number;
  engagementRate: number;
  postsPerMonth: number;
  hourlyData: number[]; // 24 values, index = hour (UTC), value = avg engagement score
}

interface SavedProfile extends ProfilePreview {
  savedAt: string;
}

const STORAGE_KEY = "autopost_saved_profiles";

interface CloneJob {
  id: string;
  sourceUsername: string;
  profilePicUrl: string | null;
  accountUsernames: string[];
  totalReels: number;
  clonedBio: boolean;
  clonedPhoto: boolean;
  errorMsg?: string | null;
  createdAt: string;
  posts: { total: number; done: number; failed: number; pending: number };
}

interface CloneJobPost {
  id: string;
  accountUsername: string;
  caption: string;
  scheduledAt: string;
  status: "PENDING" | "RUNNING" | "DONE" | "FAILED";
  errorMsg: string | null;
  postedAt: string | null;
  videoPublicUrl: string | null;
  coverUrl: string | null;
}

interface CloneJobDetail {
  id: string;
  sourceUsername: string;
  profilePicUrl: string | null;
  accountUsernames: string[];
  totalReels: number;
  createdAt: string;
  posts: CloneJobPost[];
}

export default function ClonarPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccounts, setSelectedAccounts] = useState<Record<string, boolean>>({});
  const [username, setUsername] = useState("");
  const [profile, setProfile] = useState<ProfilePreview | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [intervalMinutes, setIntervalMinutes] = useState(5);
  const [postsPerDay, setPostsPerDay] = useState<number | null>(null);
  const [postLimit, setPostLimit] = useState<number | "all">(20);
  const [cloneBio, setCloneBio] = useState(true);
  const [cloneStories, setCloneStories] = useState(false);
  const [cloneHighlights, setCloneHighlights] = useState(false);
  const [autoCaptions, setAutoCaptions] = useState(false);
  const [captionTheme, setCaptionTheme] = useState<"mundo" | "tops" | "complexas">("mundo");
  const [alternateSequence, setAlternateSequence] = useState(false);
  const [groupSize, setGroupSize] = useState(5);
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [cloning, setCloning] = useState(false);
  const [cloningStep, setCloningStep] = useState("");
  const [result, setResult] = useState<{ created: number; reels: number; lastPost: string; storiesSaved?: number; highlightsSaved?: number } | null>(null);
  const [processingJobId, setProcessingJobId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [jobs, setJobs] = useState<CloneJob[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [detail, setDetail] = useState<CloneJobDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [retryingPostId, setRetryingPostId] = useState<string | null>(null);
  const [retryingAll, setRetryingAll] = useState(false);
  const [detailPage, setDetailPage] = useState(0);
  const [savedProfiles, setSavedProfiles] = useState<SavedProfile[]>([]);
  const [justSaved, setJustSaved] = useState(false);

  function getDefaultDateTime() {
    const d = new Date(Date.now() + 10 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    return {
      date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
    };
  }

  const retryPost = async (postId: string) => {
    setRetryingPostId(postId);
    await fetch(`/api/schedule/${postId}`, { method: "POST" });
    setDetail((d) => d ? { ...d, posts: d.posts.map((p) => p.id === postId ? { ...p, status: "PENDING", errorMsg: null } : p) } : d);
    setRetryingPostId(null);
  };

  const retryAllFailedInDetail = async () => {
    if (!detail) return;
    setRetryingAll(true);
    const failed = detail.posts.filter((p) => p.status === "FAILED");
    await Promise.all(failed.map((p) => fetch(`/api/schedule/${p.id}`, { method: "POST" })));
    setDetail((d) => d ? { ...d, posts: d.posts.map((p) => p.status === "FAILED" ? { ...p, status: "PENDING", errorMsg: null } : p) } : d);
    setRetryingAll(false);
  };

  const openDetail = async (jobId: string) => {
    setLoadingDetail(true);
    setDetail(null);
    setDetailPage(0);
    try {
      const res = await fetch(`/api/clone/history/${jobId}`);
      const data = await res.json();
      if (res.ok) setDetail(data.job);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleCancelJob = async (e: React.MouseEvent, jobId: string) => {
    e.stopPropagation();
    if (!confirm("Cancelar posts pendentes deste clone? O histórico de publicados será mantido.")) return;
    await fetch(`/api/clone/history/${jobId}?cancelOnly=true`, { method: "DELETE" });
    setJobs((prev) => prev.map((j) => j.id !== jobId ? j : { ...j, posts: { ...j.posts, pending: 0, failed: 0 } }));
  };

  const handleRemoveJob = async (e: React.MouseEvent, jobId: string) => {
    e.stopPropagation();
    if (!confirm("Remover este clone do histórico?")) return;
    await fetch(`/api/clone/history/${jobId}`, { method: "DELETE" });
    setJobs((prev) => prev.filter((j) => j.id !== jobId));
  };

  const handleCancelAll = async () => {
    if (!confirm("Cancelar todos os posts pendentes de todos os clones? O histórico de publicados será mantido.")) return;
    await fetch("/api/clone/history", { method: "DELETE" });
    setJobs((prev) => prev.map((j) => ({ ...j, posts: { ...j.posts, pending: 0, failed: 0 } })));
  };

  const loadJobs = useCallback(async () => {
    setLoadingJobs(true);
    try {
      const res = await fetch("/api/clone/history");
      const data = await res.json();
      if (res.ok) setJobs(data.jobs ?? []);
    } finally {
      setLoadingJobs(false);
    }
  }, []);

  // Auto-refresh every 30s while any job has pending posts (and not already polling processingJobId)
  useEffect(() => {
    if (processingJobId) return; // the other effect handles this case
    const hasPending = jobs.some((j) => j.posts.pending > 0);
    if (!hasPending) return;
    const iv = setInterval(async () => {
      const res = await fetch("/api/clone/history");
      const data = await res.json();
      if (res.ok) setJobs(data.jobs ?? []);
    }, 30_000);
    return () => clearInterval(iv);
  }, [jobs, processingJobId]);

  // Poll while a clone job is being processed in the background
  useEffect(() => {
    if (!processingJobId) return;
    const poll = async () => {
      const res = await fetch("/api/clone/history");
      const data = await res.json();
      const list: CloneJob[] = data.jobs ?? [];
      setJobs(list);
      const job = list.find((j) => j.id === processingJobId);
      if (!job) {
        setError("Erro ao buscar postagens do perfil. Tente novamente.");
        setProcessingJobId(null);
      } else if (job.totalReels === -1) {
        // Processing failed — show specific error from server
        setError(job.errorMsg || "Erro ao buscar postagens do perfil. Tente novamente.");
        setProcessingJobId(null);
      } else if (job.totalReels > 0) {
        // Apify done — check if any posts were created
        if (job.posts.total > 0) {
          setResult({ created: job.posts.total, reels: job.totalReels, lastPost: "" });
        } else {
          setError("Todos os reels já foram agendados anteriormente para estas contas (nenhum duplicado criado).");
        }
        setProcessingJobId(null);
      }
    };
    const iv = setInterval(() => { void poll(); }, 5000);
    return () => clearInterval(iv);
  }, [processingJobId]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setSavedProfiles(JSON.parse(raw) as SavedProfile[]);
    } catch {}
  }, []);

  const saveProfile = () => {
    if (!profile) return;
    const entry: SavedProfile = { ...profile, savedAt: new Date().toISOString() };
    const updated = [entry, ...savedProfiles.filter(p => p.username !== profile.username)];
    setSavedProfiles(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2000);
  };

  const removeSavedProfile = (username: string) => {
    const updated = savedProfiles.filter(p => p.username !== username);
    setSavedProfiles(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  };

  const loadSavedProfile = (saved: SavedProfile) => {
    setUsername(saved.username);
    setProfile(saved);
    setSearchError("");
    setResult(null);
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  useEffect(() => {
    const { date, time } = getDefaultDateTime();
    setStartDate(date);
    setStartTime(time);
    fetch("/api/private-ig/accounts")
      .then((r) => r.json())
      .then((data) => {
        const oauth = (data.accounts ?? []).filter((a: Account & { source?: string; tokenExpired?: boolean; accountStatus?: string }) => a.source === "oauth" && !a.tokenExpired && a.accountStatus !== "SUSPENDED" && a.accountStatus !== "QUARANTINE");
        setAccounts(oauth);
        const sel: Record<string, boolean> = {};
        oauth.forEach((a: Account) => { sel[a.id] = true; });
        setSelectedAccounts(sel);
      });
    loadJobs();
  }, [loadJobs]);

  function processSearchData(data: { profile: { username: string; fullName: string; profilePicUrl: string; biography?: string; followersCount: number }; videos: { likes: number; views: number; comments: number; timestamp: string }[]; totalVideos: number }) {
    const videos = (data.videos ?? []) as { likes: number; views: number; comments: number; timestamp: string }[];
    const followers = data.profile.followersCount ?? 0;
    const avgLikes = videos.length ? Math.round(videos.reduce((s, v) => s + v.likes, 0) / videos.length) : 0;
    const avgViews = videos.length ? Math.round(videos.reduce((s, v) => s + v.views, 0) / videos.length) : 0;
    const avgComments = videos.length ? videos.reduce((s, v) => s + v.comments, 0) / videos.length : 0;
    const engagementRate = followers > 0 ? Math.round(((avgLikes + avgComments) / followers) * 1000) / 10 : 0;
    const postsPerMonth = (() => {
      const dated = videos.filter(v => v.timestamp).map(v => new Date(v.timestamp).getTime()).sort((a, b) => b - a);
      if (dated.length < 2) return videos.length;
      const spanDays = (dated[0] - dated[dated.length - 1]) / (1000 * 60 * 60 * 24);
      return Math.round((videos.length / Math.max(spanDays, 1)) * 30);
    })();
    const hourBuckets = Array.from({ length: 24 }, () => ({ total: 0, count: 0 }));
    videos.filter(v => v.timestamp).forEach(v => {
      const h = new Date(v.timestamp).getUTCHours();
      hourBuckets[h].total += v.likes + v.comments;
      hourBuckets[h].count++;
    });
    const hourlyData = hourBuckets.map(b => b.count > 0 ? Math.round(b.total / b.count) : 0);
    setProfile({
      username: data.profile.username,
      fullName: data.profile.fullName,
      profilePicUrl: data.profile.profilePicUrl,
      biography: data.profile.biography ?? "",
      totalReels: data.totalVideos,
      followersCount: followers,
      avgLikes,
      avgViews,
      engagementRate,
      postsPerMonth,
      hourlyData,
    });
  }

  const handleSearch = useCallback(async () => {
    if (!username.trim()) return;
    setSearching(true);
    setSearchError("");
    setProfile(null);
    setResult(null);
    setError("");
    try {
      const res = await fetch("/api/instagram/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      const data = await res.json();
      if (!res.ok) { setSearchError(data.error || "Erro ao buscar perfil"); return; }

      // Apify assíncrono: faz polling até ter resultado (spinner continua visível)
      if (data.pending && data.profileRunId && data.reelRunId) {
        const { profileRunId, reelRunId } = data as { profileRunId: string; reelRunId: string; username: string };
        const cleanUsername = (data.username as string) || username.replace("@", "").trim();
        let attempts = 0;
        const maxAttempts = 36; // 36 × 5s = 3 min max
        while (attempts < maxAttempts) {
          await new Promise(r => setTimeout(r, 5000));
          attempts++;
          const statusRes = await fetch(
            `/api/instagram/scrape/status?profileRunId=${encodeURIComponent(profileRunId)}&reelRunId=${encodeURIComponent(reelRunId)}&username=${encodeURIComponent(cleanUsername)}`,
          );
          const statusData = await statusRes.json();
          if (!statusRes.ok) { setSearchError(statusData.error || "Erro ao buscar resultados"); return; }
          if (!statusData.pending) { processSearchData(statusData); return; }
        }
        setSearchError("Apify demorou muito para responder. Tente novamente.");
        return;
      }

      processSearchData(data);
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : "Erro de conexão");
    } finally {
      setSearching(false);
    }
  }, [username]);

  const handleClone = async () => {
    const accountIds = Object.entries(selectedAccounts).filter(([, v]) => v).map(([k]) => k);
    if (!profile || accountIds.length === 0 || !startDate || !startTime) {
      setError("Selecione ao menos uma conta e preencha a data de início.");
      return;
    }
    setCloning(true);
    setCloningStep("Iniciando clone...");
    setError("");
    setResult(null);
    setProcessingJobId(null);
    try {
      const startAt = new Date(`${startDate}T${startTime}`).toISOString();
      const globalCoverUrl = localStorage.getItem("library_global_cover") || null;
      const res = await fetch("/api/clone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: profile.username,
          accountIds,
          intervalMinutes,
          postLimit: postLimit === "all" ? null : postLimit,
          cloneBio,
          cloneStories,
          cloneHighlights,
          startAt,
          alternateSequence,
          groupSize,
          globalCoverUrl,
          autoCaptions,
          captionTheme,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Erro ao clonar"); return; }
      // Server responds immediately — processing happens in background
      setProcessingJobId(data.cloneJobId);
      await loadJobs();
    } catch {
      setError("Erro de conexão");
    } finally {
      setCloning(false);
      setCloningStep("");
    }
  };

  const selectedCount = Object.values(selectedAccounts).filter(Boolean).length;
  const effectiveLimit = postLimit === "all" ? (profile?.totalReels ?? 0) : Math.min(postLimit, profile?.totalReels ?? 0);
  const estimatedHours = effectiveLimit > 1 ? ((effectiveLimit - 1) * intervalMinutes / 60).toFixed(1) : "0";

  const statusConfig = {
    PENDING: { label: "Aguardando", color: "#c9a227", bg: "rgba(201,162,39,0.1)" },
    RUNNING: { label: "Postando...", color: "#60a5fa", bg: "rgba(96,165,250,0.1)" },
    DONE: { label: "Publicado", color: "#4ade80", bg: "rgba(74,222,128,0.1)" },
    FAILED: { label: "Falhou", color: "#f87171", bg: "rgba(248,113,113,0.1)" },
  };

  return (
    <div>
      {/* Detail modal */}
      {(detail || loadingDetail) && (
        <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }} onClick={() => setDetail(null)}>
          <div className="glass-panel" style={{ width: "100%", maxWidth: "680px", maxHeight: "80vh", borderRadius: "16px", overflow: "hidden", display: "flex", flexDirection: "column" }} onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div style={{ padding: "1.25rem 1.5rem", borderBottom: "1px solid rgba(255,255,255,0.07)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                {detail?.profilePicUrl ? (
                  <img src={`/api/media/proxy?url=${encodeURIComponent(detail.profilePicUrl)}`} alt={detail.sourceUsername} style={{ width: "36px", height: "36px", borderRadius: "50%", objectFit: "cover" }} />
                ) : null}
                <div>
                  <p style={{ fontWeight: 700 }}>@{detail?.sourceUsername ?? "..."}</p>
                  <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{detail?.posts.length ?? 0} posts agendados</p>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                {detail?.posts.some((p) => p.status === "FAILED") && (
                  <button onClick={() => void retryAllFailedInDetail()} disabled={retryingAll} style={{ display: "flex", alignItems: "center", gap: "0.3rem", padding: "0.35rem 0.75rem", borderRadius: "7px", border: "1px solid rgba(96,165,250,0.25)", background: "rgba(96,165,250,0.08)", color: "#60a5fa", fontSize: "0.75rem", cursor: "pointer", fontWeight: 600 }}>
                    {retryingAll ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> : <RefreshCw size={12} />} Retentar falhos
                  </button>
                )}
                <button onClick={() => setDetail(null)} style={{ background: "transparent", border: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: "1.2rem", lineHeight: 1 }}>✕</button>
              </div>
            </div>
            {/* List — paginated (50/page) to avoid rendering hundreds of DOM nodes at once */}
            <div style={{ overflowY: "auto", padding: "1rem 1.5rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {loadingDetail ? (
                <div style={{ textAlign: "center", padding: "2rem" }}><Loader2 size={24} style={{ animation: "spin 1s linear infinite" }} /></div>
              ) : (() => {
                const PAGE_SIZE = 50;
                const allPosts = detail?.posts ?? [];
                const visiblePosts = allPosts.slice(0, (detailPage + 1) * PAGE_SIZE);
                const hasMore = visiblePosts.length < allPosts.length;
                return (
                  <>
                    {visiblePosts.map((p) => {
                      const cfg = statusConfig[p.status];
                      return (
                        <div key={p.id} style={{ padding: "0.75rem 1rem", borderRadius: "10px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "flex-start", gap: "0.75rem" }}>
                          {/* Use cover image (static) when available — never load video in a list */}
                          <div style={{ width: "44px", height: "44px", borderRadius: "6px", background: "#0a0c14", overflow: "hidden", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            {p.coverUrl
                              ? <img src={p.coverUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                              : <Copy size={16} color="rgba(255,255,255,0.15)" />}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
                              <span style={{ fontSize: "0.8rem", fontWeight: 600 }}>@{p.accountUsername}</span>
                              <span style={{ padding: "2px 7px", borderRadius: "5px", fontSize: "0.7rem", fontWeight: 600, color: cfg.color, background: cfg.bg }}>{cfg.label}</span>
                            </div>
                            <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.caption || "(sem legenda)"}</p>
                            {p.errorMsg && <p style={{ fontSize: "0.72rem", color: "#f87171", marginTop: "0.2rem" }}>{p.errorMsg}</p>}
                          </div>
                          <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", flexShrink: 0, textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.35rem" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                              <Clock size={11} />
                              {p.status === "DONE" && p.postedAt
                                ? new Date(p.postedAt).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
                                : new Date(p.scheduledAt).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                            </div>
                            {p.status === "FAILED" && (
                              <button onClick={() => void retryPost(p.id)} disabled={retryingPostId === p.id} style={{ display: "flex", alignItems: "center", gap: "0.25rem", padding: "2px 7px", borderRadius: "5px", border: "1px solid rgba(96,165,250,0.2)", background: "rgba(96,165,250,0.07)", color: "#60a5fa", fontSize: "0.7rem", cursor: "pointer" }}>
                                {retryingPostId === p.id ? <Loader2 size={10} style={{ animation: "spin 1s linear infinite" }} /> : <RefreshCw size={10} />} Retentar
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {hasMore && (
                      <button onClick={() => setDetailPage((p) => p + 1)} style={{ padding: "0.6rem", borderRadius: "8px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--text-secondary)", cursor: "pointer", fontSize: "0.8rem", fontWeight: 600 }}>
                        Ver mais ({allPosts.length - visiblePosts.length} restantes)
                      </button>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      <div style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.025em", color: "#ededed", margin: 0 }}>
          Clonar Perfil
        </h1>
        <p style={{ fontSize: 12, color: "#444", marginTop: 3 }}>
          Copie reels, bio e foto de qualquer perfil público para suas contas
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", alignItems: "start" }}>
        {/* Left */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {/* Search */}
          <div className="glass-panel" style={{ padding: "1.75rem", borderRadius: "14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "1.25rem" }}>
              <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Search size={16} color="#a78bfa" />
              </div>
              <h2 style={{ fontSize: "1rem", fontWeight: 700 }}>Perfil de Origem</h2>
            </div>
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <input className="input-field" placeholder="@username" value={username} onChange={(e) => setUsername(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !searching && handleSearch()} style={{ flex: 1 }} disabled={searching} />
              <button onClick={handleSearch} disabled={searching || !username.trim()} className="btn btn-primary" style={{ background: "linear-gradient(135deg,#7c3aed,#6d28d9)", border: "none", minWidth: "100px" }}>
                {searching ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : <><Search size={15} /> Buscar</>}
              </button>
            </div>
            {searchError && (
              <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem", alignItems: "center", color: "#f87171", fontSize: "0.85rem" }}>
                <AlertCircle size={15} /> {searchError}
              </div>
            )}
          </div>

          {/* Profile Preview */}
          {profile && (
            <div className="glass-panel" style={{ padding: "1.5rem", borderRadius: "14px", border: "1px solid rgba(139,92,246,0.2)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1rem" }}>
                {profile.profilePicUrl ? (
                  <img src={`/api/media/proxy?url=${encodeURIComponent(profile.profilePicUrl)}`} alt={profile.username} style={{ width: "56px", height: "56px", borderRadius: "50%", objectFit: "cover", border: "2px solid rgba(139,92,246,0.3)" }} />
                ) : (
                  <div style={{ width: "56px", height: "56px", borderRadius: "50%", background: "rgba(139,92,246,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.4rem", fontWeight: 700, color: "#a78bfa" }}>{profile.username[0].toUpperCase()}</div>
                )}
                <div>
                  <p style={{ fontWeight: 700, fontSize: "1rem" }}>@{profile.username}</p>
                  {profile.fullName && profile.fullName !== profile.username && <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>{profile.fullName}</p>}
                </div>
              </div>
              {profile.biography && (
                <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", lineHeight: 1.5, marginBottom: "0.75rem", padding: "0.6rem 0.8rem", background: "rgba(255,255,255,0.03)", borderRadius: "8px", borderLeft: "2px solid rgba(139,92,246,0.3)" }}>
                  {profile.biography}
                </p>
              )}
              {/* Stats grid */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.5rem", marginBottom: "0.75rem" }}>
                {[
                  { label: "Seguidores", value: profile.followersCount >= 1000 ? `${(profile.followersCount / 1000).toFixed(1)}K` : String(profile.followersCount), color: "#a78bfa" },
                  { label: "Reels", value: String(profile.totalReels), color: "#60a5fa" },
                  { label: "Posts/mês", value: String(profile.postsPerMonth), color: "#4ade80" },
                  { label: "Média views", value: profile.avgViews >= 1000 ? `${(profile.avgViews / 1000).toFixed(1)}K` : String(profile.avgViews), color: "#f59e0b" },
                  { label: "Média likes", value: profile.avgLikes >= 1000 ? `${(profile.avgLikes / 1000).toFixed(1)}K` : String(profile.avgLikes), color: "#f472b6" },
                  { label: "Engajamento", value: `${profile.engagementRate}%`, color: profile.engagementRate >= 3 ? "#4ade80" : profile.engagementRate >= 1 ? "#f59e0b" : "#f87171" },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ padding: "0.6rem 0.75rem", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "8px", textAlign: "center" }}>
                    <div style={{ fontWeight: 700, fontSize: "1rem", color }}>{value}</div>
                    <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "0.1rem" }}>{label}</div>
                  </div>
                ))}
              </div>

              {/* Best hours heatmap */}
              {profile.hourlyData.some(v => v > 0) && (() => {
                const maxScore = Math.max(...profile.hourlyData, 1);
                const top3 = [...profile.hourlyData.map((s, h) => ({ h, s }))]
                  .sort((a, b) => b.s - a.s)
                  .filter(x => x.s > 0)
                  .slice(0, 3)
                  .map(x => x.h);
                return (
                  <div style={{ marginBottom: "0.75rem", padding: "0.85rem", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "10px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.6rem" }}>
                      <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em" }}>Melhores horários para postar</span>
                      <span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>UTC</span>
                    </div>
                    {/* 24-cell heatmap grid */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: "3px", marginBottom: "0.55rem" }}>
                      {profile.hourlyData.map((score, h) => {
                        const intensity = score / maxScore;
                        const isTop = top3.includes(h);
                        return (
                          <div
                            key={h}
                            title={`${String(h).padStart(2, "0")}:00 — score: ${score}`}
                            style={{
                              height: "28px", borderRadius: "5px", display: "flex", alignItems: "center", justifyContent: "center",
                              fontSize: "0.6rem", fontWeight: isTop ? 800 : 500,
                              color: isTop ? "#000" : intensity > 0.3 ? "#fff" : "var(--text-muted)",
                              background: isTop
                                ? `rgba(201,162,39,${0.5 + intensity * 0.5})`
                                : score === 0
                                ? "rgba(255,255,255,0.04)"
                                : `rgba(139,92,246,${0.15 + intensity * 0.65})`,
                              border: isTop ? "1px solid rgba(201,162,39,0.6)" : "1px solid transparent",
                              transition: "all 0.15s",
                              cursor: "default",
                            }}
                          >
                            {String(h).padStart(2, "0")}
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                      {top3.map((h, i) => (
                        <span key={h} style={{ padding: "0.2rem 0.55rem", borderRadius: "5px", background: "rgba(201,162,39,0.12)", border: "1px solid rgba(201,162,39,0.25)", fontSize: "0.72rem", fontWeight: 700, color: "var(--accent-gold)" }}>
                          {["🥇", "🥈", "🥉"][i]} {String(h).padStart(2, "0")}:00
                        </span>
                      ))}
                      <span style={{ fontSize: "0.68rem", color: "var(--text-muted)", alignSelf: "center", marginLeft: "auto" }}>baseado em {profile.hourlyData.reduce((s, _, h) => s + (profile.hourlyData[h] > 0 ? 1 : 0), 0)} horas com dados</span>
                    </div>
                  </div>
                );
              })()}

              <div style={{ display: "flex", gap: "0.6rem" }}>
                <div style={{ flex: 1, padding: "0.65rem 0.9rem", background: "rgba(139,92,246,0.07)", border: "1px solid rgba(139,92,246,0.15)", borderRadius: "8px", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <Copy size={14} color="#a78bfa" />
                  <span style={{ fontWeight: 700, color: "#a78bfa" }}>{profile.totalReels}</span>
                  <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>reels disponíveis</span>
                </div>
                {profile.profilePicUrl && (
                  <a
                    href={`/api/media/proxy?url=${encodeURIComponent(profile.profilePicUrl)}&download=1`}
                    download={`${profile.username}_foto.jpg`}
                    style={{ display: "flex", alignItems: "center", gap: "0.4rem", padding: "0.65rem 0.9rem", background: "rgba(96,165,250,0.07)", border: "1px solid rgba(96,165,250,0.2)", borderRadius: "8px", color: "#60a5fa", fontSize: "0.8rem", textDecoration: "none", whiteSpace: "nowrap" }}
                  >
                    <Download size={13} /> Baixar foto
                  </a>
                )}
                <button
                  onClick={saveProfile}
                  style={{ display: "flex", alignItems: "center", gap: "0.4rem", padding: "0.65rem 0.9rem", background: justSaved ? "rgba(74,222,128,0.1)" : "rgba(201,162,39,0.07)", border: `1px solid ${justSaved ? "rgba(74,222,128,0.3)" : "rgba(201,162,39,0.2)"}`, borderRadius: "8px", color: justSaved ? "#4ade80" : "var(--accent-gold)", fontSize: "0.8rem", cursor: "pointer", whiteSpace: "nowrap", transition: "all 0.2s" }}
                >
                  {justSaved ? <><BookmarkCheck size={13} /> Salvo!</> : <><Bookmark size={13} /> Salvar</>}
                </button>
              </div>
            </div>
          )}

          {/* Saved Profiles */}
          <div className="glass-panel" style={{ padding: "1.25rem", borderRadius: "14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.85rem" }}>
              <BookmarkCheck size={15} color="var(--accent-gold)" />
              <span style={{ fontSize: "0.85rem", fontWeight: 700 }}>Perfis Salvos</span>
              {savedProfiles.length > 0 && <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginLeft: "auto" }}>{savedProfiles.length} salvo(s)</span>}
            </div>

            {savedProfiles.length === 0 ? (
              <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", textAlign: "center", padding: "0.75rem 0" }}>
                Busque um perfil e clique em <strong style={{ color: "var(--accent-gold)" }}>Salvar</strong> para guardar a análise aqui.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {savedProfiles.map((saved) => {
                  const top3 = [...(saved.hourlyData ?? []).map((s: number, h: number) => ({ h, s }))]
                    .sort((a, b) => b.s - a.s).filter(x => x.s > 0).slice(0, 3);
                  const isCurrentProfile = profile?.username === saved.username;
                  return (
                    <div
                      key={saved.username}
                      onClick={() => loadSavedProfile(saved)}
                      style={{ padding: "0.65rem 0.75rem", borderRadius: "9px", cursor: "pointer", background: isCurrentProfile ? "rgba(201,162,39,0.08)" : "rgba(255,255,255,0.03)", border: `1px solid ${isCurrentProfile ? "rgba(201,162,39,0.25)" : "rgba(255,255,255,0.06)"}`, display: "flex", alignItems: "center", gap: "0.6rem", transition: "all 0.15s" }}
                      onMouseEnter={(e) => { if (!isCurrentProfile) e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
                      onMouseLeave={(e) => { if (!isCurrentProfile) e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
                    >
                      {saved.profilePicUrl ? (
                        <img src={`/api/media/proxy?url=${encodeURIComponent(saved.profilePicUrl)}`} alt={saved.username} style={{ width: "32px", height: "32px", borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                      ) : (
                        <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "rgba(139,92,246,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.9rem", fontWeight: 700, color: "#a78bfa", flexShrink: 0 }}>{saved.username[0].toUpperCase()}</div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontWeight: 600, fontSize: "0.82rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>@{saved.username}</p>
                        <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.1rem" }}>
                          <span style={{ fontSize: "0.68rem", color: saved.engagementRate >= 3 ? "#4ade80" : saved.engagementRate >= 1 ? "#f59e0b" : "#f87171" }}>{saved.engagementRate}% eng.</span>
                          {top3[0] !== undefined && <span style={{ fontSize: "0.68rem", color: "var(--accent-gold)" }}>🥇{String(top3[0].h).padStart(2,"0")}h</span>}
                        </div>
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); removeSavedProfile(saved.username); }} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "0.2rem", flexShrink: 0 }} onMouseEnter={(e) => { e.currentTarget.style.color = "#f87171"; }} onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right — Config */}
        <div className="glass-panel" style={{ padding: "1.75rem", borderRadius: "14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "1.5rem" }}>
            <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "rgba(201,162,39,0.12)", border: "1px solid rgba(201,162,39,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <CalendarClock size={16} color="var(--accent-gold)" />
            </div>
            <h2 style={{ fontSize: "1rem", fontWeight: 700 }}>Configuração</h2>
          </div>

          {/* What to clone */}
          <div style={{ marginBottom: "1.25rem" }}>
            <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.6rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>O que clonar</label>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "0.6rem", padding: "0.5rem 0.7rem", borderRadius: "8px", cursor: "pointer", background: cloneBio ? "rgba(201,162,39,0.07)" : "rgba(255,255,255,0.02)", border: `1px solid ${cloneBio ? "rgba(201,162,39,0.2)" : "transparent"}` }}>
                <input type="checkbox" checked={cloneBio} onChange={() => setCloneBio(!cloneBio)} style={{ accentColor: "var(--accent-gold)" }} />
                <span style={{ color: "var(--text-secondary)" }}><FileText size={14} /></span>
                <span style={{ fontSize: "0.85rem" }}>Bio (descrição do perfil)</span>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "0.6rem", padding: "0.5rem 0.7rem", borderRadius: "8px", background: "rgba(201,162,39,0.07)", border: "1px solid rgba(201,162,39,0.2)" }}>
                <input type="checkbox" checked disabled style={{ accentColor: "var(--accent-gold)" }} />
                <span style={{ color: "var(--text-secondary)" }}><Copy size={14} /></span>
                <span style={{ fontSize: "0.85rem" }}>Reels (sempre)</span>
              </label>
            </div>
          </div>

          {/* Auto captions */}
          <div style={{ marginBottom: "1.25rem" }}>
            <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.6rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>Legendas automáticas</label>
            <label style={{ display: "flex", alignItems: "center", gap: "0.6rem", padding: "0.5rem 0.7rem", borderRadius: "8px", cursor: "pointer", background: autoCaptions ? "rgba(139,92,246,0.08)" : "rgba(255,255,255,0.02)", border: `1px solid ${autoCaptions ? "rgba(139,92,246,0.3)" : "transparent"}` }}>
              <input type="checkbox" checked={autoCaptions} onChange={() => setAutoCaptions(!autoCaptions)} style={{ accentColor: "#8b5cf6" }} />
              <span style={{ fontSize: "0.85rem" }}>Gerar legendas automáticas (curiosidades)</span>
            </label>
            {autoCaptions && (
              <div style={{ marginTop: "0.75rem", padding: "0.85rem", borderRadius: "8px", background: "rgba(139,92,246,0.05)", border: "1px solid rgba(139,92,246,0.18)", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", lineHeight: 1.5 }}>
                  Cada post receberá uma legenda diferente com curiosidades em português. As legendas originais dos reels serão substituídas.
                </p>
                <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                  {([
                    { v: "mundo", label: "🌍 Curiosidades do mundo" },
                    { v: "tops", label: "🏆 Curiosidades tops" },
                    { v: "complexas", label: "🔬 Fatos complexos" },
                  ] as { v: "mundo" | "tops" | "complexas"; label: string }[]).map(({ v, label }) => (
                    <button
                      key={v}
                      onClick={() => setCaptionTheme(v)}
                      style={{ padding: "0.35rem 0.85rem", borderRadius: "8px", border: `1px solid ${captionTheme === v ? "rgba(139,92,246,0.55)" : "rgba(255,255,255,0.1)"}`, background: captionTheme === v ? "rgba(139,92,246,0.2)" : "transparent", color: captionTheme === v ? "#a78bfa" : "var(--text-secondary)", fontWeight: captionTheme === v ? 700 : 400, fontSize: "0.8rem", cursor: "pointer" }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Alternate sequence */}
          <div style={{ marginBottom: "1.25rem" }}>
            <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.6rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>Sequência de vídeos</label>
            <label style={{ display: "flex", alignItems: "center", gap: "0.6rem", padding: "0.5rem 0.7rem", borderRadius: "8px", cursor: "pointer", background: alternateSequence ? "rgba(249,115,22,0.07)" : "rgba(255,255,255,0.02)", border: `1px solid ${alternateSequence ? "rgba(249,115,22,0.25)" : "transparent"}` }}>
              <input type="checkbox" checked={alternateSequence} onChange={() => setAlternateSequence(!alternateSequence)} style={{ accentColor: "#f97316" }} />
              <span style={{ fontSize: "0.85rem" }}>Alternar sequência por grupo de contas</span>
            </label>
            {alternateSequence && (
              <div style={{ marginTop: "0.75rem", padding: "0.75rem", borderRadius: "8px", background: "rgba(249,115,22,0.05)", border: "1px solid rgba(249,115,22,0.15)" }}>
                <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.5rem", lineHeight: 1.5 }}>
                  Cada grupo começa por um vídeo diferente — contas do mesmo grupo postam o mesmo vídeo, grupos diferentes postam vídeos diferentes ao mesmo tempo.
                </p>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>Contas por grupo:</span>
                  <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                    {[1, 2, 3, 5, 10].map((n) => (
                      <button key={n} onClick={() => setGroupSize(n)} style={{ padding: "0.3rem 0.7rem", borderRadius: "7px", border: `1px solid ${groupSize === n ? "rgba(249,115,22,0.5)" : "rgba(255,255,255,0.1)"}`, background: groupSize === n ? "rgba(249,115,22,0.15)" : "transparent", color: groupSize === n ? "#fb923c" : "var(--text-secondary)", fontWeight: groupSize === n ? 700 : 400, fontSize: "0.82rem", cursor: "pointer" }}>
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
                {selectedCount > 0 && (
                  <p style={{ fontSize: "0.72rem", color: "#fb923c", marginTop: "0.4rem" }}>
                    {selectedCount} contas → {Math.ceil(selectedCount / groupSize)} grupo(s) de {groupSize}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Post limit */}
          <div style={{ marginBottom: "1.25rem" }}>
            <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.5rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>Quantidade de posts</label>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              {([5, 10, 20, 50, 100, "all"] as (number | "all")[]).map((v) => (
                <button key={String(v)} onClick={() => setPostLimit(v)} style={{ padding: "0.4rem 0.9rem", borderRadius: "8px", border: `1px solid ${postLimit === v ? "rgba(139,92,246,0.4)" : "rgba(255,255,255,0.1)"}`, background: postLimit === v ? "rgba(139,92,246,0.12)" : "transparent", color: postLimit === v ? "#a78bfa" : "var(--text-secondary)", fontWeight: postLimit === v ? 700 : 400, fontSize: "0.82rem", cursor: "pointer" }}>
                  {v === "all" ? "Todos" : v}
                </button>
              ))}
            </div>
          </div>

          {/* Posts per day */}
          <div style={{ marginBottom: "1.25rem" }}>
            <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.5rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Posts por dia
            </label>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              {[1, 2, 3, 4, 6, 8, 12, 24, 36, 48, 72].map((ppd) => {
                const mins = Math.round((24 * 60) / ppd);
                return (
                  <button key={ppd} onClick={() => { setPostsPerDay(ppd); setIntervalMinutes(mins); }} style={{ padding: "0.4rem 0.9rem", borderRadius: "8px", border: `1px solid ${postsPerDay === ppd ? "rgba(74,222,128,0.4)" : "rgba(255,255,255,0.1)"}`, background: postsPerDay === ppd ? "rgba(74,222,128,0.1)" : "transparent", color: postsPerDay === ppd ? "#4ade80" : "var(--text-secondary)", fontWeight: postsPerDay === ppd ? 700 : 400, fontSize: "0.82rem", cursor: "pointer" }}>
                    {ppd}x
                  </button>
                );
              })}
            </div>
            {postsPerDay && (
              <p style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "0.35rem" }}>
                → intervalo de {intervalMinutes >= 60 ? `${Math.round(intervalMinutes / 60)}h` : `${intervalMinutes}min`} entre posts
              </p>
            )}
          </div>

          {/* Start */}
          <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1.25rem" }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.4rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>Data início</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="input-field" style={{ width: "100%" }} min={new Date().toISOString().split("T")[0]} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.4rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>Hora</label>
              <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="input-field" style={{ width: "100%" }} />
            </div>
          </div>

          {/* Accounts */}
          <div style={{ marginBottom: "1.25rem" }}>
            <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.6rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              <Users size={12} style={{ display: "inline", marginRight: "0.3rem" }} />Contas destino ({selectedCount} selecionada(s))
            </label>
            {accounts.length === 0 ? (
              <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", fontStyle: "italic" }}>Conecte contas OAuth em Contas.</p>
            ) : (() => {
              // Compute which account usernames have pending posts in existing clone jobs
              const withPending = new Set<string>();
              jobs.forEach((j) => { if (j.posts.pending > 0) j.accountUsernames.forEach((u) => withPending.add(u)); });
              const pendingAccounts = accounts.filter((a) => withPending.has(a.username));
              const freeAccounts = accounts.filter((a) => !withPending.has(a.username));
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.4rem 0.6rem", borderRadius: "6px", background: "rgba(201,162,39,0.05)", cursor: "pointer", fontSize: "0.78rem", color: "var(--text-muted)", fontWeight: 600 }}>
                    <input type="checkbox" checked={accounts.every((a) => selectedAccounts[a.id])} onChange={(e) => { const s: Record<string, boolean> = {}; accounts.forEach((a) => { s[a.id] = e.target.checked; }); setSelectedAccounts(s); }} style={{ accentColor: "var(--accent-gold)" }} />
                    Selecionar todas
                  </label>

                  {/* Accounts WITH pending clone posts */}
                  {pendingAccounts.length > 0 && (
                    <>
                      <p style={{ fontSize: "0.68rem", fontWeight: 700, color: "#f97316", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: "0.25rem", marginBottom: "0.15rem", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                        <CalendarClock size={11} /> Com posts agendados ({pendingAccounts.length})
                      </p>
                      {pendingAccounts.map((a) => {
                        const pendingCount = jobs.filter((j) => j.posts.pending > 0 && j.accountUsernames.includes(a.username)).reduce((sum, j) => sum + j.posts.pending, 0);
                        return (
                          <label key={a.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.5rem 0.6rem", borderRadius: "6px", cursor: "pointer", background: selectedAccounts[a.id] ? "rgba(249,115,22,0.08)" : "rgba(255,255,255,0.02)", border: `1px solid ${selectedAccounts[a.id] ? "rgba(249,115,22,0.25)" : "rgba(249,115,22,0.1)"}` }}>
                            <input type="checkbox" checked={Boolean(selectedAccounts[a.id])} onChange={() => setSelectedAccounts((s) => ({ ...s, [a.id]: !s[a.id] }))} style={{ accentColor: "#f97316" }} />
                            <span style={{ fontSize: "0.85rem", flex: 1 }}>@{a.username}</span>
                            <span style={{ fontSize: "0.68rem", color: "#f97316", background: "rgba(249,115,22,0.12)", padding: "1px 6px", borderRadius: "4px", fontWeight: 700 }}>{pendingCount} pendente{pendingCount !== 1 ? "s" : ""}</span>
                          </label>
                        );
                      })}
                      {freeAccounts.length > 0 && (
                        <p style={{ fontSize: "0.68rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: "0.4rem", marginBottom: "0.15rem" }}>
                          Livres ({freeAccounts.length})
                        </p>
                      )}
                    </>
                  )}

                  {/* Accounts WITHOUT pending posts */}
                  {freeAccounts.map((a) => (
                    <label key={a.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.5rem 0.6rem", borderRadius: "6px", cursor: "pointer", background: selectedAccounts[a.id] ? "rgba(201,162,39,0.07)" : "rgba(255,255,255,0.02)", border: `1px solid ${selectedAccounts[a.id] ? "rgba(201,162,39,0.2)" : "transparent"}` }}>
                      <input type="checkbox" checked={Boolean(selectedAccounts[a.id])} onChange={() => setSelectedAccounts((s) => ({ ...s, [a.id]: !s[a.id] }))} style={{ accentColor: "var(--accent-gold)" }} />
                      <span style={{ fontSize: "0.85rem" }}>@{a.username}</span>
                    </label>
                  ))}
                </div>
              );
            })()}
          </div>

          {/* Estimate */}
          {profile && effectiveLimit > 0 && (
            <div style={{ padding: "0.75rem 1rem", background: "rgba(96,165,250,0.06)", border: "1px solid rgba(96,165,250,0.12)", borderRadius: "10px", fontSize: "0.82rem", color: "var(--text-secondary)", marginBottom: "1.25rem" }}>
              {effectiveLimit} reels × {selectedCount} conta(s) = <strong style={{ color: "#fff" }}>{effectiveLimit * selectedCount} posts</strong> ao longo de <strong style={{ color: "#60a5fa" }}>~{estimatedHours}h</strong>
            </div>
          )}

          {error && <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", color: "#f87171", fontSize: "0.85rem", marginBottom: "1rem" }}><XCircle size={15} /> {error}</div>}

          {processingJobId && !result && (
            <div style={{ padding: "0.85rem 1rem", background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.2)", borderRadius: "10px", marginBottom: "1rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                <Loader2 size={16} color="#60a5fa" style={{ animation: "spin 1s linear infinite" }} />
                <span style={{ fontSize: "0.875rem", color: "#60a5fa", fontWeight: 600 }}>Buscando reels... Os posts aparecerão em breve.</span>
              </div>
            </div>
          )}

          {result && (
            <div style={{ padding: "0.85rem 1rem", background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.2)", borderRadius: "10px", marginBottom: "1rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: result.lastPost ? "0.4rem" : 0 }}>
                <CheckCircle size={16} color="#4ade80" />
                <span style={{ fontSize: "0.875rem", color: "#4ade80", fontWeight: 600 }}>{result.created} posts agendados!</span>
              </div>
              {result.lastPost && (
                <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginLeft: "1.6rem" }}>
                  Último post em {new Date(result.lastPost).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  {!!result.storiesSaved && ` · ${result.storiesSaved} stories salvos`}
                  {!!result.highlightsSaved && ` · ${result.highlightsSaved} destaques salvos`}
                </p>
              )}
            </div>
          )}

          <button onClick={handleClone} disabled={cloning || !!processingJobId || !profile || selectedCount === 0} className="btn btn-primary" style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", opacity: (!profile || selectedCount === 0) ? 0.5 : 1 }}>
            {cloning ? <><Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> Iniciando...</> : processingJobId ? <><Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> Processando...</> : <><Copy size={16} /> Clonar Perfil</>}
          </button>
        </div>
      </div>

      {/* Clone History */}
      <div style={{ marginTop: "2.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem" }}>
          <h2 style={{ fontSize: "1.1rem", fontWeight: 700 }}>Histórico de Clones</h2>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            {jobs.some((j) => j.posts.pending > 0) && (
              <button onClick={() => void handleCancelAll()} style={{ display: "flex", alignItems: "center", gap: "0.35rem", padding: "0.4rem 0.8rem", borderRadius: "8px", border: "1px solid rgba(239,68,68,0.25)", background: "rgba(239,68,68,0.07)", color: "#f87171", fontSize: "0.8rem", cursor: "pointer", fontWeight: 600 }}>
                <XCircle size={13} /> Cancelar todas
              </button>
            )}
            <button onClick={loadJobs} disabled={loadingJobs} style={{ display: "flex", alignItems: "center", gap: "0.4rem", padding: "0.4rem 0.8rem", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "var(--text-secondary)", fontSize: "0.8rem", cursor: "pointer" }}>
              <RefreshCw size={13} style={loadingJobs ? { animation: "spin 1s linear infinite" } : {}} /> Atualizar
            </button>
          </div>
        </div>

        {loadingJobs && jobs.length === 0 ? (
          <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-secondary)" }}><Loader2 size={20} style={{ animation: "spin 1s linear infinite" }} /></div>
        ) : jobs.length === 0 ? (
          <div className="glass-panel" style={{ padding: "2rem", borderRadius: "14px", textAlign: "center", color: "var(--text-secondary)", fontSize: "0.9rem" }}>
            Nenhum perfil clonado ainda. Clone seu primeiro perfil acima!
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
            {jobs.map((job) => {
              const isFailed = job.totalReels === -1;
              const isProcessing = !isFailed && job.totalReels === 0 && job.posts.total === 0;
              const pct = job.posts.total > 0 ? Math.round((job.posts.done / job.posts.total) * 100) : 0;
              const allDone = job.posts.pending === 0 && job.posts.failed === 0 && job.posts.done > 0;
              const hasFailed = job.posts.failed > 0;
              return (
                <div key={job.id} className="glass-panel" onClick={() => void openDetail(job.id)} style={{ padding: "1.25rem 1.5rem", borderRadius: "14px", display: "flex", alignItems: "center", gap: "1.25rem", cursor: "pointer", transition: "border-color 0.15s" }} onMouseEnter={(e) => (e.currentTarget.style.borderColor = "rgba(139,92,246,0.3)")} onMouseLeave={(e) => (e.currentTarget.style.borderColor = "")}>
                  {/* Avatar */}
                  {job.profilePicUrl ? (
                    <img src={`/api/media/proxy?url=${encodeURIComponent(job.profilePicUrl)}`} alt={job.sourceUsername} style={{ width: "48px", height: "48px", borderRadius: "50%", objectFit: "cover", border: "2px solid rgba(139,92,246,0.3)", flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: "48px", height: "48px", borderRadius: "50%", background: "rgba(139,92,246,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.2rem", fontWeight: 700, color: "#a78bfa", flexShrink: 0 }}>{job.sourceUsername[0].toUpperCase()}</div>
                  )}

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.3rem" }}>
                      <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>@{job.sourceUsername}</span>
                      {job.clonedBio && <span style={{ fontSize: "0.7rem", padding: "0.15rem 0.45rem", borderRadius: "4px", background: "rgba(255,255,255,0.06)", color: "var(--text-secondary)" }}>Bio</span>}
                      {job.clonedPhoto && <span style={{ fontSize: "0.7rem", padding: "0.15rem 0.45rem", borderRadius: "4px", background: "rgba(255,255,255,0.06)", color: "var(--text-secondary)" }}>Foto</span>}
                    </div>
                    <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginBottom: "0.6rem" }}>
                      {job.posts.total} posts · {job.accountUsernames.map(u => `@${u}`).join(", ")} · {new Date(job.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </div>

                    {/* Progress bar */}
                    <div style={{ height: "4px", borderRadius: "2px", background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${pct}%`, borderRadius: "2px", background: hasFailed ? "linear-gradient(90deg,#4ade80,#f87171)" : "linear-gradient(90deg,#4ade80,#22d3ee)", transition: "width 0.3s" }} />
                    </div>
                  </div>

                  {/* Stats */}
                  <div style={{ display: "flex", gap: "1rem", flexShrink: 0 }}>
                    {isFailed && (
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.25rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", color: "#f87171", fontSize: "0.82rem", fontWeight: 600 }}>
                          <XCircle size={14} /> Falhou
                        </div>
                        {job.errorMsg && (
                          <span style={{ fontSize: "0.7rem", color: "#f87171", opacity: 0.8, maxWidth: "220px", textAlign: "right", lineHeight: 1.3 }}>{job.errorMsg}</span>
                        )}
                      </div>
                    )}
                    {isProcessing && (
                      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", color: "#60a5fa", fontSize: "0.82rem", fontWeight: 600 }}>
                        <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Buscando reels...
                      </div>
                    )}
                    {!isProcessing && <>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", color: "#4ade80", fontWeight: 700, fontSize: "0.95rem" }}>
                          <CheckCheck size={14} /> {job.posts.done}
                        </div>
                        <div style={{ fontSize: "0.68rem", color: "var(--text-secondary)" }}>publicados</div>
                      </div>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", color: "#60a5fa", fontWeight: 700, fontSize: "0.95rem" }}>
                          <Clock size={14} /> {job.posts.pending}
                        </div>
                        <div style={{ fontSize: "0.68rem", color: "var(--text-secondary)" }}>pendentes</div>
                      </div>
                    </>}
                    {!isProcessing && job.posts.failed > 0 && (
                      <div style={{ textAlign: "center" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", color: "#f87171", fontWeight: 700, fontSize: "0.95rem" }}>
                          <AlertTriangle size={14} /> {job.posts.failed}
                        </div>
                        <div style={{ fontSize: "0.68rem", color: "var(--text-secondary)" }}>falhos</div>
                      </div>
                    )}
                    {allDone && (
                      <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", color: "#4ade80", fontSize: "0.82rem", fontWeight: 600 }}>
                        <CheckCircle size={15} /> Concluído
                      </div>
                    )}
                    {job.posts.pending > 0 && (
                      <button type="button" onClick={(e) => void handleCancelJob(e, job.id)} title="Cancelar posts pendentes"
                        style={{ display: "flex", alignItems: "center", gap: "0.3rem", padding: "0.3rem 0.6rem", borderRadius: "7px", border: "1px solid rgba(239,68,68,0.25)", background: "rgba(239,68,68,0.07)", color: "#f87171", fontSize: "0.72rem", fontWeight: 600, cursor: "pointer" }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.14)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.07)"; }}
                      >
                        <XCircle size={12} /> Cancelar
                      </button>
                    )}
                    {job.posts.pending === 0 && (
                      <button type="button" onClick={(e) => void handleRemoveJob(e, job.id)} title="Remover do histórico"
                        style={{ display: "flex", alignItems: "center", gap: "0.3rem", padding: "0.3rem 0.6rem", borderRadius: "7px", border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "var(--text-muted)", fontSize: "0.72rem", cursor: "pointer" }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = "#f87171"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
                      >
                        <Trash2 size={12} /> Remover
                      </button>
                    )}
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
