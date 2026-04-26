"use client";

import {
  Users, Plus, Trash2, AlertTriangle, Loader2, CheckCircle, Link,
  RefreshCw, Folder, X, Flame, MoreVertical, Wifi, WifiOff, Eye, EyeOff, Shield,
} from "lucide-react";
import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";

interface OAuthAccount {
  id: string;
  username: string;
  source: "oauth" | "private";
  profilePicUrl?: string;
  hasSession: boolean;
  lastError: string | null;
  appKey?: string;
}

interface MetaApp {
  key: string;
  name: string;
  appId: string;
  count: number;
  isLotado: boolean;
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
  const [showPasswords, setShowPasswords] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [metaApps, setMetaApps] = useState<MetaApp[]>([]);
  const [showAppModal, setShowAppModal] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [warmupAccountId, setWarmupAccountId] = useState<string | null>(null);
  const [warmupTarget, setWarmupTarget] = useState(30);
  const [warmupInterval, setWarmupInterval] = useState(120);
  const [warmupSaving, setWarmupSaving] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
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

  const loadApps = async () => {
    try {
      const res = await fetch("/api/admin/meta-apps");
      const d = await res.json();
      if (d.apps?.length > 0) setMetaApps(d.apps);
    } catch {}
  };

  useEffect(() => {
    void loadAccounts();
    void loadApps();
  }, []);

