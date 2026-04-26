"use client";

import { Flame, RefreshCw, Trash2, Loader2, BarChart2 } from "lucide-react";
import { useState, useEffect } from "react";

interface WarmupItem {
  id: string;
  accountId: string;
  targetPosts: number;
  completedPosts: number;
  intervalMinutes: number;
  isActive: boolean;
  lastPostedAt: string | null;
  account: { username: string; profilePictureUrl: string | null };
}

export default function AquecimentoPage() {
  const [warmups, setWarmups] = useState<WarmupItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/warmup");
      const d = await res.json();
      setWarmups(d.warmups ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const handleStop = async (id: string) => {
    await fetch(`/api/warmup/${id}`, { method: "DELETE" });
    setWarmups((prev) => prev.filter((w) => w.id !== id));
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <Flame size={22} color="#f97316" />
          <h1 className="page-title" style={{ marginBottom: 0 }}>Aquecimento de Contas</h1>
        </div>
        <button
          onClick={() => void load()}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", padding: "0.4rem", borderRadius: "8px" }}
        >
          <RefreshCw size={17} />
        </button>
      </div>

      <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "1.5rem" }}>
        Contas em aquecimento postam com intervalo maior até atingir a meta, depois voltam ao ritmo normal automaticamente. Ideal para contas novas ou sensíveis.
      </p>

      {loading ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-secondary)" }}>
          <Loader2 size={28} style={{ animation: "spin 1s linear infinite", margin: "0 auto 0.5rem" }} />
        </div>
      ) : warmups.length === 0 ? (
        <>
          <div style={{
            padding: "1.5rem", borderRadius: "12px",
            background: "rgba(255,255,255,0.02)", border: "1px solid var(--border-color)",
            marginBottom: "1.5rem", textAlign: "center",
            color: "var(--text-secondary)", fontSize: "0.88rem",
          }}>
            Nenhuma conta em aquecimento. Ative o aquecimento nos 3 pontinhos (···) de uma conta na aba{" "}
            <a href="/accounts" style={{ color: "var(--accent-gold)", textDecoration: "none" }}>Contas</a>.
          </div>

          <div style={{
            padding: "1.5rem", borderRadius: "12px",
            background: "rgba(249,115,22,0.06)", border: "1px solid rgba(249,115,22,0.2)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
              <Flame size={18} color="#f97316" />
              <h2 style={{ fontSize: "0.95rem", fontWeight: 700, color: "#fb923c" }}>Como funciona o aquecimento</h2>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", fontSize: "0.82rem", color: "var(--text-secondary)", lineHeight: 1.55 }}>
              <p>• <strong style={{ color: "#fff" }}>Controle de Frequência:</strong> Contas em aquecimento são limitadas a <strong style={{ color: "#fff" }}>1 post por intervalo configurado</strong> (recomendamos de 120 a 180 minutos para maior segurança).</p>
              <p>• <strong style={{ color: "#fff" }}>Transição Automática:</strong> Após atingir a meta total de posts definida, a conta sai automaticamente do modo de segurança e retorna ao ritmo padrão de postagens (até 4 posts por hora).</p>
              <p>• <strong style={{ color: "#fff" }}>Operação Isolada:</strong> O processo de aquecimento é individual. Outras contas na sua dashboard continuam operando normalmente sem interferências.</p>
              <p>• <strong style={{ color: "#fff" }}>Monitoramento em Tempo Real:</strong> Cada postagem bem-sucedida incrementa o contador e a barra de progresso automaticamente, permitindo que você acompanhe a evolução.</p>
              <p>• <strong style={{ color: "#fff" }}>Prevenção de Bloqueios:</strong> Altamente recomendado para <strong style={{ color: "#fb923c" }}>#ContasNovas</strong> ou perfis que sofreram <strong style={{ color: "#fb923c" }}>#RateLimit</strong> recentemente pelo Instagram.</p>
              <p>• <strong style={{ color: "#fff" }}>Dica de Especialista:</strong> Mantenha o aquecimento ativo por pelo menos 7 dias em contas recém-criadas para construir autoridade. <strong style={{ color: "#fb923c" }}>#SegurançaDigital #InstagramGrowth</strong></p>
            </div>
          </div>
        </>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {warmups.map((w) => {
            const pct = Math.min(100, Math.round((w.completedPosts / w.targetPosts) * 100));
            return (
              <div key={w.id} style={{
                padding: "1.25rem", borderRadius: "12px",
                background: "rgba(249,115,22,0.05)", border: "1px solid rgba(249,115,22,0.2)",
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    {w.account.profilePictureUrl ? (
                      <img src={w.account.profilePictureUrl} alt={w.account.username}
                        style={{ width: "38px", height: "38px", borderRadius: "50%", objectFit: "cover" }} />
                    ) : (
                      <div style={{
                        width: "38px", height: "38px", borderRadius: "50%",
                        background: "linear-gradient(135deg,#833ab4,#fd1d1d,#fcb045)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontWeight: 700, color: "#fff",
                      }}>
                        {w.account.username.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <p style={{ fontWeight: 600 }}>@{w.account.username}</p>
                      <p style={{ fontSize: "0.75rem", color: "#fb923c" }}>
                        Intervalo: {w.intervalMinutes}min · Meta: {w.targetPosts} posts
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => void handleStop(w.id)}
                    title="Parar aquecimento"
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", padding: "0.4rem" }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <BarChart2 size={14} color="#fb923c" />
                  <div style={{ flex: 1, height: "6px", borderRadius: "999px", background: "rgba(249,115,22,0.15)", overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: "linear-gradient(90deg,#f97316,#fb923c)", borderRadius: "999px", transition: "width 0.5s ease" }} />
                  </div>
                  <span style={{ fontSize: "0.75rem", color: "#fb923c", fontWeight: 700, minWidth: "60px", textAlign: "right" }}>
                    {w.completedPosts}/{w.targetPosts} ({pct}%)
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
