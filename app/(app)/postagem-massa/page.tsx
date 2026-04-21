"use client";

import { useCallback, useEffect, useState } from "react";
import { Upload, Send, Loader2, CheckCircle2, XCircle } from "lucide-react";

type AccountRow = {
  id: string;
  username: string;
  hasSession: boolean;
  source?: "oauth" | "private";
};

type StatusRow = {
  accountId: string;
  username: string;
  success?: boolean;
  error?: string;
  pending?: boolean;
};

export default function BulkPostPage() {
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [caption, setCaption] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [posting, setPosting] = useState(false);
  const [statuses, setStatuses] = useState<StatusRow[]>([]);
  const [loadErr, setLoadErr] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/private-ig/accounts");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro");
      const list = (data.accounts ?? []) as AccountRow[];
      setAccounts(list);
      const sel: Record<string, boolean> = {};
      list.forEach((a) => {
        sel[a.id] = true;
      });
      setSelected(sel);
    } catch (e: unknown) {
      setLoadErr(e instanceof Error ? e.message : "Erro ao carregar contas");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = (id: string) => {
    setSelected((s) => ({ ...s, [id]: !s[id] }));
  };

  const handlePost = async () => {
    setLoadErr("");
    if (!file) {
      setLoadErr("Selecione um vídeo.");
      return;
    }
    const ids = Object.entries(selected)
      .filter(([, v]) => v)
      .map(([k]) => k);
    if (ids.length === 0) {
      setLoadErr("Marque ao menos uma conta.");
      return;
    }

    setPosting(true);
    setStatuses(
      ids.map((id) => {
        const u = accounts.find((a) => a.id === id)?.username ?? id;
        return { accountId: id, username: u, pending: true };
      }),
    );

    const fd = new FormData();
    fd.append("video", file);
    fd.append("caption", caption);
    fd.append("accountIds", JSON.stringify(ids));

    try {
      const res = await fetch("/api/private-ig/bulk-post", {
        method: "POST",
        body: fd,
      });

      if (!res.ok || !res.body) {
        const t = await res.text();
        setLoadErr(t || "Falha na postagem");
        setStatuses((prev) =>
          prev.map((s) => ({ ...s, pending: false, success: false, error: t })),
        );
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
            const evt = JSON.parse(line) as {
              accountId: string;
              username?: string;
              success: boolean;
              error?: string;
            };
            setStatuses((prev) =>
              prev.map((row) =>
                row.accountId === evt.accountId
                  ? {
                      ...row,
                      username: evt.username || row.username,
                      pending: false,
                      success: evt.success,
                      error: evt.error,
                    }
                  : row,
              ),
            );
          } catch {
            /* ignore bad line */
          }
        }
      }
    } catch (e: unknown) {
      setLoadErr(e instanceof Error ? e.message : "Erro de rede");
    } finally {
      setPosting(false);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "0.5rem" }}>
        <div
          style={{
            width: "48px",
            height: "48px",
            borderRadius: "12px",
            background: "linear-gradient(135deg, #2563eb, #c9a227)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Upload size={24} color="#fff" />
        </div>
        <div>
          <h1 className="page-title" style={{ marginBottom: 0 }}>
            Postagem em massa
          </h1>
          <p className="page-subtitle" style={{ marginBottom: 0 }}>
            Um vídeo, uma legenda, várias contas — status por conta em tempo real (stream).
          </p>
        </div>
      </div>

      {loadErr && (
        <p style={{ color: "#f87171", marginTop: "0.75rem", fontSize: "0.9rem" }}>{loadErr}</p>
      )}

      <div className="glass-panel" style={{ padding: "1.5rem", marginTop: "1rem" }}>
        <div className="input-group">
          <label className="input-label">Vídeo (MP4)</label>
          <input
            className="input-field"
            type="file"
            accept="video/mp4,video/quicktime"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            disabled={posting}
          />
        </div>
        <div className="input-group">
          <label className="input-label">Legenda</label>
          <textarea
            className="input-field"
            rows={4}
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Texto da publicação…"
            disabled={posting}
            style={{ resize: "vertical" }}
          />
        </div>

        <h3 style={{ fontSize: "0.9rem", marginBottom: "0.75rem", color: "var(--text-secondary)" }}>
          Contas
        </h3>
        {accounts.length === 0 ? (
          <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>
            Conecte contas em <strong>Contas</strong> (OAuth).
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "1rem" }}>
            {accounts.map((a) => (
              <label
                key={a.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.6rem",
                  cursor: "pointer",
                  fontSize: "0.95rem",
                }}
              >
                <input
                  type="checkbox"
                  checked={Boolean(selected[a.id])}
                  onChange={() => toggle(a.id)}
                  disabled={posting}
                  style={{ accentColor: "var(--accent-gold)" }}
                />
                @{a.username}
                {a.source === "oauth" && (
                  <span
                    style={{
                      marginLeft: "0.35rem",
                      fontSize: "0.7rem",
                      opacity: 0.75,
                    }}
                  >
                    (API oficial)
                  </span>
                )}
              </label>
            ))}
          </div>
        )}

        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void handlePost()}
          disabled={posting || accounts.length === 0}
          style={{ width: "100%" }}
        >
          {posting ? (
            <>
              <Loader2 size={16} className="spin" /> Publicando…
            </>
          ) : (
            <>
              <Send size={16} /> Postar em todas as selecionadas
            </>
          )}
        </button>
      </div>

      {statuses.length > 0 && (
        <div className="glass-panel" style={{ padding: "1.25rem", marginTop: "1.25rem" }}>
          <h3 style={{ fontSize: "1rem", marginBottom: "0.75rem" }}>Resultado</h3>
          <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {statuses.map((s) => (
              <li
                key={s.accountId}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "0.5rem",
                  fontSize: "0.9rem",
                }}
              >
                {s.pending ? (
                  <Loader2 size={18} className="spin" style={{ flexShrink: 0 }} />
                ) : s.success ? (
                  <CheckCircle2 size={18} color="#22c55e" style={{ flexShrink: 0 }} />
                ) : (
                  <XCircle size={18} color="#ef4444" style={{ flexShrink: 0 }} />
                )}
                <span>
                  <strong>@{s.username}</strong>
                  {s.pending && " — aguardando…"}
                  {!s.pending && s.success && " — publicado."}
                  {!s.pending && !s.success && s.error && ` — ${s.error}`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .spin { animation: spin 0.9s linear infinite; }
      `}</style>
    </div>
  );
}
