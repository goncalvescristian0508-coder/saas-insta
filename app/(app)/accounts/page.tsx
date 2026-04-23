"use client";

import { Camera, Plus, Wifi, Trash2, AlertTriangle, Loader2, Lock, User, CheckCircle, Link, Copy } from "lucide-react";
import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";

interface OAuthAccount {
  id: string;
  username: string;
  source: "oauth" | "private";
  profilePicUrl?: string;
  hasSession: boolean;
  lastError: string | null;
}

export default function AccountsPage() {
  return (
    <Suspense fallback={<div style={{ padding: "2rem", color: "var(--text-secondary)" }}>Carregando contas…</div>}>
      <AccountsPageInner />
    </Suspense>
  );
}

function AccountsPageInner() {
  const [accounts, setAccounts] = useState<OAuthAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Private account form
  const [privUsername, setPrivUsername] = useState("");
  const [privPassword, setPrivPassword] = useState("");
  const [privLoading, setPrivLoading] = useState(false);
  const [privSuccess, setPrivSuccess] = useState("");
  const [privError, setPrivError] = useState("");

  // OAuth
  const [isConnecting, setIsConnecting] = useState(false);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const searchParams = useSearchParams();

  const loadAccounts = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/private-ig/accounts", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao carregar contas.");
      setAccounts(data.accounts ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao carregar contas.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadAccounts(); }, []);

  useEffect(() => {
    const errorParam = searchParams.get("error");
    const success = searchParams.get("success");
    if (success === "true") void loadAccounts();
    if (errorParam) {
      const msgs: Record<string, string> = {
        auth_denied: "Autorização negada pelo usuário.",
        oauth_config: "Configure META_APP_ID e META_REDIRECT_URI no .env.local.",
      };
      const detail = searchParams.get("detail");
      setError(msgs[errorParam] || `Erro OAuth: ${errorParam}${detail ? ` — ${detail}` : ""}`);
    }
    if (success || errorParam) window.history.replaceState({}, "", "/accounts");
  }, [searchParams]);

  const handleRemove = async (id: string, source: "oauth" | "private") => {
    try {
      const url = source === "oauth"
        ? `/api/auth/instagram/accounts/${id}`
        : `/api/private-ig/accounts/${id}`;
      const res = await fetch(url, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erro ao remover.");
      }
      setAccounts((prev) => prev.filter((a) => a.id !== id));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao remover conta.");
    }
  };

  const handleAddPrivate = async (e: React.FormEvent) => {
    e.preventDefault();
    setPrivLoading(true);
    setPrivError("");
    setPrivSuccess("");
    try {
      const res = await fetch("/api/private-ig/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: privUsername, password: privPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.debug || data.error || "Erro ao conectar.");
      setPrivSuccess(`@${data.username} conectada com sucesso!`);
      setPrivUsername("");
      setPrivPassword("");
      void loadAccounts();
    } catch (e: unknown) {
      setPrivError(e instanceof Error ? e.message : "Erro ao conectar conta.");
    } finally {
      setPrivLoading(false);
    }
  };

  const handleGenerateLink = async () => {
    setGeneratingLink(true);
    try {
      const res = await fetch("/api/connect/generate", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.url) {
        await navigator.clipboard.writeText(data.url);
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 3000);
      }
    } finally {
      setGeneratingLink(false);
    }
  };

  const privateAccounts = accounts.filter((a) => a.source === "private");
  const oauthAccounts = accounts.filter((a) => a.source === "oauth");

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "2rem" }}>
        <div style={{
          width: "48px", height: "48px", borderRadius: "12px",
          background: "linear-gradient(135deg, #833ab4, #fd1d1d, #fcb045)",
          display: "flex", justifyContent: "center", alignItems: "center",
        }}>
          <Camera size={24} color="#fff" />
        </div>
        <div>
          <h1 className="page-title" style={{ marginBottom: 0 }}>Contas Conectadas</h1>
          <p className="page-subtitle" style={{ marginBottom: 0 }}>Gerencie as contas do Instagram para postagem</p>
        </div>
      </div>

      {error && (
        <div style={{
          marginBottom: "1.5rem", padding: "0.8rem 1rem", borderRadius: "8px",
          backgroundColor: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
          display: "flex", alignItems: "center", gap: "0.5rem", color: "#f87171", fontSize: "0.9rem",
        }}>
          <AlertTriangle size={16} />
          <span style={{ flex: 1 }}>{error}</span>
          <button type="button" onClick={() => setError("")} style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer" }}>✕</button>
        </div>
      )}

      {/* Private account section — hidden (not functional) */}

      {/* OAuth section */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1.25rem" }}>
          <Camera size={14} color="var(--text-secondary)" />
          <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)", letterSpacing: "0.05em", textTransform: "uppercase" }}>
            Instagram OAuth — API oficial ({oauthAccounts.length})
          </span>
        </div>

        {oauthAccounts.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1rem" }}>
            {oauthAccounts.map((account) => (
              <div key={account.id} className="glass-panel" style={{ padding: "1rem 1.25rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.85rem" }}>
                  {account.profilePicUrl ? (
                    <img src={account.profilePicUrl} alt={account.username} style={{ width: "40px", height: "40px", borderRadius: "50%", objectFit: "cover" }} />
                  ) : (
                    <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: "linear-gradient(135deg, #833ab4, #fd1d1d, #fcb045)", display: "flex", justifyContent: "center", alignItems: "center", fontSize: "0.9rem", fontWeight: 600, color: "#fff" }}>
                      {account.username.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <p style={{ fontWeight: 600 }}>@{account.username}</p>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginTop: "0.1rem" }}>
                      <Wifi size={12} color="#22c55e" />
                      <span style={{ fontSize: "0.75rem", color: "#22c55e" }}>OAuth conectada</span>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void handleRemove(account.id, "oauth")}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", padding: "0.5rem", borderRadius: "8px", transition: "all 0.2s" }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = "#ef4444"; e.currentTarget.style.backgroundColor = "rgba(239,68,68,0.1)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-secondary)"; e.currentTarget.style.backgroundColor = "transparent"; }}
                >
                  <Trash2 size={17} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", gap: "0.75rem" }}>
          {/* Conectar direto no navegador atual */}
          <div
            role="button"
            tabIndex={0}
            onClick={!isConnecting ? () => { setIsConnecting(true); window.location.assign("/api/auth/instagram"); } : undefined}
            onKeyDown={(e) => { if (!isConnecting && (e.key === "Enter" || e.key === " ")) { setIsConnecting(true); window.location.assign("/api/auth/instagram"); } }}
            style={{
              flex: 1, textAlign: "center", padding: "1.5rem 1rem", borderRadius: "16px",
              border: "1px dashed var(--border-color)", cursor: isConnecting ? "default" : "pointer",
              transition: "all 0.3s", opacity: isConnecting ? 0.7 : 1,
            }}
            onMouseEnter={(e) => { if (!isConnecting) { e.currentTarget.style.borderColor = "var(--border-highlight)"; e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.02)"; } }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border-color)"; e.currentTarget.style.backgroundColor = "transparent"; }}
          >
            {isConnecting
              ? <><Loader2 size={20} color="var(--text-secondary)" style={{ margin: "0 auto 0.4rem", animation: "spin 1s linear infinite" }} /><p style={{ color: "var(--text-secondary)", fontSize: "0.82rem" }}>Redirecionando…</p></>
              : <><Plus size={20} color="var(--text-secondary)" style={{ margin: "0 auto 0.4rem" }} /><p style={{ fontWeight: 600, marginBottom: "0.2rem", fontSize: "0.9rem" }}>Conectar aqui</p><p style={{ color: "var(--text-secondary)", fontSize: "0.76rem" }}>Neste navegador</p></>
            }
          </div>

          {/* Gerar link compartilhável */}
          <div
            role="button"
            tabIndex={0}
            onClick={!generatingLink ? () => void handleGenerateLink() : undefined}
            onKeyDown={(e) => { if (!generatingLink && (e.key === "Enter" || e.key === " ")) void handleGenerateLink(); }}
            style={{
              flex: 1, textAlign: "center", padding: "1.5rem 1rem", borderRadius: "16px",
              border: `1px dashed ${copiedLink ? "rgba(74,222,128,0.4)" : "rgba(96,165,250,0.3)"}`,
              cursor: generatingLink ? "default" : "pointer", transition: "all 0.3s",
              background: copiedLink ? "rgba(74,222,128,0.05)" : "transparent",
            }}
            onMouseEnter={(e) => { if (!generatingLink) e.currentTarget.style.backgroundColor = "rgba(96,165,250,0.04)"; }}
            onMouseLeave={(e) => { if (!copiedLink) e.currentTarget.style.backgroundColor = "transparent"; }}
          >
            {generatingLink
              ? <><Loader2 size={20} color="#60a5fa" style={{ margin: "0 auto 0.4rem", animation: "spin 1s linear infinite" }} /><p style={{ color: "#60a5fa", fontSize: "0.82rem" }}>Gerando…</p></>
              : copiedLink
              ? <><CheckCircle size={20} color="#4ade80" style={{ margin: "0 auto 0.4rem" }} /><p style={{ fontWeight: 600, marginBottom: "0.2rem", fontSize: "0.9rem", color: "#4ade80" }}>Link copiado!</p><p style={{ color: "var(--text-secondary)", fontSize: "0.76rem" }}>Válido por 24h</p></>
              : <><Link size={20} color="#60a5fa" style={{ margin: "0 auto 0.4rem" }} /><p style={{ fontWeight: 600, marginBottom: "0.2rem", fontSize: "0.9rem" }}>Copiar link</p><p style={{ color: "var(--text-secondary)", fontSize: "0.76rem" }}>Abrir em outro dispositivo</p></>
            }
          </div>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
