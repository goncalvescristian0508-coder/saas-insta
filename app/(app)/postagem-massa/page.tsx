"use client";

import { useCallback, useEffect, useState } from "react";
import { Send, Loader2, CheckCircle2, XCircle, Film, UploadCloud, AlertCircle } from "lucide-react";
import Link from "next/link";

type AccountRow = { id: string; username: string; source?: "oauth" | "private" };
type VideoRow = { id: string; originalName: string; publicUrl: string; sizeBytes: number };
type StatusRow = { accountId: string; username: string; success?: boolean; error?: string; pending?: boolean };

function formatBytes(b: number) {
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

export default function BulkPostPage() {
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [videos, setVideos] = useState<VideoRow[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [selectedVideo, setSelectedVideo] = useState<string>("");
  const [caption, setCaption] = useState("");
  const [posting, setPosting] = useState(false);
  const [statuses, setStatuses] = useState<StatusRow[]>([]);
  const [loadErr, setLoadErr] = useState("");

  const load = useCallback(async () => {
    try {
      const [accRes, vidRes] = await Promise.all([
        fetch("/api/private-ig/accounts"),
        fetch("/api/media/upload"),
      ]);
      const [accData, vidData] = await Promise.all([accRes.json(), vidRes.json()]);
      const list = (accData.accounts ?? []) as AccountRow[];
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

    setPosting(true);
    setStatuses(ids.map((id) => ({
      accountId: id,
      username: accounts.find((a) => a.id === id)?.username ?? id,
      pending: true,
    })));

    const fd = new FormData();
    fd.append("videoId", selectedVideo);
    fd.append("caption", caption);
    fd.append("accountIds", JSON.stringify(ids));

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
            setStatuses((prev) => prev.map((row) =>
              row.accountId === evt.accountId
                ? { ...row, username: evt.username || row.username, pending: false, success: evt.success, error: evt.error }
                : row,
            ));
          } catch { /* ignore */ }
        }
      }
    } catch (e: unknown) {
      setLoadErr(e instanceof Error ? e.message : "Erro de rede");
    } finally {
      setPosting(false);
    }
  };

  const videoObj = videos.find((v) => v.id === selectedVideo);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "2rem" }}>
        <div style={{
          width: "48px", height: "48px", borderRadius: "12px",
          background: "linear-gradient(135deg, rgba(201,162,39,0.3), rgba(201,162,39,0.1))",
          border: "1px solid rgba(201,162,39,0.3)",
          display: "flex", justifyContent: "center", alignItems: "center",
        }}>
          <Send size={22} color="var(--accent-gold)" />
        </div>
        <div>
          <h1 className="page-title" style={{ marginBottom: 0 }}>Postagem em Massa</h1>
          <p className="page-subtitle" style={{ marginBottom: 0 }}>
            Escolha um vídeo da biblioteca e poste em várias contas ao mesmo tempo
          </p>
        </div>
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
              <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                {videos.map((v) => (
                  <label key={v.id} style={{
                    display: "flex", alignItems: "center", gap: "0.75rem",
                    padding: "0.75rem 1rem", borderRadius: "10px", cursor: "pointer",
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
                      style={{ accentColor: "var(--accent-gold)" }}
                    />
                    <div style={{
                      width: "40px", height: "40px", borderRadius: "6px",
                      background: "#0a0c14", overflow: "hidden", flexShrink: 0,
                    }}>
                      <video src={v.publicUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} muted preload="metadata" />
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p style={{ fontSize: "0.85rem", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {v.originalName}
                      </p>
                      <p style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{formatBytes(v.sizeBytes)}</p>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Caption */}
          <div className="glass-panel" style={{ padding: "1.5rem", borderRadius: "14px" }}>
            <label style={{
              display: "block", fontSize: "0.78rem", fontWeight: 600,
              color: "var(--text-secondary)", marginBottom: "0.5rem",
              textTransform: "uppercase", letterSpacing: "0.08em",
            }}>
              Legenda
            </label>
            <textarea
              className="input-field"
              rows={4}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Texto da publicação…"
              disabled={posting}
              style={{ resize: "vertical", width: "100%" }}
            />
          </div>
        </div>

        {/* Right: Accounts + Post */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <div className="glass-panel" style={{ padding: "1.5rem", borderRadius: "14px" }}>
            <h3 style={{ fontSize: "0.95rem", fontWeight: 700, marginBottom: "1rem" }}>Contas</h3>

            {accounts.length === 0 ? (
              <div style={{ textAlign: "center", padding: "1.5rem" }}>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginBottom: "0.75rem" }}>
                  Nenhuma conta conectada
                </p>
                <Link href="/accounts" style={{
                  padding: "0.5rem 1rem", borderRadius: "8px", fontSize: "0.8rem",
                  background: "rgba(201,162,39,0.1)", border: "1px solid rgba(201,162,39,0.2)",
                  color: "var(--accent-gold)", fontWeight: 600,
                }}>
                  Conectar conta
                </Link>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "1.25rem" }}>
                <label style={{
                  display: "flex", alignItems: "center", gap: "0.6rem",
                  padding: "0.5rem 0.75rem", borderRadius: "8px",
                  background: "rgba(201,162,39,0.05)", cursor: "pointer", fontSize: "0.8rem",
                  color: "var(--text-muted)", fontWeight: 600,
                }}>
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
                  <label key={a.id} style={{
                    display: "flex", alignItems: "center", gap: "0.6rem",
                    padding: "0.65rem 0.75rem", borderRadius: "8px", cursor: "pointer",
                    background: selected[a.id] ? "rgba(201,162,39,0.07)" : "rgba(255,255,255,0.02)",
                    border: `1px solid ${selected[a.id] ? "rgba(201,162,39,0.2)" : "transparent"}`,
                    transition: "all 0.15s",
                  }}>
                    <input
                      type="checkbox"
                      checked={Boolean(selected[a.id])}
                      onChange={() => toggle(a.id)}
                      disabled={posting}
                      style={{ accentColor: "var(--accent-gold)" }}
                    />
                    <span style={{ fontSize: "0.875rem", fontWeight: 500 }}>@{a.username}</span>
                    {a.source === "oauth" && (
                      <span style={{ marginLeft: "auto", fontSize: "0.68rem", color: "var(--text-muted)", background: "rgba(255,255,255,0.05)", padding: "2px 6px", borderRadius: "4px" }}>
                        oficial
                      </span>
                    )}
                  </label>
                ))}
              </div>
            )}

            {/* Preview + Post button */}
            {videoObj && (
              <div style={{
                padding: "0.75rem", borderRadius: "10px",
                background: "rgba(201,162,39,0.06)", border: "1px solid rgba(201,162,39,0.15)",
                marginBottom: "1rem", display: "flex", gap: "0.75rem", alignItems: "center",
              }}>
                <div style={{ width: "44px", height: "44px", borderRadius: "6px", overflow: "hidden", flexShrink: 0 }}>
                  <video src={videoObj.publicUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} muted preload="metadata" />
                </div>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: "0.8rem", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {videoObj.originalName}
                  </p>
                  <p style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                    {Object.values(selected).filter(Boolean).length} conta(s) selecionada(s)
                  </p>
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
              {posting ? (
                <><Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> Publicando…</>
              ) : (
                <><Send size={16} /> Postar em todas as selecionadas</>
              )}
            </button>
          </div>

          {/* Results */}
          {statuses.length > 0 && (
            <div className="glass-panel" style={{ padding: "1.25rem", borderRadius: "14px" }}>
              <h3 style={{ fontSize: "0.95rem", fontWeight: 700, marginBottom: "0.75rem" }}>Resultado</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {statuses.map((s) => (
                  <div key={s.accountId} style={{
                    display: "flex", alignItems: "flex-start", gap: "0.6rem",
                    padding: "0.6rem 0.75rem", borderRadius: "8px", fontSize: "0.875rem",
                    background: s.pending ? "rgba(255,255,255,0.03)"
                      : s.success ? "rgba(34,197,94,0.07)"
                      : "rgba(239,68,68,0.07)",
                  }}>
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

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
