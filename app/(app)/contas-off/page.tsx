"use client";

import { WifiOff, RefreshCw, Trash2, Loader2, AlertTriangle, ShieldOff, Clock } from "lucide-react";
import { useState, useEffect } from "react";

interface FallenAccount {
  id: string;
  username: string;
  source: "oauth" | "private";
  profilePicUrl?: string;
  lastError: string;
  accountStatus?: string;
  quarantinedUntil?: string | null;
}

export default function ContasOffPage() {
  const [accounts, setAccounts] = useState<FallenAccount[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/private-ig/accounts", { cache: "no-store" });
      const d = await res.json();
      const all = (d.accounts ?? []) as Array<{
        id: string; username: string; source: "oauth" | "private";
        profilePicUrl?: string; lastError: string | null;
        accountStatus?: string; quarantinedUntil?: string | null;
      }>;
      // Show accounts with errors OR suspended/quarantine status
      setAccounts(all.filter((a) =>
        !!a.lastError || a.accountStatus === "SUSPENDED" || a.accountStatus === "QUARANTINE"
      ) as FallenAccount[]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const handleRemove = async (id: string, source: "oauth" | "private") => {
    const url = source === "oauth"
      ? `/api/auth/instagram/accounts/${id}`
      : `/api/private-ig/accounts/${id}`;
    await fetch(url, { method: "DELETE" });
    setAccounts((prev) => prev.filter((a) => a.id !== id));
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <WifiOff size={22} color="#f87171" />
          <h1 className="page-title" style={{ marginBottom: 0 }}>
            Contas Off <span style={{ fontSize: "0.85rem", fontWeight: 500, color: "var(--text-secondary)" }}>({accounts.length})</span>
          </h1>
        </div>
        <button
          onClick={() => void load()}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", padding: "0.4rem", borderRadius: "8px" }}
        >
          <RefreshCw size={17} />
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-secondary)" }}>
          <Loader2 size={28} style={{ animation: "spin 1s linear infinite", margin: "0 auto 0.5rem" }} />
        </div>
      ) : accounts.length === 0 ? (
        <div style={{ textAlign: "center", padding: "4rem 2rem", color: "var(--text-secondary)" }}>
          <WifiOff size={48} style={{ margin: "0 auto 1rem", opacity: 0.25 }} />
          <p style={{ fontWeight: 600, fontSize: "1rem", marginBottom: "0.5rem" }}>Nenhuma conta caída registrada</p>
          <p style={{ fontSize: "0.82rem", opacity: 0.6 }}>Todas as suas contas estão operando normalmente.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
          {accounts.map((account) => {
            const isSuspended = account.accountStatus === "SUSPENDED";
            const isQuarantine = account.accountStatus === "QUARANTINE";
            const quarantineEnd = account.quarantinedUntil ? new Date(account.quarantinedUntil) : null;
            const color = isSuspended ? "#f87171" : isQuarantine ? "#fb923c" : "#f87171";
            const bgColor = isSuspended ? "rgba(239,68,68,0.05)" : isQuarantine ? "rgba(251,146,60,0.05)" : "rgba(239,68,68,0.05)";
            const borderColor = isSuspended ? "rgba(239,68,68,0.2)" : isQuarantine ? "rgba(251,146,60,0.25)" : "rgba(239,68,68,0.2)";

            return (
            <div key={account.id} style={{
              padding: "1rem 1.25rem", borderRadius: "12px",
              background: bgColor, border: `1px solid ${borderColor}`,
              display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.75rem",
            }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "0.85rem", flex: 1, minWidth: 0 }}>
                <div style={{
                  width: "40px", height: "40px", borderRadius: "50%", flexShrink: 0,
                  background: isSuspended ? "rgba(239,68,68,0.2)" : isQuarantine ? "rgba(251,146,60,0.2)" : "rgba(239,68,68,0.2)",
                  display: "flex", justifyContent: "center", alignItems: "center",
                  fontSize: "0.9rem", fontWeight: 700, color,
                }}>
                  {isSuspended ? <ShieldOff size={18} /> : isQuarantine ? <Clock size={18} /> : account.username.charAt(0).toUpperCase()}
                </div>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontWeight: 600 }}>@{account.username}</p>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginTop: "0.1rem" }}>
                    {isSuspended
                      ? <><ShieldOff size={12} color={color} /><span style={{ fontSize: "0.72rem", color, fontWeight: 700 }}>Suspensa pelo Instagram</span></>
                      : isQuarantine
                      ? <><Clock size={12} color={color} /><span style={{ fontSize: "0.72rem", color, fontWeight: 700 }}>Quarentena{quarantineEnd ? ` — retoma ${quarantineEnd.toLocaleString("pt-BR", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}` : ""}</span></>
                      : <><WifiOff size={12} color={color} /><span style={{ fontSize: "0.72rem", color }}>{account.source === "oauth" ? "OAuth" : "Login direto"} · Conta caída</span></>
                    }
                  </div>
                  {account.lastError && (
                    <div style={{
                      marginTop: "0.5rem", padding: "0.4rem 0.6rem", borderRadius: "6px",
                      background: `${bgColor}`, border: `1px solid ${borderColor}`,
                      display: "flex", alignItems: "flex-start", gap: "0.4rem",
                    }}>
                      <AlertTriangle size={12} color={color} style={{ marginTop: "2px", flexShrink: 0 }} />
                      <p style={{ fontSize: "0.75rem", color, lineHeight: 1.4 }}>{account.lastError}</p>
                    </div>
                  )}
                </div>
              </div>
              <button
                onClick={() => void handleRemove(account.id, account.source)}
                title="Remover conta"
                style={{ background: "none", border: "none", cursor: "pointer", color, padding: "0.4rem", borderRadius: "8px", flexShrink: 0 }}
              >
                <Trash2 size={17} />
              </button>
            </div>
            );
          })}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
