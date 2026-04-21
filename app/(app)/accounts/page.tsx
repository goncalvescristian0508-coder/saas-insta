"use client";

import { Camera, Plus, Wifi, Trash2, AlertTriangle, Loader2 } from "lucide-react";
import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";

interface OAuthAccount {
  id: string;
  username: string;
  profilePictureUrl: string | null;
  tokenExpiresAt: string | null;
  lastError: string | null;
}

export default function AccountsPage() {
  return (
    <Suspense
      fallback={
        <div style={{ padding: "2rem", color: "var(--text-secondary)" }}>
          Carregando contas…
        </div>
      }
    >
      <AccountsPageInner />
    </Suspense>
  );
}

function AccountsPageInner() {
  const [accounts, setAccounts] = useState<OAuthAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState("");
  const searchParams = useSearchParams();

  const loadAccounts = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/instagram/accounts", {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao carregar contas.");
      setAccounts(data.accounts ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao carregar contas.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAccounts();
  }, []);

  useEffect(() => {
    const errorParam = searchParams.get("error");
    const connected = searchParams.get("connected");
    const success = searchParams.get("success");
    const detail = searchParams.get("detail");

    if (connected === "1" || success === "true") {
      void loadAccounts();
    }

    if (errorParam) {
      const msgs: Record<string, string> = {
        auth_denied: "Autorização negada pelo usuário.",
        no_code: "Código de autorização não recebido.",
        token_failed: "Falha ao obter ou guardar o token.",
        oauth_failed: "O Instagram recusou o login OAuth.",
        oauth_config:
          "Configure META_APP_ID e META_REDIRECT_URI no .env.local (use o ID do app Instagram, não o do Facebook).",
        deprecated_oauth_path:
          "Atualize o Redirect URI no Meta para /api/auth/instagram/callback e use Conectar de novo.",
      };
      let msg = msgs[errorParam] || "Erro desconhecido.";
      if (detail && errorParam !== "oauth_config") {
        msg += ` (${detail.slice(0, 200)})`;
      }
      setError(msg);
    }

    if (connected === "1" || success === "true" || errorParam) {
      window.history.replaceState({}, "", "/accounts");
    }
  }, [searchParams]);

  const handleConnect = () => {
    setIsConnecting(true);
    setError("");
    window.location.assign("/api/auth/instagram");
  };

  const handleRemove = async (id: string) => {
    try {
      const res = await fetch(`/api/auth/instagram/accounts/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erro ao remover.");
      }
      setAccounts((prev) => prev.filter((a) => a.id !== id));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao remover conta.");
    }
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "1rem",
          marginBottom: "0.5rem",
        }}
      >
        <div
          style={{
            width: "48px",
            height: "48px",
            borderRadius: "12px",
            background:
              "linear-gradient(135deg, #833ab4, #fd1d1d, #fcb045)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Camera size={24} color="#fff" />
        </div>
        <div>
          <h1 className="page-title" style={{ marginBottom: 0 }}>
            Contas Conectadas
          </h1>
          <p className="page-subtitle" style={{ marginBottom: 0 }}>
            Instagram via API oficial (OAuth em api.instagram.com)
          </p>
        </div>
      </div>

      {error && (
        <div
          style={{
            marginTop: "1.5rem",
            padding: "0.8rem 1rem",
            borderRadius: "8px",
            backgroundColor: "rgba(239,68,68,0.1)",
            border: "1px solid rgba(239,68,68,0.3)",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            color: "#f87171",
            fontSize: "0.9rem",
          }}
        >
          <AlertTriangle size={16} />
          <span style={{ flex: 1 }}>{error}</span>
          <button
            type="button"
            onClick={() => setError("")}
            style={{
              marginLeft: "auto",
              background: "none",
              border: "none",
              color: "#f87171",
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>
      )}

      <div style={{ marginTop: "2rem" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            marginBottom: "1.5rem",
          }}
        >
          <Camera size={16} color="var(--text-secondary)" />
          <span
            style={{
              fontSize: "0.8rem",
              fontWeight: 600,
              color: "var(--text-secondary)",
              letterSpacing: "0.05em",
              textTransform: "uppercase",
            }}
          >
            Instagram OAuth ({accounts.length})
          </span>
        </div>

        {loading ? (
          <p style={{ color: "var(--text-secondary)" }}>Carregando…</p>
        ) : accounts.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "4rem 2rem",
              borderRadius: "16px",
              border: "1px solid var(--border-color)",
            }}
          >
            <Camera
              size={48}
              color="var(--text-secondary)"
              style={{ marginBottom: "1rem", opacity: 0.4 }}
            />
            <h3
              style={{
                color: "var(--text-secondary)",
                fontWeight: 500,
                marginBottom: "0.5rem",
              }}
            >
              Nenhuma conta Instagram conectada
            </h3>
            <p
              style={{
                color: "var(--text-secondary)",
                fontSize: "0.9rem",
                opacity: 0.7,
              }}
            >
              Use o ID do app Instagram no Meta e o redirect HTTPS (ngrok).
            </p>
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "1rem",
            }}
          >
            {accounts.map((account) => (
              <div
                key={account.id}
                className="glass-panel"
                style={{
                  padding: "1.2rem 1.5rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "1rem",
                  }}
                >
                  {account.profilePictureUrl ? (
                    <img
                      src={account.profilePictureUrl}
                      alt={account.username}
                      style={{
                        width: "44px",
                        height: "44px",
                        borderRadius: "50%",
                        objectFit: "cover",
                        border: "2px solid rgba(255,255,255,0.1)",
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: "44px",
                        height: "44px",
                        borderRadius: "50%",
                        background:
                          "linear-gradient(135deg, #833ab4, #fd1d1d, #fcb045)",
                        display: "flex",
                        justifyContent: "center",
                        alignItems: "center",
                        padding: "2px",
                      }}
                    >
                      <div
                        style={{
                          width: "100%",
                          height: "100%",
                          borderRadius: "50%",
                          backgroundColor: "var(--surface-solid)",
                          display: "flex",
                          justifyContent: "center",
                          alignItems: "center",
                          fontSize: "0.9rem",
                          fontWeight: 600,
                        }}
                      >
                        {account.username.charAt(0).toUpperCase()}
                      </div>
                    </div>
                  )}
                  <div>
                    <p style={{ fontWeight: 600 }}>@{account.username}</p>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "1rem",
                        marginTop: "0.2rem",
                        flexWrap: "wrap",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.4rem",
                        }}
                      >
                        <Wifi size={12} color="#22c55e" />
                        <span style={{ fontSize: "0.8rem", color: "#22c55e" }}>
                          Conectada
                        </span>
                      </div>
                      {account.lastError && (
                        <span
                          style={{
                            fontSize: "0.75rem",
                            color: "#f87171",
                            maxWidth: "280px",
                          }}
                        >
                          {account.lastError}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void handleRemove(account.id)}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--text-secondary)",
                    padding: "0.5rem",
                    borderRadius: "8px",
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = "#ef4444";
                    e.currentTarget.style.backgroundColor =
                      "rgba(239,68,68,0.1)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = "var(--text-secondary)";
                    e.currentTarget.style.backgroundColor = "transparent";
                  }}
                  title="Remover conta"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginTop: "2.5rem" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            marginBottom: "1.5rem",
          }}
        >
          <Plus size={14} color="var(--text-secondary)" />
          <span
            style={{
              fontSize: "0.8rem",
              fontWeight: 600,
              color: "var(--text-secondary)",
              letterSpacing: "0.05em",
              textTransform: "uppercase",
            }}
          >
            Conectar conta do Instagram
          </span>
        </div>

        <div
          role="button"
          tabIndex={0}
          onClick={!isConnecting ? handleConnect : undefined}
          onKeyDown={(e) => {
            if (!isConnecting && (e.key === "Enter" || e.key === " "))
              handleConnect();
          }}
          style={{
            textAlign: "center",
            padding: "3rem 2rem",
            borderRadius: "16px",
            border: "1px dashed var(--border-color)",
            cursor: isConnecting ? "default" : "pointer",
            transition: "all 0.3s",
            opacity: isConnecting ? 0.7 : 1,
          }}
          onMouseEnter={(e) => {
            if (!isConnecting) {
              e.currentTarget.style.borderColor = "var(--border-highlight)";
              e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.02)";
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "var(--border-color)";
            e.currentTarget.style.backgroundColor = "transparent";
          }}
        >
          <div
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "12px",
              backgroundColor: "rgba(255,255,255,0.05)",
              margin: "0 auto 1rem",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            {isConnecting ? (
              <Loader2
                size={28}
                color="var(--text-secondary)"
                style={{ animation: "spin 1s linear infinite" }}
              />
            ) : (
              <Plus size={28} color="var(--text-secondary)" />
            )}
          </div>
          <h3 style={{ fontWeight: 500, marginBottom: "0.3rem" }}>
            {isConnecting
              ? "Redirecionando para o Instagram…"
              : "Conectar conta do Instagram"}
          </h3>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>
            Login oficial (api.instagram.com) — use o ID do app Instagram no
            Meta Developer
          </p>
        </div>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
