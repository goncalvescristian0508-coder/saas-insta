"use client";

import { Camera, Plus, Wifi, Trash2, AlertTriangle, Loader2, Lock, User, CheckCircle } from "lucide-react";
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
        token_failed: "Falha ao obter token.",
        oauth_config: "Configure META_APP_ID e META_REDIRECT_URI no .env.local.",
      };
      setError(msgs[errorParam] || "Erro OAuth: " + errorParam);
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

      {/* Private account section */}
      <div style={{ marginBottom: "2.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1.25rem" }}>
          <Lock size={14} color="var(--accent-gold)" />
          <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--accent-gold)", letterSpacing: "0.05em", textTransform: "uppercase" }}>
            Conectar conta ({privateAccounts.length})
          </span>
        </div>

        <div className="glass-panel" style={{ padding: "1.5rem", borderRadius: "14px", marginBottom: "1rem" }}>
          <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "1.25rem" }}>
            Conecte qualquer conta do Instagram com usuário e senha. Funciona sem aprovação da Meta.
          </p>

          {privSuccess && (
            <div style={{
              display: "flex", alignItems: "center", gap: "0.5rem",
              padding: "0.75rem 1rem", borderRadius: "8px",
              background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)",
              marginBottom: "1rem", color: "#4ade80", fontSize: "0.875rem",
            }}>
              <CheckCircle size={15} />
              {privSuccess}
            </div>
          )}

          {privError && (
            <div style={{
              display: "flex", alignItems: "center", gap: "0.5rem",
              padding: "0.75rem 1rem", borderRadius: "8px",
              background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
              marginBottom: "1rem", color: "#f87171", fontSize: "0.875rem",
            }}>
              <AlertTriangle size={15} />
              {privError}
            </div>
          )}

          <form onSubmit={(e) => void handleAddPrivate(e)} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.4rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Usuário Instagram
                </label>
                <div style={{ position: "relative" }}>
                  <User size={15} color="var(--text-muted)" style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)" }} />
                  <input
                    type="text"
                    value={privUsername}
                    onChange={(e) => setPrivUsername(e.target.value)}
                    required
                    placeholder="@usuario"
                    disabled={privLoading}
                    style={{
                      width: "100%", padding: "0.7rem 0.75rem 0.7rem 2.25rem",
                      background: "rgba(255,255,255,0.04)", border: "1px solid rgba(201,162,39,0.15)",
                      borderRadius: "8px", color: "#fff", fontSize: "0.875rem", outline: "none",
                    }}
                    onFocus={(e) => e.target.style.borderColor = "rgba(201,162,39,0.45)"}
                    onBlur={(e) => e.target.style.borderColor = "rgba(201,162,39,0.15)"}
                  />
                </div>
              </div>
              <div>
                <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.4rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Senha
                </label>
                <div style={{ position: "relative" }}>
                  <Lock size={15} color="var(--text-muted)" style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)" }} />
                  <input
                    type="password"
                    value={privPassword}
                    onChange={(e) => setPrivPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    disabled={privLoading}
                    style={{
                      width: "100%", padding: "0.7rem 0.75rem 0.7rem 2.25rem",
                      background: "rgba(255,255,255,0.04)", border: "1px solid rgba(201,162,39,0.15)",
                      borderRadius: "8px", color: "#fff", fontSize: "0.875rem", outline: "none",
                    }}
                    onFocus={(e) => e.target.style.borderColor = "rgba(201,162,39,0.45)"}
                    onBlur={(e) => e.target.style.borderColor = "rgba(201,162,39,0.15)"}
                  />
                </div>
              </div>
            </div>
            <button
              type="submit"
              disabled={privLoading}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem",
                padding: "0.75rem", borderRadius: "8px",
                background: privLoading ? "rgba(201,162,39,0.3)" : "linear-gradient(135deg, #c9a227, #a8851f)",
                border: "none", color: privLoading ? "rgba(255,255,255,0.5)" : "#0a0c12",
                fontSize: "0.875rem", fontWeight: 700, cursor: privLoading ? "not-allowed" : "pointer",
              }}
            >
              {privLoading ? <><Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} /> Conectando…</> : <><Plus size={15} /> Conectar conta</>}
            </button>
          </form>
        </div>

        {loading ? (
          <p style={{ color: "var(--text-secondary)" }}>Carregando…</p>
        ) : privateAccounts.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {privateAccounts.map((account) => (
              <div key={account.id} className="glass-panel" style={{ padding: "1rem 1.25rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.85rem" }}>
                  <div style={{
                    width: "40px", height: "40px", borderRadius: "50%",
                    background: "linear-gradient(135deg, #833ab4, #fd1d1d, #fcb045)",
                    display: "flex", justifyContent: "center", alignItems: "center",
                    fontSize: "0.9rem", fontWeight: 600, color: "#fff",
                  }}>
                    {account.username.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p style={{ fontWeight: 600 }}>@{account.username}</p>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginTop: "0.1rem" }}>
                      {account.lastError ? (
                        <span style={{ fontSize: "0.75rem", color: "#f87171" }}>{account.lastError}</span>
                      ) : (
                        <>
                          <Wifi size={12} color="#22c55e" />
                          <span style={{ fontSize: "0.75rem", color: "#22c55e" }}>Conectada</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void handleRemove(account.id, "private")}
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
      </div>

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

        <div
          role="button"
          tabIndex={0}
          onClick={!isConnecting ? () => { setIsConnecting(true); window.location.assign("/api/auth/instagram"); } : undefined}
          onKeyDown={(e) => { if (!isConnecting && (e.key === "Enter" || e.key === " ")) { setIsConnecting(true); window.location.assign("/api/auth/instagram"); } }}
          style={{
            textAlign: "center", padding: "2rem", borderRadius: "16px",
            border: "1px dashed var(--border-color)", cursor: isConnecting ? "default" : "pointer",
            transition: "all 0.3s", opacity: isConnecting ? 0.7 : 1,
          }}
          onMouseEnter={(e) => { if (!isConnecting) { e.currentTarget.style.borderColor = "var(--border-highlight)"; e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.02)"; } }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border-color)"; e.currentTarget.style.backgroundColor = "transparent"; }}
        >
          {isConnecting
            ? <><Loader2 size={22} color="var(--text-secondary)" style={{ margin: "0 auto 0.5rem", animation: "spin 1s linear infinite" }} /><p style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>Redirecionando…</p></>
            : <><Plus size={22} color="var(--text-secondary)" style={{ margin: "0 auto 0.5rem" }} /><p style={{ fontWeight: 500, marginBottom: "0.25rem" }}>Conectar via OAuth</p><p style={{ color: "var(--text-secondary)", fontSize: "0.8rem" }}>Requer aprovação da Meta (em análise)</p></>
          }
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
