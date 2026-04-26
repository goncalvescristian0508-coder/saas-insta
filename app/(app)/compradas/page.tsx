"use client";

import { ShoppingBag, Plus, Trash2, Loader2, AlertTriangle, Wifi, WifiOff, X } from "lucide-react";
import { useState, useEffect } from "react";

interface PurchasedAccount {
  id: string;
  username: string;
  hasSession: boolean;
  lastError: string | null;
}

interface ParsedAccount {
  username: string;
  password: string;
  totpSecret?: string;
}

function parseAccountsText(text: string): ParsedAccount[] {
  const blocks = text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const result: ParsedAccount[] = [];

  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length === 2) {
      // username / password
      result.push({ username: lines[0], password: lines[1] });
    } else if (lines.length >= 3) {
      // 2FA / username / password
      result.push({ totpSecret: lines[0], username: lines[1], password: lines[2] });
    }
  }

  return result;
}

export default function CompradasPage() {
  const [accounts, setAccounts] = useState<PurchasedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [adding, setAdding] = useState(false);
  const [addResult, setAddResult] = useState<{ added: number; skipped: number } | null>(null);
  const [error, setError] = useState("");

  const parsed = parseAccountsText(bulkText);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/private-ig/accounts", { cache: "no-store" });
      const d = await res.json();
      const all = (d.accounts ?? []) as Array<{
        id: string; username: string; source: string;
        hasSession: boolean; lastError: string | null;
      }>;
      setAccounts(all.filter((a) => a.source === "private") as PurchasedAccount[]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const handleBulkAdd = async () => {
    if (!parsed.length) return;
    setAdding(true);
    setError("");
    try {
      const res = await fetch("/api/private-ig/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accounts: parsed }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Erro ao adicionar");
      setAddResult({ added: d.added, skipped: d.skipped });
      setBulkText("");
      void load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro desconhecido");
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (id: string) => {
    await fetch(`/api/private-ig/accounts/${id}`, { method: "DELETE" });
    setAccounts((prev) => prev.filter((a) => a.id !== id));
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <ShoppingBag size={22} color="var(--accent-gold)" />
          <h1 className="page-title" style={{ marginBottom: 0 }}>Contas Compradas</h1>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            onClick={() => { setShowModal(true); setAddResult(null); setError(""); }}
            style={{
              display: "flex", alignItems: "center", gap: "0.4rem",
              padding: "0.5rem 1rem", borderRadius: "8px",
              background: "rgba(255,255,255,0.06)", border: "1px solid var(--border-color)",
              color: "#fff", cursor: "pointer", fontSize: "0.82rem", fontWeight: 600,
            }}
          >
            <Plus size={15} /> Adicionar Contas
          </button>
        </div>
      </div>
      <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", marginBottom: "1.5rem" }}>
        Gerencie as credenciais das contas que você comprou
      </p>

      {loading ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-secondary)" }}>
          <Loader2 size={28} style={{ animation: "spin 1s linear infinite", margin: "0 auto 0.5rem" }} />
        </div>
      ) : accounts.length === 0 ? (
        <div style={{ textAlign: "center", padding: "4rem 2rem", color: "var(--text-secondary)" }}>
          <ShoppingBag size={52} style={{ margin: "0 auto 1rem", opacity: 0.25 }} />
          <p style={{ fontWeight: 600, fontSize: "1rem", marginBottom: "0.5rem" }}>Nenhuma conta adicionada ainda</p>
          <p style={{ fontSize: "0.82rem", opacity: 0.6, marginBottom: "1.25rem" }}>
            Clique em "Adicionar Contas" para colar os dados das contas compradas
          </p>
          <button
            onClick={() => { setShowModal(true); setAddResult(null); setError(""); }}
            style={{
              padding: "0.6rem 1.25rem", borderRadius: "8px",
              background: "rgba(201,162,39,0.15)", border: "1px solid rgba(201,162,39,0.3)",
              color: "var(--accent-gold)", cursor: "pointer", fontSize: "0.85rem", fontWeight: 600,
            }}
          >
            + Adicionar primeiro conta
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
          {accounts.map((account) => (
            <div key={account.id} style={{
              padding: "1rem 1.25rem", borderRadius: "12px",
              background: "rgba(255,255,255,0.03)", border: "1px solid var(--border-color)",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.85rem" }}>
                <div style={{
                  width: "40px", height: "40px", borderRadius: "50%",
                  background: account.lastError ? "rgba(239,68,68,0.2)" : "linear-gradient(135deg,#667eea,#764ba2)",
                  display: "flex", justifyContent: "center", alignItems: "center",
                  fontWeight: 700, color: "#fff", fontSize: "0.9rem",
                }}>
                  {account.username.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p style={{ fontWeight: 600 }}>@{account.username}</p>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginTop: "0.1rem" }}>
                    {account.lastError
                      ? <><WifiOff size={12} color="#f87171" /><span style={{ fontSize: "0.72rem", color: "#f87171" }}>Erro</span></>
                      : account.hasSession
                      ? <><Wifi size={12} color="#22c55e" /><span style={{ fontSize: "0.72rem", color: "#22c55e" }}>Ativa</span></>
                      : <><Wifi size={12} color="#facc15" /><span style={{ fontSize: "0.72rem", color: "#facc15" }}>Salva</span></>
                    }
                  </div>
                </div>
              </div>
              <button
                onClick={() => void handleRemove(account.id)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", padding: "0.4rem" }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "#f87171"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-secondary)"; }}
              >
                <Trash2 size={17} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add modal */}
      {showModal && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 100,
          display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem",
        }}>
          <div style={{
            background: "rgba(14,16,26,0.98)", border: "1px solid var(--border-color)",
            borderRadius: "16px", width: "100%", maxWidth: "520px", padding: "1.5rem",
            backdropFilter: "blur(24px)",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
              <h2 style={{ fontSize: "1.05rem", fontWeight: 700 }}>Adicionar Contas Compradas</h2>
              <button onClick={() => setShowModal(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)" }}>
                <X size={20} />
              </button>
            </div>
            <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: "1rem", lineHeight: 1.5 }}>
              Cole no formato exato (ordem importa): <strong>2FA, usuário, senha</strong> — uma conta por bloco, separados por linha em branco. Para contas sem 2FA, cole apenas <strong>usuário, senha</strong>.
            </p>

            {/* Format example */}
            <div style={{
              padding: "0.75rem 1rem", borderRadius: "8px", marginBottom: "1rem",
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
              fontFamily: "monospace", fontSize: "0.78rem", color: "var(--text-secondary)", lineHeight: 1.6,
            }}>
              <div>D3ZQXXX7MU3T7F5A6CYX5FFZAW4OSAXI</div>
              <div>valentina.brasil w</div>
              <div>15qsw6</div>
              <div style={{ marginTop: "0.5rem" }}>OUTRA2FAAQUI123456</div>
              <div>outrousuario</div>
              <div>outras3nha</div>
            </div>

            <textarea
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              placeholder="Cole os dados das contas aqui…"
              rows={8}
              style={{
                width: "100%", borderRadius: "10px", padding: "0.75rem",
                background: "rgba(255,255,255,0.05)", border: "1px solid rgba(96,165,250,0.4)",
                color: "#fff", fontSize: "0.85rem", resize: "vertical", fontFamily: "monospace",
                outline: "none", boxSizing: "border-box", lineHeight: 1.5,
              }}
            />

            {error && (
              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginTop: "0.5rem", color: "#f87171", fontSize: "0.8rem" }}>
                <AlertTriangle size={14} /> {error}
              </div>
            )}

            {addResult && (
              <div style={{ marginTop: "0.5rem", fontSize: "0.8rem", color: "#4ade80" }}>
                ✓ {addResult.added} conta(s) adicionada(s){addResult.skipped > 0 ? `, ${addResult.skipped} ignorada(s)` : ""}
              </div>
            )}

            <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.25rem" }}>
              <button
                onClick={() => setShowModal(false)}
                style={{ flex: 1, padding: "0.65rem", borderRadius: "8px", background: "none", border: "1px solid var(--border-color)", color: "var(--text-secondary)", cursor: "pointer", fontSize: "0.85rem" }}
              >
                Cancelar
              </button>
              <button
                onClick={() => void handleBulkAdd()}
                disabled={adding || parsed.length === 0}
                style={{
                  flex: 2, padding: "0.65rem", borderRadius: "8px",
                  background: parsed.length > 0 ? "linear-gradient(135deg,rgba(96,165,250,0.8),rgba(59,130,246,0.8))" : "rgba(255,255,255,0.06)",
                  border: "none", color: "#fff", cursor: parsed.length > 0 ? "pointer" : "not-allowed",
                  fontSize: "0.85rem", fontWeight: 700,
                }}
              >
                {adding ? "Adicionando…" : `Adicionar ${parsed.length} conta(s)`}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
