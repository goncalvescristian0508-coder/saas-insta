"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";

const PERIODS = [
  { id: "hoje",   label: "Hoje" },
  { id: "ontem",  label: "Ontem" },
  { id: "7dias",  label: "Últimos 7 dias" },
  { id: "1mes",   label: "1 Mês" },
  { id: "maximo", label: "Máximo" },
];

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  APPROVED:  { label: "Aprovada",  color: "#22c55e" },
  PENDING:   { label: "Pendente",  color: "#FFD54F" },
  REFUNDED:  { label: "Reembolso", color: "#60a5fa" },
  CANCELLED: { label: "Cancelada", color: "#ef4444" },
};

function fmtCurrency(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

interface Sale {
  id: string; gateway: string; amount: number; status: string;
  customerName: string | null; igUsername: string | null;
  planName: string | null; createdAt: string;
}
interface TopItem { igUsername?: string | null; planName?: string | null; count: number; revenue: number; }
interface DashboardData {
  stats: { approvedCount: number; approvedRevenue: number; pendingCount: number; totalCount: number };
  sales: Sale[];
  topAccounts: TopItem[];
  topProducts: TopItem[];
}

export default function DashboardSales({ accounts, firstName }: { accounts: number; firstName: string }) {
  const [period,    setPeriod]    = useState("hoje");
  const [data,      setData]      = useState<DashboardData | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [spinning,  setSpinning]  = useState(false);
  const [dropOpen,  setDropOpen]  = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  const load = useCallback((p: string, showSpin = false) => {
    if (showSpin) setSpinning(true);
    else setLoading(true);
    fetch(`/api/sales?period=${p}&limit=10`)
      .then((r) => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => { setLoading(false); setSpinning(false); });
  }, []);

  useEffect(() => { load(period); }, [period, load]);

  // close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setDropOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const stats       = data?.stats;
  const topAccounts = data?.topAccounts ?? [];
  const topProducts = data?.topProducts ?? [];
  const sales       = data?.sales ?? [];
  const maxAcc      = topAccounts[0]?.revenue ?? 1;
  const maxProd     = topProducts[0]?.revenue ?? 1;

  const conversionPct = stats && stats.totalCount > 0
    ? Math.round((stats.approvedCount / stats.totalCount) * 100)
    : 0;

  const currentLabel = PERIODS.find((p) => p.id === period)?.label ?? "Hoje";

  return (
    <div>
      {/* ── Header row: greeting left, selector+refresh right ── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" }}>Olá, {firstName} 👋</div>
          <div style={{ fontSize: 13, color: "#555", marginTop: 3 }}>Visão geral das suas operações</div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Refresh button */}
          <button
            onClick={() => load(period, true)}
            title="Atualizar"
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 36, height: 36, borderRadius: 8,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              cursor: "pointer", color: "#666",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "#FFD54F"; e.currentTarget.style.borderColor = "rgba(255,213,79,0.3)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "#666"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}
          >
            <RefreshCw size={14} style={{ transition: "transform 0.5s", transform: spinning ? "rotate(360deg)" : "none" }} />
          </button>

          {/* Period dropdown */}
          <div ref={dropRef} style={{ position: "relative" }}>
            <button
              onClick={() => setDropOpen((v) => !v)}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "7px 14px", borderRadius: 8,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "#FFD54F", fontSize: 13, fontWeight: 600,
                cursor: "pointer", fontFamily: "inherit",
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(255,213,79,0.3)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}
            >
              <IcCalendar />
              {currentLabel}
              <IcChevron open={dropOpen} />
            </button>

            {dropOpen && (
              <div style={{
                position: "absolute", top: "calc(100% + 6px)", right: 0,
                background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 10, overflow: "hidden",
                boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
                minWidth: 180, zIndex: 100,
              }}>
                {PERIODS.map((p) => (
                  <button key={p.id} onClick={() => { setPeriod(p.id); setDropOpen(false); }}
                    style={{
                      display: "block", width: "100%", padding: "10px 16px",
                      textAlign: "left", background: period === p.id ? "rgba(255,213,79,0.1)" : "transparent",
                      border: "none", borderBottom: "1px solid rgba(255,255,255,0.05)",
                      color: period === p.id ? "#FFD54F" : "#bbb",
                      fontSize: 13, fontWeight: period === p.id ? 600 : 400,
                      cursor: "pointer", fontFamily: "inherit",
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={(e) => { if (period !== p.id) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                    onMouseLeave={(e) => { if (period !== p.id) e.currentTarget.style.background = "transparent"; }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 16 }}>
        <StatCard icon={<IcContas />}   iconBg="rgba(59,130,246,0.12)"  value={String(accounts)}                           label="Contas Conectadas" />
        <StatCard icon={<IcSales />}    iconBg="rgba(34,197,94,0.12)"   value={loading ? "—" : String(stats?.approvedCount ?? 0)}  label="Vendas Aprovadas" />
        <StatCard icon={<IcPending />}  iconBg="rgba(255,213,79,0.12)"  value={loading ? "—" : String(stats?.pendingCount ?? 0)}    label="Vendas Pendentes" />
        <StatCard icon={<IcMoney />}    iconBg="rgba(255,213,79,0.08)"  value={loading ? "—" : fmtCurrency(stats?.approvedRevenue ?? 0)} label="Total do Período" />
        {/* PIX Conversion */}
        <div style={{ background: "#141414", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: "18px 20px" }}>
          <div style={{ width: 36, height: 36, borderRadius: 9, background: "rgba(139,92,246,0.12)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
            <IcConversion />
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1 }}>
            {loading ? "—" : `${conversionPct}%`}
          </div>
          <div style={{ fontSize: 12, color: "#555", marginTop: 6, fontWeight: 500 }}>Conversão PIX</div>
          {!loading && stats && stats.totalCount > 0 && (
            <div style={{ marginTop: 8, height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
              <div style={{ height: 3, width: `${conversionPct}%`, background: "linear-gradient(90deg, #8b5cf6, #a78bfa)", borderRadius: 2 }} />
            </div>
          )}
        </div>
      </div>

      {/* ── Top Contas + Top Produtos ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <div className="panel">
          <PanelHead title="Top Contas" icon={<IcContas color="#FFD54F" />}>
            <Link href="/vendas" style={{ fontSize: 12, color: "#FFD54F", fontWeight: 500 }}>Ver tudo</Link>
          </PanelHead>
          <div style={{ padding: "16px 18px" }}>
            {topAccounts.length === 0 ? <EmptyMsg loading={loading} /> : topAccounts.map((a, i) => (
              <TopRow key={i} rank={i + 1} avatar={<AvatarIG />}
                name={`@${a.igUsername}`} meta={`${a.count} vendas`}
                pct={Math.round((a.revenue / maxAcc) * 100)} value={fmtCurrency(a.revenue)} />
            ))}
          </div>
        </div>

        <div className="panel">
          <PanelHead title="Top Produtos" icon={<IcPackage color="#FFD54F" />} />
          <div style={{ padding: "16px 18px" }}>
            {topProducts.length === 0 ? <EmptyMsg loading={loading} /> : topProducts.map((p, i) => (
              <TopRow key={i} rank={i + 1} avatar={<AvatarPkg />}
                name={p.planName ?? "—"} meta={`${p.count} vendas`}
                pct={Math.round((p.revenue / maxProd) * 100)} value={fmtCurrency(p.revenue)} />
            ))}
          </div>
        </div>
      </div>

      {/* ── Transactions ── */}
      <div className="panel">
        <PanelHead title="Últimas Transações" icon={<IcSales color="#FFD54F" />}>
          <Link href="/vendas" style={{ fontSize: 12, color: "#FFD54F", fontWeight: 500 }}>Ver todas</Link>
        </PanelHead>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["ID", "Conta", "Produto", "Valor", "Data", "Status"].map((h) => (
                  <th key={h} style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase",
                    letterSpacing: "0.07em", color: "#444", padding: "10px 16px", textAlign: "left",
                    borderBottom: "1px solid rgba(255,255,255,0.05)", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sales.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: "24px 16px", textAlign: "center", color: "#444", fontSize: 13 }}>
                  {loading ? "Carregando..." : "Nenhuma transação no período"}
                </td></tr>
              ) : sales.map((s) => {
                const cfg = STATUS_MAP[s.status] ?? STATUS_MAP.PENDING;
                return (
                  <tr key={s.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <td style={{ padding: "13px 16px", fontSize: 12, color: "#555" }}>#{s.id.slice(0, 8).toUpperCase()}</td>
                    <td style={{ padding: "13px 16px", fontSize: 13 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 26, height: 26, borderRadius: "50%", background: "rgba(139,92,246,0.15)",
                          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <IcInsta size={12} color="#8b5cf6" />
                        </div>
                        <span style={{ color: "#ddd", fontWeight: 500 }}>{s.igUsername ? `@${s.igUsername}` : "—"}</span>
                      </div>
                    </td>
                    <td style={{ padding: "13px 16px", fontSize: 13, color: "#bbb" }}>{s.planName ?? "—"}</td>
                    <td style={{ padding: "13px 16px", fontSize: 13, fontWeight: 600, color: "#FFD54F" }}>{fmtCurrency(s.amount)}</td>
                    <td style={{ padding: "13px 16px", fontSize: 13, color: "#555" }}>{fmtDate(s.createdAt)}</td>
                    <td style={{ padding: "13px 16px" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px",
                        borderRadius: 20, fontSize: 11.5, fontWeight: 600, background: cfg.color + "1e", color: cfg.color }}>
                        <span style={{ width: 5, height: 5, borderRadius: "50%", background: cfg.color, display: "inline-block" }} />
                        {cfg.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function StatCard({ icon, iconBg, value, label }: { icon: React.ReactNode; iconBg: string; value: string; label: string }) {
  return (
    <div style={{ background: "#141414", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: "18px 20px" }}>
      <div style={{ width: 36, height: 36, borderRadius: 9, background: iconBg, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
        {icon}
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 12, color: "#555", marginTop: 6, fontWeight: 500 }}>{label}</div>
    </div>
  );
}

function PanelHead({ title, icon, children }: { title: string; icon: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div style={{ padding: "14px 18px", borderBottom: "1px solid rgba(255,255,255,0.05)",
      display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, fontWeight: 600, color: "#e0e0e0" }}>
        {icon}{title}
      </div>
      {children}
    </div>
  );
}

function TopRow({ rank, avatar, name, meta, pct, value }: {
  rank: number; avatar: React.ReactNode; name: string; meta: string; pct: number; value: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
      <div style={{ width: 22, fontSize: 12, color: "#444", fontWeight: 600, flexShrink: 0 }}>#{rank}</div>
      <div style={{ width: 34, height: 34, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>{avatar}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#ddd", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
        <div style={{ fontSize: 11, color: "#555", marginTop: 1 }}>{meta}</div>
        <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2, marginTop: 6 }}>
          <div style={{ height: 3, width: `${pct}%`, background: "linear-gradient(90deg, #FFD54F, #c9920a)", borderRadius: 2 }} />
        </div>
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#FFD54F", flexShrink: 0 }}>{value}</div>
    </div>
  );
}

function EmptyMsg({ loading }: { loading: boolean }) {
  return <p style={{ fontSize: 13, color: "#444", textAlign: "center", padding: "20px 0" }}>{loading ? "Carregando..." : "Sem dados para o período"}</p>;
}

function AvatarIG() {
  return <div style={{ width: 34, height: 34, borderRadius: "50%", background: "rgba(139,92,246,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}><IcInsta size={15} color="#8b5cf6" /></div>;
}
function AvatarPkg() {
  return <div style={{ width: 34, height: 34, borderRadius: "50%", background: "rgba(255,107,53,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}><IcPackage size={15} color="#FFD54F" /></div>;
}

// ── Icons ───────────────────────────────────────────────────────────────────

const S = { strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

function IcCalendar() {
  return <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" {...S}><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/></svg>;
}
function IcChevron({ open }: { open: boolean }) {
  return <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" {...S} style={{ transition: "transform 0.2s", transform: open ? "rotate(180deg)" : "none" }}><path d="M6 9l6 6 6-6"/></svg>;
}
function IcContas({ size = 17, color = "#60a5fa" }: { size?: number; color?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} {...S}><circle cx="9" cy="8" r="3.5"/><path d="M3 19c0-3.314 2.686-6 6-6s6 2.686 6 6"/><path d="M16 11c1.657 0 3 1.343 3 3M19 14c1.105 0 2 .895 2 2s-.895 2-2 2"/></svg>;
}
function IcSales({ size = 17, color = "#22c55e" }: { size?: number; color?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} {...S}><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>;
}
function IcPending({ size = 17, color = "#FFD54F" }: { size?: number; color?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} {...S}><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/></svg>;
}
function IcMoney({ size = 17, color = "#FFD54F" }: { size?: number; color?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} {...S}><path d="M22 7l-9.5 9.5-5-5L2 17"/><path d="M16 7h6v6"/></svg>;
}
function IcConversion({ size = 17 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" {...S}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>;
}
function IcPackage({ size = 15, color = "#FFD54F" }: { size?: number; color?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} {...S}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12"/></svg>;
}
function IcInsta({ size = 13, color = "#8b5cf6" }: { size?: number; color?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} {...S}><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill={color} stroke="none"/></svg>;
}
