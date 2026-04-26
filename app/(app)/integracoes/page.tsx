"use client";

import { Plug, Save, Loader2, CheckCircle, Copy, AtSign, Bell } from "lucide-react";
import { useState, useEffect } from "react";

const WEBHOOK_BASE = typeof window !== "undefined" ? window.location.origin : "";

interface IgAccount { id: string; username: string; }

export default function IntegracoesPage() {
  const [configs, setConfigs] = useState<Record<string, Record<string, string>>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>({});
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<IgAccount[]>([]);

  useEffect(() => {
    Promise.all([
      fetch("/api/integrations").then((r) => r.json()),
      fetch("/api/auth/instagram/accounts").then((r) => r.json()),
    ]).then(([intData, accData]) => {
      setConfigs(intData.integrations ?? {});
      setDrafts(intData.integrations ?? {});
      setAccounts(accData.accounts ?? []);
    }).finally(() => setLoading(false));
  }, []);

  const handleSave = async (type: string) => {
    setSaving(type);
    try {
      await fetch("/api/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, config: drafts[type] ?? {} }),
      });
      setConfigs((prev) => ({ ...prev, [type]: drafts[type] ?? {} }));
      setSaved(type);
      setTimeout(() => setSaved(null), 2500);
    } finally {
      setSaving(null);
    }
  };

  const setField = (type: string, key: string, value: string) => {
    setDrafts((prev) => ({ ...prev, [type]: { ...(prev[type] ?? {}), [key]: value } }));
  };

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  if (loading) return (
    <div style={{ textAlign: "center", padding: "4rem", color: "var(--text-secondary)" }}>
      <Loader2 size={28} style={{ animation: "spin 1s linear infinite", margin: "0 auto" }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.5rem" }}>
        <Plug size={22} color="var(--accent-gold)" />
        <h1 className="page-title" style={{ marginBottom: 0 }}>Integrações</h1>
      </div>
      <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "2rem" }}>
        Configure o webhook da ApexVips e o bot do Telegram para rastreio de vendas.
      </p>

      {/* ApexVips */}
      <Section title="ApexVips — Rastreio por Conta" color="#f97316" badge="Tracking">
        <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: "1rem" }}>
          Você tem um bot rodando em várias contas. Configure <strong style={{ color: "#fff" }}>um único webhook</strong> na ApexVips e cada conta usa um link personalizado com <code style={{ color: "#93c5fd", fontSize: "0.75rem" }}>?utm_source=</code> para rastrear de onde veio a venda.
        </p>

        {accounts.length === 0 ? (
          <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Nenhuma conta IG conectada. Conecte contas primeiro em <a href="/accounts" style={{ color: "var(--accent-gold)" }}>Contas</a>.</p>
        ) : (
          <>
            {/* Step 1: one webhook URL */}
            <div style={{ marginBottom: "1rem" }}>
              <p style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "0.4rem", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                Passo 1 — Cole este webhook na ApexVips (único para todas as contas)
              </p>
              {(() => {
                const mainAcc = accounts[0];
                const url = `${WEBHOOK_BASE}/api/webhooks/apexvips/${mainAcc.username}`;
                return (
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.6rem 0.75rem", borderRadius: "8px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <code style={{ flex: 1, fontSize: "0.75rem", color: "#93c5fd", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{url}</code>
                    <button onClick={() => copyUrl(url)} style={{ padding: "0.4rem", borderRadius: "6px", background: "none", border: "1px solid var(--border-color)", color: copiedUrl === url ? "#4ade80" : "var(--text-secondary)", cursor: "pointer", flexShrink: 0 }}>
                      {copiedUrl === url ? <CheckCircle size={13} /> : <Copy size={13} />}
                    </button>
                  </div>
                );
              })()}
            </div>

            {/* Step 2: offer base URL */}
            <div style={{ marginBottom: "1rem" }}>
              <p style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "0.4rem", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                Passo 2 — Cole o link da sua oferta na ApexVips
              </p>
              <Field label="" placeholder="https://pay.apexvips.com/b/xxxxxxxx"
                value={drafts["apexvips"]?.offerUrl ?? ""}
                onChange={(v) => setField("apexvips", "offerUrl", v)} />
            </div>

            {/* Step 3: per-account links */}
            <div>
              <p style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "0.4rem", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                Passo 3 — Cada conta usa este link ao divulgar a oferta
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                {accounts.map((acc) => {
                  const base = (drafts["apexvips"]?.offerUrl ?? "").trim();
                  const trackingUrl = base
                    ? `${base}${base.includes("?") ? "&" : "?"}utm_source=${acc.username}`
                    : `(cole o link acima) + ?utm_source=${acc.username}`;
                  return (
                    <div key={acc.id} style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.6rem 0.75rem", borderRadius: "8px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                      <AtSign size={14} color="var(--accent-gold)" style={{ flexShrink: 0 }} />
                      <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "#fff", minWidth: "110px", flexShrink: 0 }}>@{acc.username}</span>
                      <code style={{ flex: 1, fontSize: "0.72rem", color: base ? "#93c5fd" : "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {trackingUrl}
                      </code>
                      {base && (
                        <button onClick={() => copyUrl(trackingUrl)} style={{ padding: "0.4rem", borderRadius: "6px", background: "none", border: "1px solid var(--border-color)", color: copiedUrl === trackingUrl ? "#4ade80" : "var(--text-secondary)", cursor: "pointer", flexShrink: 0 }}>
                          {copiedUrl === trackingUrl ? <CheckCircle size={13} /> : <Copy size={13} />}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        <div style={{ marginTop: "1rem", padding: "0.75rem", borderRadius: "8px", background: "rgba(249,115,22,0.06)", border: "1px solid rgba(249,115,22,0.15)", fontSize: "0.78rem", color: "var(--text-muted)", lineHeight: 1.6 }}>
          <strong style={{ color: "var(--text-secondary)" }}>Eventos:</strong> ative <code style={{ color: "#93c5fd" }}>Payment Created</code> e <code style={{ color: "#93c5fd" }}>Payment Approved</code> no webhook da Apex. A venda será atribuída à conta do link usado.
        </div>

        <SaveButton type="apexvips" saving={saving} saved={saved} onSave={handleSave} />
      </Section>

      {/* Notificações Push */}
      <div style={{ marginTop: "1.25rem" }}>
        <Section title="Notificações de Venda" color="#FFD54F" badge="Push">
          <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: "1.25rem" }}>
            Configure como as notificações de venda aparecem no seu celular.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1rem" }}>
            <Field label="Nome personalizado" placeholder="@seuusuario ou seu nome"
              value={drafts["notifications"]?.customName ?? ""}
              onChange={(v) => setField("notifications", "customName", v)} />

            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {([
                { key: "pendingEnabled", label: "Enviar Pix gerado (pendente)", defaultOn: true },
                { key: "approvedEnabled", label: "Enviar venda aprovada", defaultOn: true },
              ] as const).map(({ key, label, defaultOn }) => {
                const val = drafts["notifications"]?.[key];
                const checked = val === undefined ? defaultOn : val !== "false";
                return (
                  <label key={key} style={{ display: "flex", alignItems: "center", gap: "0.6rem", cursor: "pointer", fontSize: "0.85rem" }}>
                    <input type="checkbox" checked={checked}
                      onChange={(e) => setField("notifications", key, e.target.checked ? "true" : "false")}
                      style={{ accentColor: "#FFD54F", width: 15, height: 15 }} />
                    <span style={{ color: "var(--text-secondary)" }}>{label}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Preview */}
          <div style={{ marginBottom: "0.5rem" }}>
            <span style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Prévia</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {[
              { title: `Pix gerado! | ${drafts["notifications"]?.customName || "AutoPost"}`, body: "Valor: R$ 49,90" },
              { title: `Venda aprovada! | ${drafts["notifications"]?.customName || "AutoPost"}`, body: "Valor: R$ 49,90" },
            ].map((n, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.65rem 0.85rem", borderRadius: "12px", background: "rgba(20,20,30,0.9)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Bell size={16} color="#FFD54F" />
                </div>
                <div>
                  <p style={{ fontSize: "0.82rem", fontWeight: 700, color: "#fff", margin: 0 }}>{n.title}</p>
                  <p style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.5)", margin: 0 }}>{n.body}</p>
                </div>
              </div>
            ))}
          </div>

          <SaveButton type="notifications" saving={saving} saved={saved} onSave={handleSave} />
        </Section>
      </div>

      {/* Telegram */}
      <div style={{ marginTop: "1.25rem" }}>
        <Section title="Bot do Telegram" color="#229ED9" badge="Notificações">
          <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: "1rem" }}>
            Receba uma notificação a cada venda aprovada com valor, cliente e conta IG de origem.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <Field label="Bot Token" placeholder="1234567890:AAFxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              value={drafts["telegram"]?.botToken ?? ""} onChange={(v) => setField("telegram", "botToken", v)} />
            <Field label="Chat ID" placeholder="-1001234567890 ou @seucanal"
              value={drafts["telegram"]?.chatId ?? ""} onChange={(v) => setField("telegram", "chatId", v)} />
          </div>
          <div style={{ marginTop: "0.5rem", fontSize: "0.75rem", color: "var(--text-muted)" }}>
            Crie o bot em @BotFather e use @userinfobot para obter seu Chat ID.
          </div>
          <SaveButton type="telegram" saving={saving} saved={saved} onSave={handleSave} />
        </Section>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function Section({ title, color, badge, children }: { title: string; color: string; badge?: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: "1.25rem 1.5rem", borderRadius: "12px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border-color)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
        <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: color, flexShrink: 0 }} />
        <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>{title}</span>
        {badge && <span style={{ fontSize: "0.68rem", padding: "2px 8px", borderRadius: "999px", background: `${color}22`, color, fontWeight: 600 }}>{badge}</span>}
      </div>
      {children}
    </div>
  );
}

function Field({ label, placeholder, value, onChange }: { label: string; placeholder: string; value: string; onChange: (v: string) => void }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem", marginBottom: "0.5rem" }}>
      <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-secondary)" }}>{label}</span>
      <input
        type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        style={{ padding: "0.55rem 0.75rem", borderRadius: "8px", background: "rgba(255,255,255,0.06)", border: "1px solid var(--border-color)", color: "#fff", fontSize: "0.85rem", outline: "none" }}
      />
    </label>
  );
}

function SaveButton({ type, saving, saved, onSave }: { type: string; saving: string | null; saved: string | null; onSave: (t: string) => void }) {
  const isSaving = saving === type;
  const isSaved = saved === type;
  return (
    <button
      onClick={() => onSave(type)}
      disabled={isSaving}
      style={{
        marginTop: "1rem", display: "flex", alignItems: "center", gap: "0.4rem",
        padding: "0.55rem 1.1rem", borderRadius: "8px",
        background: isSaved ? "rgba(74,222,128,0.15)" : "rgba(201,162,39,0.15)",
        border: `1px solid ${isSaved ? "rgba(74,222,128,0.3)" : "rgba(201,162,39,0.3)"}`,
        color: isSaved ? "#4ade80" : "var(--accent-gold)",
        cursor: isSaving ? "not-allowed" : "pointer", fontSize: "0.82rem", fontWeight: 700,
      }}
    >
      {isSaving ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : isSaved ? <CheckCircle size={14} /> : <Save size={14} />}
      {isSaving ? "Salvando…" : isSaved ? "Salvo!" : "Salvar"}
    </button>
  );
}