  useEffect(() => {
    const errorParam = searchParams.get("error");
    const success = searchParams.get("success");
    if (success === "true") void loadAccounts();
    if (errorParam) {
      const msgs: Record<string, string> = {
        auth_denied: "Autorização negada pelo usuário.",
        oauth_config: "Configure META_APP_ID e META_REDIRECT_URI no .env.local.",
        cancelled: "Conexão cancelada.",
      };
      const detail = searchParams.get("detail");
      setError(msgs[errorParam] || `Erro OAuth: ${errorParam}${detail ? ` — ${detail}` : ""}`);
    }
    if (success || errorParam) window.history.replaceState({}, "", "/accounts");
  }, [searchParams]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleRemove = async (id: string, source: "oauth" | "private") => {
    try {
      const url = source === "oauth"
        ? `/api/auth/instagram/accounts/${id}`
        : `/api/private-ig/accounts/${id}`;
      const res = await fetch(url, { method: "DELETE" });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Erro ao remover."); }
      setAccounts((prev) => prev.filter((a) => a.id !== id));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao remover conta.");
    }
  };

  const handleConnectApp = (appKey: string) => {
    setShowAppModal(false);
    setIsConnecting(true);
    window.location.assign(`/api/auth/instagram?app=${appKey}`);
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

  const handleActivateWarmup = async () => {
    if (!warmupAccountId) return;
    setWarmupSaving(true);
    try {
      await fetch("/api/warmup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: warmupAccountId, targetPosts: warmupTarget, intervalMinutes: warmupInterval }),
      });
      setWarmupAccountId(null);
    } finally {
      setWarmupSaving(false);
    }
  };

  const oauthAccounts = accounts.filter((a) => a.source === "oauth");
  const privateAccounts = accounts.filter((a) => a.source === "private");

  const cardStyle: React.CSSProperties = {
    padding: "1rem 1.25rem",
    borderRadius: "12px",
    background: "rgba(255,255,255,0.03)",
    border: "1px solid var(--border-color)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "0.75rem",
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
        <h1 className="page-title" style={{ marginBottom: 0 }}>Contas</h1>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <button
            onClick={() => setShowPasswords((v) => !v)}
            title={showPasswords ? "Ocultar detalhes" : "Mostrar detalhes"}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", padding: "0.4rem", borderRadius: "8px" }}
          >
            {showPasswords ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
          <button
            title="Segurança"
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", padding: "0.4rem", borderRadius: "8px" }}
          >
            <Shield size={17} />
          </button>
          <button
            onClick={() => void loadAccounts()}
            title="Recarregar"
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", padding: "0.4rem", borderRadius: "8px" }}
          >
            <RefreshCw size={17} />
          </button>
          <button
            onClick={() => void handleGenerateLink()}
            disabled={generatingLink}
            style={{
              display: "flex", alignItems: "center", gap: "0.4rem",
              padding: "0.5rem 0.9rem", borderRadius: "8px",
              background: "rgba(255,255,255,0.05)", border: "1px solid var(--border-color)",
              color: copiedLink ? "#4ade80" : "var(--text-secondary)", cursor: "pointer", fontSize: "0.82rem", fontWeight: 600,
            }}
          >
            {copiedLink ? <CheckCircle size={15} /> : <Folder size={15} />}
            {copiedLink ? "Copiado!" : "Pasta"}
          </button>
          <button
            onClick={() => metaApps.length > 0 ? setShowAppModal(true) : handleConnectApp("")}
            disabled={isConnecting}
            style={{
              display: "flex", alignItems: "center", gap: "0.4rem",
              padding: "0.5rem 1rem", borderRadius: "8px",
              background: "linear-gradient(135deg,#833ab4,#fd1d1d,#fcb045)",
              border: "none", color: "#fff", cursor: "pointer", fontSize: "0.82rem", fontWeight: 700,
            }}
          >
            {isConnecting ? <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} /> : <Plus size={15} />}
            Instagram
          </button>
        </div>
      </div>

      {error && (
        <div style={{
          marginBottom: "1.25rem", padding: "0.8rem 1rem", borderRadius: "8px",
          backgroundColor: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
          display: "flex", alignItems: "center", gap: "0.5rem", color: "#f87171", fontSize: "0.88rem",
        }}>
          <AlertTriangle size={16} />
          <span style={{ flex: 1 }}>{error}</span>
          <button type="button" onClick={() => setError("")} style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer" }}>✕</button>
        </div>
      )}

      {/* Info card */}
      <div style={{
        marginBottom: "1.5rem", padding: "1.25rem 1.5rem", borderRadius: "12px",
        background: "rgba(255,255,255,0.02)", border: "1px solid var(--border-color)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
          <Users size={16} color="var(--accent-gold)" />
          <span style={{ fontWeight: 700, fontSize: "0.9rem" }}>Gerenciamento de Contas e Postagem</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", fontSize: "0.82rem", color: "var(--text-secondary)" }}>
          <p>• <strong>Status da Conta:</strong> Monitore o status de cada conta (Ativa, Erro, Bloqueada) para garantir a continuidade das postagens.</p>
          <p>• <strong>Frequência de Postagem:</strong> Contas ativas postam conforme configurado. Verifique o histórico para entender o ritmo.</p>
          <p>• <strong>Contas em Risco:</strong> Contas com status de erro ou bloqueio podem ter suas postagens interrompidas. Aja rapidamente.</p>
          <p>• <strong>Dica de Ouro:</strong> Mantenha suas contas saudáveis e com boa atividade para otimizar o alcance e engajamento.</p>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-secondary)" }}>
          <Loader2 size={28} style={{ animation: "spin 1s linear infinite", margin: "0 auto 0.5rem" }} />
          <p style={{ fontSize: "0.88rem" }}>Carregando contas…</p>
        </div>
      ) : accounts.length === 0 ? (
        <div style={{ textAlign: "center", padding: "4rem 2rem", color: "var(--text-secondary)" }}>
          <Users size={48} style={{ margin: "0 auto 1rem", opacity: 0.3 }} />
          <p style={{ fontWeight: 600, fontSize: "1rem", marginBottom: "0.5rem" }}>Nenhuma conta conectada</p>
          <p style={{ fontSize: "0.82rem", opacity: 0.7 }}>Clique em "+ Instagram" para conectar sua primeira conta.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }} ref={menuRef}>
          {oauthAccounts.length > 0 && (
            <>
              <p style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "0.25rem" }}>
                OAuth — API Oficial ({oauthAccounts.length})
              </p>
              {oauthAccounts.map((account) => (
                <AccountCard
                  key={account.id}
                  account={account}
                  showPasswords={showPasswords}
                  openMenuId={openMenuId}
                  setOpenMenuId={setOpenMenuId}
                  onRemove={handleRemove}
                  onWarmup={(id) => { setWarmupAccountId(id); setOpenMenuId(null); }}
                  cardStyle={cardStyle}
                />
              ))}
            </>
          )}

          {privateAccounts.length > 0 && (
            <>
              <p style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)", marginTop: "0.75rem", marginBottom: "0.25rem" }}>
                Login Direto ({privateAccounts.length})
              </p>
              {privateAccounts.map((account) => (
                <AccountCard
                  key={account.id}
                  account={account}
                  showPasswords={showPasswords}
                  openMenuId={openMenuId}
                  setOpenMenuId={setOpenMenuId}
                  onRemove={handleRemove}
                  onWarmup={(id) => { setWarmupAccountId(id); setOpenMenuId(null); }}
                  cardStyle={cardStyle}
                />
              ))}
            </>
          )}
        </div>
      )}

      {/* App selector modal */}
      {showAppModal && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100,
          display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem",
        }}>
          <div style={{
            background: "rgba(14,16,26,0.98)", border: "1px solid var(--border-color)",
            borderRadius: "16px", width: "100%", maxWidth: "420px", padding: "1.5rem",
            backdropFilter: "blur(24px)",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 700 }}>Escolher aplicativo</h2>
              <button onClick={() => setShowAppModal(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)" }}>
                <X size={20} />
              </button>
            </div>
            <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", marginBottom: "1.25rem" }}>
              Selecione qual aplicativo Meta usar para conectar esta conta:
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxHeight: "400px", overflowY: "auto" }}>
              {metaApps.map((app) => (
                <button
                  key={app.key}
                  onClick={() => !app.isLotado && handleConnectApp(app.key)}
                  style={{
                    width: "100%", padding: "0.85rem 1rem", borderRadius: "10px",
                    background: app.isLotado ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.04)",
                    border: `1px solid ${app.isLotado ? "rgba(255,255,255,0.06)" : "var(--border-color)"}`,
                    color: app.isLotado ? "var(--text-muted)" : "#fff",
                    cursor: app.isLotado ? "not-allowed" : "pointer",
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    fontSize: "0.88rem", fontWeight: 600, textAlign: "left",
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => { if (!app.isLotado) e.currentTarget.style.background = "rgba(255,255,255,0.08)"; }}
                  onMouseLeave={(e) => { if (!app.isLotado) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                >
                  <span>
                    <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginRight: "0.5rem" }}>App {app.key}</span>
                    {app.name}
                  </span>
                  {app.isLotado && (
                    <span style={{ fontSize: "0.72rem", color: "#f87171", fontWeight: 700 }}>(LOTADO)</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Warmup modal */}
      {warmupAccountId && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100,
          display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem",
        }}>
          <div style={{
            background: "rgba(14,16,26,0.98)", border: "1px solid var(--border-color)",
            borderRadius: "16px", width: "100%", maxWidth: "380px", padding: "1.5rem",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
              <Flame size={18} color="#f97316" />
              <h2 style={{ fontSize: "1rem", fontWeight: 700 }}>Ativar Aquecimento</h2>
            </div>
            <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: "1.25rem" }}>
              A conta postará no intervalo configurado até atingir a meta de posts.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginBottom: "1.25rem" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)" }}>Meta de posts</span>
                <input
                  type="number" min={5} max={200} value={warmupTarget}
                  onChange={(e) => setWarmupTarget(Number(e.target.value))}
                  style={{ padding: "0.5rem 0.75rem", borderRadius: "8px", background: "rgba(255,255,255,0.06)", border: "1px solid var(--border-color)", color: "#fff", fontSize: "0.88rem" }}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)" }}>Intervalo entre posts (min)</span>
                <select
                  value={warmupInterval}
                  onChange={(e) => setWarmupInterval(Number(e.target.value))}
                  style={{ padding: "0.5rem 0.75rem", borderRadius: "8px", background: "rgba(255,255,255,0.06)", border: "1px solid var(--border-color)", color: "#fff", fontSize: "0.88rem" }}
                >
                  {[60, 90, 120, 150, 180, 240].map((m) => (
                    <option key={m} value={m} style={{ background: "#1a1a2e" }}>{m} min ({(m / 60).toFixed(1)}h)</option>
                  ))}
                </select>
              </label>
            </div>
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button onClick={() => setWarmupAccountId(null)} style={{ flex: 1, padding: "0.6rem", borderRadius: "8px", background: "none", border: "1px solid var(--border-color)", color: "var(--text-secondary)", cursor: "pointer", fontSize: "0.85rem" }}>
                Cancelar
              </button>
              <button
                onClick={() => void handleActivateWarmup()}
                disabled={warmupSaving}
                style={{ flex: 1, padding: "0.6rem", borderRadius: "8px", background: "linear-gradient(135deg,#f97316,#fb923c)", border: "none", color: "#fff", cursor: "pointer", fontWeight: 700, fontSize: "0.85rem" }}
              >
                {warmupSaving ? "Ativando…" : "Ativar"}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function AccountCard({
  account, showPasswords, openMenuId, setOpenMenuId, onRemove, onWarmup, cardStyle,
}: {
  account: OAuthAccount;
  showPasswords: boolean;
  openMenuId: string | null;
  setOpenMenuId: (id: string | null) => void;
  onRemove: (id: string, source: "oauth" | "private") => void;
  onWarmup: (id: string) => void;
  cardStyle: React.CSSProperties;
}) {
  const isError = !!account.lastError;

  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.85rem", flex: 1, minWidth: 0 }}>
        {account.profilePicUrl ? (
          <img src={account.profilePicUrl} alt={account.username}
            style={{ width: "40px", height: "40px", borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
        ) : (
          <div style={{
            width: "40px", height: "40px", borderRadius: "50%", flexShrink: 0,
            background: isError ? "rgba(239,68,68,0.2)" : "linear-gradient(135deg,#833ab4,#fd1d1d,#fcb045)",
            display: "flex", justifyContent: "center", alignItems: "center",
            fontSize: "0.9rem", fontWeight: 700, color: "#fff",
          }}>
            {account.username.charAt(0).toUpperCase()}
          </div>
        )}
        <div style={{ minWidth: 0 }}>
          <p style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            @{account.username}
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginTop: "0.1rem" }}>
            {isError
              ? <><WifiOff size={12} color="#f87171" /><span style={{ fontSize: "0.72rem", color: "#f87171" }}>Erro</span></>
              : <><Wifi size={12} color="#22c55e" /><span style={{ fontSize: "0.72rem", color: "#22c55e" }}>{account.source === "oauth" ? "OAuth" : "Login direto"}</span></>
            }
            {showPasswords && account.appKey && (
              <span style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginLeft: "0.3rem" }}>App {account.appKey}</span>
            )}
          </div>
          {isError && showPasswords && (
            <p style={{ fontSize: "0.7rem", color: "#f87171", marginTop: "0.2rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {account.lastError}
            </p>
          )}
        </div>
      </div>

      <div style={{ position: "relative", flexShrink: 0 }}>
        <button
          onClick={() => setOpenMenuId(openMenuId === account.id ? null : account.id)}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", padding: "0.4rem", borderRadius: "8px" }}
        >
          <MoreVertical size={17} />
        </button>

        {openMenuId === account.id && (
          <div style={{
            position: "absolute", right: 0, top: "calc(100% + 4px)", zIndex: 50,
            background: "rgba(20,22,32,0.98)", border: "1px solid var(--border-color)",
            borderRadius: "10px", overflow: "hidden", minWidth: "160px",
            backdropFilter: "blur(20px)", boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          }}>
            {account.source === "oauth" && (
              <button
                onClick={() => onWarmup(account.id)}
                style={{ width: "100%", padding: "0.7rem 1rem", background: "none", border: "none", color: "#fb923c", cursor: "pointer", fontSize: "0.82rem", textAlign: "left", display: "flex", alignItems: "center", gap: "0.5rem" }}
              >
                <Flame size={14} /> Ativar aquecimento
              </button>
            )}
            <button
              onClick={() => { onRemove(account.id, account.source); setOpenMenuId(null); }}
              style={{ width: "100%", padding: "0.7rem 1rem", background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: "0.82rem", textAlign: "left", display: "flex", alignItems: "center", gap: "0.5rem" }}
            >
              <Trash2 size={14} /> Remover conta
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
