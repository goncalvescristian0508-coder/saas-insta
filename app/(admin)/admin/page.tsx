"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  Loader2, Users, Share2, CheckCircle2, XCircle, Clock,
  DollarSign, BarChart2, TrendingUp, TrendingDown, AlertTriangle,
  MessageSquare, Trash2, Send, ChevronRight, Search,
  Download, Megaphone, RefreshCw, X, Activity, CreditCard, Zap, Calendar,
} from "lucide-react";

/* ═══════════════════════ types ═══════════════════════ */
interface StatsRevenue { approvedRevenue: number; approvedCount: number; pendingCount: number; pendingRevenue: number; refundedRevenue: number; mrr: number; lastMrr: number; arr: number; ticketMedio: number; mrrGrowth: number; }
interface StatsUsers   { total: number; newInPeriod: number; activeUsers7d: number; activeUsers30d: number; withNoAccounts: number; whoNeverPosted: number; churn30d: number; }
interface StatsPosts   { totalInPeriod: number; doneInPeriod: number; failedInPeriod: number; successRate: number; }
interface Gateway      { gateway: string; count: number; revenue: number; }
interface TopAccount   { igUsername: string; count: number; revenue: number; }
interface Plan         { planName: string; count: number; revenue: number; }
interface Sale         { id: string; gateway: string; amount: number; status: string; customerName?: string; igUsername?: string; planName?: string; createdAt: string; }
interface StatsData    { revenue: StatsRevenue; users: StatsUsers; posts: StatsPosts; gateways: Gateway[]; topAccounts: TopAccount[]; plans: Plan[]; recentSales: Sale[]; }

interface OAuthAccount   { id: string; username: string; profilePictureUrl?: string; lastError?: string; createdAt: string; }
interface PrivateAccount { id: string; username: string; lastError?: string; }
interface UserRow {
  id: string; email: string; name: string | null; createdAt: string;
  adminMessage: string | null; adminMessageAt: string | null;
  oauthAccounts: OAuthAccount[]; privateAccounts: PrivateAccount[];
  videoCount: number; postsTotal: number; postsDone: number; postsFailed: number;
  lastActivity: string | null; revenue: number; salesCount: number;
}
interface RecentPost { id: string; userId: string; accountUsername: string; videoName: string; caption: string; status: string; createdAt: string; errorMsg?: string; }
interface OverviewData { stats: { totalUsers: number; totalOAuthAccounts: number; globalRevenue: number; globalSalesCount: number; totalVideos: number; totalPostsDone: number; }; users: UserRow[]; recentPosts: RecentPost[]; }

/* ═══════════════════════ helpers ═══════════════════════ */
function fmtBRL(v: number) { return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function timeAgo(iso: string) {
  const d = Date.now() - new Date(iso).getTime(), m = Math.floor(d / 60000);
  if (m < 1) return "agora"; if (m < 60) return `${m}m atrás`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h atrás`;
  return `${Math.floor(h / 24)}d atrás`;
}
function fmtDate(iso: string) { return new Date(iso).toLocaleDateString("pt-BR"); }

const ST_COLOR: Record<string, string> = { DONE: "#22c55e", FAILED: "#ef4444", PENDING: "#f59e0b", RUNNING: "#3b82f6" };
const ST_LABEL: Record<string, string> = { DONE: "Publicado", FAILED: "Falhou", PENDING: "Pendente", RUNNING: "Executando", APPROVED: "Aprovado", REFUNDED: "Reembolso", CANCELLED: "Cancelado" };
const SALE_COLOR: Record<string, string> = { APPROVED: "#22c55e", PENDING: "#f59e0b", REFUNDED: "#a855f7", CANCELLED: "#ef4444" };

const PERIODS = [
  { label: "Hoje",   value: "hoje" },
  { label: "Ontem",  value: "ontem" },
  { label: "7 dias", value: "7dias" },
  { label: "1 mês",  value: "1mes" },
  { label: "Máximo", value: "maximo" },
];

/* ═══════════════════════ ui primitives ═══════════════════════ */
function Spinner() {
  return (
    <div style={{ display: "flex", justifyContent: "center", paddingTop: "3rem" }}>
      <Loader2 size={22} color="#FFD54F" style={{ animation: "spin 1s linear infinite" }} />
    </div>
  );
}

function PeriodSelector({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: "flex", gap: ".25rem", background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 10, padding: "3px" }}>
      {PERIODS.map(p => (
        <button key={p.value} onClick={() => onChange(p.value)} style={{
          padding: "5px 14px", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer",
          background: value === p.value ? "rgba(255,213,79,.18)" : "transparent",
          border: value === p.value ? "1px solid rgba(255,213,79,.32)" : "1px solid transparent",
          color: value === p.value ? "#FFD54F" : "#666",
          transition: "all .15s",
          fontFamily: "var(--font-sans)",
        }}>{p.label}</button>
      ))}
    </div>
  );
}

function StatCard({ label, value, sub, color, icon: Icon }: {
  label: string; value: string | number; sub?: string; color: string; icon: React.ElementType;
}) {
  const vStr = String(value);
  const fontSize = vStr.length > 12 ? 16 : vStr.length > 8 ? 20 : 26;
  return (
    <div style={{
      background: "#141414",
      borderTop: `2px solid ${color}`,
      borderRight: "1px solid rgba(255,255,255,.06)",
      borderBottom: "1px solid rgba(255,255,255,.06)",
      borderLeft: "1px solid rgba(255,255,255,.06)",
      borderRadius: 13,
      padding: "1.25rem 1.4rem",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: ".875rem" }}>
        <p style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: ".12em", fontWeight: 700 }}>{label}</p>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: `${color}1a`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Icon size={15} color={color} />
        </div>
      </div>
      <p style={{ fontSize, fontWeight: 800, color, lineHeight: 1, marginBottom: sub ? 5 : 0 }}>{value}</p>
      {sub && <p style={{ fontSize: 11, color: "#555", marginTop: 4 }}>{sub}</p>}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 10, fontWeight: 700, color: "#3a3a3a", textTransform: "uppercase", letterSpacing: ".14em", marginBottom: ".75rem" }}>
      {children}
    </p>
  );
}

function Panel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: "#141414", border: "1px solid rgba(255,255,255,.06)", borderRadius: 13, ...style }}>
      {children}
    </div>
  );
}

function PageHeader({ title, subtitle, right }: { title: string; subtitle: string; right?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: ".25rem" }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#fff", letterSpacing: "-0.02em", lineHeight: 1 }}>{title}</h1>
        <p style={{ fontSize: 13, color: "#555", marginTop: 6 }}>{subtitle}</p>
      </div>
      {right && <div style={{ display: "flex", gap: ".5rem", alignItems: "center" }}>{right}</div>}
    </div>
  );
}

/* ═══════════════════════ CSV export ═══════════════════════ */
function exportCSV(sales: Sale[], period: string) {
  const header = "ID,Gateway,Valor,Status,Cliente,Conta IG,Plano,Data";
  const rows = sales.map(s => [
    s.id, s.gateway, s.amount.toFixed(2), s.status,
    s.customerName ?? "", s.igUsername ?? "", s.planName ?? "",
    new Date(s.createdAt).toLocaleString("pt-BR"),
  ].join(","));
  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url;
  a.download = `vendas_${period}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

/* ═══════════════════════ dashboard tab ═══════════════════════ */
function DashboardTab() {
  const [period, setPeriod] = useState("hoje");
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/admin/stats?period=${period}`)
      .then(r => r.json()).then(setData).finally(() => setLoading(false));
  }, [period]);

  useEffect(() => { load(); }, [load]);

  const rev = data?.revenue ?? { approvedRevenue: 0, approvedCount: 0, pendingCount: 0, pendingRevenue: 0, refundedRevenue: 0, mrr: 0, lastMrr: 0, arr: 0, ticketMedio: 0, mrrGrowth: 0 };
  const users = data?.users ?? { total: 0, newInPeriod: 0, activeUsers7d: 0, activeUsers30d: 0, withNoAccounts: 0, whoNeverPosted: 0, churn30d: 0 };
  const posts = data?.posts ?? { totalInPeriod: 0, doneInPeriod: 0, failedInPeriod: 0, successRate: 0 };
  const gateways = data?.gateways ?? [];
  const topAccounts = data?.topAccounts ?? [];
  const recentSales = data?.recentSales ?? [];
  const totalGatewayRevenue = gateways.reduce((s, g) => s + g.revenue, 0);
  const growthStr = rev.mrrGrowth >= 0 ? `+${rev.mrrGrowth.toFixed(1)}%` : `${rev.mrrGrowth.toFixed(1)}%`;
  const growthColor = rev.mrrGrowth >= 0 ? "#FFD54F" : "#ef4444";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.75rem" }}>
      <PageHeader
        title="Painel Geral"
        subtitle="Métricas consolidadas de todos os usuários"
        right={
          <>
            <PeriodSelector value={period} onChange={setPeriod} />
            <button onClick={load} style={{ width: 34, height: 34, borderRadius: 9, background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.08)", color: "#555", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <RefreshCw size={14} />
            </button>
          </>
        }
      />

      {loading ? <Spinner /> : (
        <>
          {/* Revenue */}
          <div>
            <SectionLabel>Receita</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: ".75rem" }}>
              <StatCard label="Faturamento" value={fmtBRL(rev.approvedRevenue)} sub={`${rev.approvedCount} venda${rev.approvedCount !== 1 ? "s" : ""}`} color="#22c55e" icon={DollarSign} />
              <StatCard label="MRR" value={fmtBRL(rev.mrr)} sub="receita mensal recorrente" color="#3b82f6" icon={BarChart2} />
              <StatCard label="ARR" value={fmtBRL(rev.arr)} sub="receita anual recorrente" color="#f97316" icon={TrendingUp} />
              <StatCard label="Ticket Médio" value={fmtBRL(rev.ticketMedio)} sub="por transação" color="#60a5fa" icon={CreditCard} />
              <StatCard label="Variação" value={growthStr} sub="vs. período anterior" color={growthColor} icon={Zap} />
            </div>
          </div>

          {/* Users */}
          <div>
            <SectionLabel>Usuários</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: ".75rem" }}>
              <StatCard label="Total de Usuários" value={users.total} sub="desde o início" color="#a855f7" icon={Users} />
              <StatCard label="Ativos (7 dias)" value={users.activeUsers7d} sub="com login recente" color="#22c55e" icon={CheckCircle2} />
              <StatCard label="Churn (30 dias)" value={users.churn30d} sub="sem postagem em 30 dias" color="#f97316" icon={TrendingDown} />
              <StatCard label="Nunca Postaram" value={users.whoNeverPosted} sub="sem nenhuma publicação" color="#f59e0b" icon={AlertTriangle} />
            </div>
          </div>

          {/* Engagement */}
          <div>
            <SectionLabel>Engajamento</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: ".75rem" }}>
              <StatCard label="Posts no Período" value={posts.totalInPeriod} sub="tentativas de publicação" color="#3b82f6" icon={Calendar} />
              <StatCard label="Publicados" value={posts.doneInPeriod} sub="confirmados pelo Instagram" color="#22c55e" icon={CheckCircle2} />
              <StatCard label="Taxa de Sucesso" value={`${posts.successRate.toFixed(1)}%`} sub="aproveitamento geral" color={posts.successRate >= 90 ? "#22c55e" : posts.successRate >= 70 ? "#f59e0b" : "#ef4444"} icon={TrendingUp} />
              <StatCard label="Falhas" value={posts.failedInPeriod} sub="posts com erro" color="#ef4444" icon={XCircle} />
            </div>
          </div>

          {/* Gateway + Top accounts */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <Panel style={{ padding: "1.25rem 1.4rem" }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: "#e0e0e0", marginBottom: "1.1rem" }}>Gateway de Pagamento</p>
              {gateways.length === 0
                ? <p style={{ fontSize: 12, color: "#444" }}>Sem vendas no período</p>
                : (
                  <div style={{ display: "flex", flexDirection: "column", gap: ".875rem" }}>
                    {gateways.map(g => {
                      const pct = totalGatewayRevenue > 0 ? (g.revenue / totalGatewayRevenue) * 100 : 0;
                      const clrs: Record<string, string> = { pushinpay: "#22c55e", wiinpay: "#3b82f6", syncpay: "#a855f7", apexvips: "#f97316" };
                      const c = clrs[g.gateway] ?? "#FFD54F";
                      return (
                        <div key={g.gateway}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 7 }}>
                            <span style={{ fontSize: 13, fontWeight: 600, textTransform: "capitalize" }}>{g.gateway}</span>
                            <span style={{ fontSize: 12, color: "#aaa" }}>{fmtBRL(g.revenue)} <span style={{ color: "#555" }}>({g.count})</span></span>
                          </div>
                          <div style={{ height: 4, background: "rgba(255,255,255,.06)", borderRadius: 3, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${pct}%`, background: c, borderRadius: 3 }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
            </Panel>

            <Panel style={{ padding: "1.25rem 1.4rem" }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: "#e0e0e0", marginBottom: "1.1rem" }}>Top Contas Conversoras</p>
              {topAccounts.length === 0
                ? <p style={{ fontSize: 12, color: "#444" }}>Sem dados</p>
                : (
                  <div style={{ display: "flex", flexDirection: "column", gap: ".65rem" }}>
                    {topAccounts.slice(0, 6).map((a, i) => (
                      <div key={a.igUsername} style={{ display: "flex", alignItems: "center", gap: ".65rem" }}>
                        <span style={{ fontSize: 11, color: "#444", width: 16, textAlign: "right", flexShrink: 0 }}>#{i + 1}</span>
                        <div style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(255,213,79,.12)", border: "1px solid rgba(255,213,79,.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <Share2 size={11} color="#FFD54F" />
                        </div>
                        <span style={{ flex: 1, fontSize: 12, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>@{a.igUsername}</span>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <p style={{ fontSize: 12, fontWeight: 700, color: "#22c55e" }}>{fmtBRL(a.revenue)}</p>
                          <p style={{ fontSize: 10, color: "#555" }}>{a.count} venda{a.count !== 1 ? "s" : ""}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
            </Panel>
          </div>

          {/* Recent sales */}
          <Panel>
            <div style={{ padding: "1rem 1.4rem", borderBottom: "1px solid rgba(255,255,255,.05)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: "#e0e0e0" }}>
                Vendas Recentes <span style={{ color: "#555", fontWeight: 400, fontSize: 12 }}>({recentSales.length})</span>
              </p>
              <button onClick={() => exportCSV(recentSales, period)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 14px", borderRadius: 8, background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.08)", color: "#aaa", fontSize: 12, cursor: "pointer", fontWeight: 600, fontFamily: "var(--font-sans)" }}>
                <Download size={12} /> Exportar CSV
              </button>
            </div>
            {recentSales.length === 0
              ? <p style={{ padding: "2.5rem", textAlign: "center", fontSize: 13, color: "#444" }}>Sem vendas no período</p>
              : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>{["Gateway", "Valor", "Status", "Cliente", "Conta IG", "Plano", "Data"].map(h => (
                        <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#444", textTransform: "uppercase", letterSpacing: ".08em", borderBottom: "1px solid rgba(255,255,255,.05)" }}>{h}</th>
                      ))}</tr>
                    </thead>
                    <tbody>
                      {recentSales.map((s, i) => (
                        <tr key={s.id} style={{ borderBottom: i < recentSales.length - 1 ? "1px solid rgba(255,255,255,.04)" : "none" }}>
                          <td style={{ padding: "11px 16px", fontSize: 12, fontWeight: 600, textTransform: "capitalize" }}>{s.gateway}</td>
                          <td style={{ padding: "11px 16px", fontSize: 13, fontWeight: 700, color: SALE_COLOR[s.status] ?? "#aaa" }}>{fmtBRL(s.amount)}</td>
                          <td style={{ padding: "11px 16px" }}>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, color: SALE_COLOR[s.status] ?? "#aaa", background: `${SALE_COLOR[s.status] ?? "#888"}18` }}>
                              <span style={{ width: 5, height: 5, borderRadius: "50%", background: SALE_COLOR[s.status] ?? "#888", flexShrink: 0 }} />
                              {ST_LABEL[s.status] ?? s.status}
                            </span>
                          </td>
                          <td style={{ padding: "11px 16px", fontSize: 12, color: "#888" }}>{s.customerName ?? "—"}</td>
                          <td style={{ padding: "11px 16px", fontSize: 12, color: "#888" }}>{s.igUsername ? `@${s.igUsername}` : "—"}</td>
                          <td style={{ padding: "11px 16px", fontSize: 12, color: "#888" }}>{s.planName ?? "—"}</td>
                          <td style={{ padding: "11px 16px", fontSize: 11, color: "#555" }}>{timeAgo(s.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
          </Panel>
        </>
      )}
    </div>
  );
}

/* ═══════════════════════ planos tab ═══════════════════════ */
function PlanosTab() {
  const [period, setPeriod] = useState("maximo");
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/admin/stats?period=${period}`).then(r => r.json()).then(setData).finally(() => setLoading(false));
  }, [period]);

  const plans = data?.plans ?? [];
  const totalRevenue = data?.revenue.approvedRevenue ?? 0;
  const PLAN_COLORS = ["#FFD54F", "#22c55e", "#3b82f6", "#a855f7", "#f97316", "#f59e0b"];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.75rem" }}>
      <PageHeader
        title="Planos & Produtos"
        subtitle="Vendas agrupadas por plano"
        right={<PeriodSelector value={period} onChange={setPeriod} />}
      />

      {loading ? <Spinner /> : plans.length === 0 ? (
        <Panel style={{ padding: "3rem", textAlign: "center" }}>
          <p style={{ fontSize: 13, color: "#444" }}>Nenhuma venda com plano identificado no período</p>
        </Panel>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: ".875rem" }}>
          {plans.map((plan, i) => {
            const pct = totalRevenue > 0 ? (plan.revenue / totalRevenue) * 100 : 0;
            const c = PLAN_COLORS[i % PLAN_COLORS.length];
            return (
              <div key={plan.planName} style={{ background: "#141414", borderTop: `2px solid ${c}`, borderRight: "1px solid rgba(255,255,255,.06)", borderBottom: "1px solid rgba(255,255,255,.06)", borderLeft: "1px solid rgba(255,255,255,.06)", borderRadius: 13, padding: "1.25rem 1.5rem" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: ".875rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: ".75rem" }}>
                    <div style={{ width: 36, height: 36, borderRadius: 9, background: `${c}1a`, border: `1px solid ${c}33`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: c }}>
                      #{i + 1}
                    </div>
                    <div>
                      <p style={{ fontSize: 15, fontWeight: 700, color: "#f0f0f0" }}>{plan.planName}</p>
                      <p style={{ fontSize: 12, color: "#555" }}>{plan.count} venda{plan.count !== 1 ? "s" : ""} aprovada{plan.count !== 1 ? "s" : ""}</p>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <p style={{ fontSize: 20, fontWeight: 800, color: c }}>{fmtBRL(plan.revenue)}</p>
                    <p style={{ fontSize: 12, color: "#555" }}>{pct.toFixed(1)}% do total</p>
                  </div>
                </div>
                <div style={{ height: 4, background: "rgba(255,255,255,.05)", borderRadius: 4, overflow: "hidden", marginBottom: 8 }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: c, borderRadius: 4 }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 11, color: "#555" }}>Ticket médio: {fmtBRL(plan.count > 0 ? plan.revenue / plan.count : 0)}</span>
                  <span style={{ fontSize: 11, color: "#555" }}>Preço mensal: <span style={{ color: "#FFD54F" }}>a definir</span></span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════ usuarios tab ═══════════════════════ */
function UsuariosTab({ users, recentPosts, onRefresh }: { users: UserRow[]; recentPosts: RecentPost[]; onRefresh: () => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<"message" | "delete" | null>(null);
  const [msgText, setMsgText] = useState("");
  const [busy, setBusy] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const filtered = users.filter(u =>
    !search ||
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    (u.name?.toLowerCase().includes(search.toLowerCase())) ||
    u.oauthAccounts.some(a => a.username.toLowerCase().includes(search.toLowerCase()))
  );

  const selUser = users.find(u => u.id === selected) ?? null;
  const userPosts = selUser ? recentPosts.filter(p => p.userId === selUser.id).slice(0, 15) : [];

  async function sendMessage() {
    if (!selUser || !msgText.trim()) return;
    setBusy(true);
    await fetch("/api/admin/send-message", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: selUser.id, message: msgText }) });
    setBusy(false); setModal(null); onRefresh();
  }

  async function clearMessage() {
    if (!selUser) return;
    setBusy(true);
    await fetch("/api/admin/send-message", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: selUser.id }) });
    setBusy(false); setModal(null); onRefresh();
  }

  async function deleteUser() {
    if (!selUser) return;
    setBusy(true);
    await fetch(`/api/admin/users/${selUser.id}`, { method: "DELETE" });
    setBusy(false); setModal(null); setSelected(null); onRefresh();
  }

  async function revokeAccount(id: string) {
    setRevokingId(id);
    await fetch(`/api/admin/accounts/${id}`, { method: "DELETE" });
    setRevokingId(null); onRefresh();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <PageHeader title="Usuários" subtitle={`${users.length} usuário${users.length !== 1 ? "s" : ""} na plataforma`} />

      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: "1rem", alignItems: "start" }}>
        {/* List */}
        <Panel>
          <div style={{ padding: ".75rem", borderBottom: "1px solid rgba(255,255,255,.05)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: ".5rem", padding: "7px 10px", borderRadius: 9, background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.07)" }}>
              <Search size={12} color="#555" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..." style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 12, color: "#f0f0f0", fontFamily: "var(--font-sans)" }} />
            </div>
          </div>
          <div style={{ maxHeight: "calc(100vh - 320px)", overflowY: "auto" }}>
            {filtered.map(u => {
              const isActive = selected === u.id;
              return (
                <button key={u.id} onClick={() => { setSelected(u.id === selected ? null : u.id); setMsgText(u.adminMessage ?? ""); }}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: ".65rem", padding: ".8rem .875rem", background: isActive ? "rgba(255,213,79,.07)" : "transparent", border: "none", borderBottom: "1px solid rgba(255,255,255,.04)", borderLeft: isActive ? "2px solid rgba(255,213,79,.6)" : "2px solid transparent", cursor: "pointer", textAlign: "left" }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, background: isActive ? "rgba(255,213,79,.2)" : "rgba(255,255,255,.07)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: isActive ? "#FFD54F" : "#888" }}>
                    {(u.name ?? u.email)[0].toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 12, fontWeight: 600, color: isActive ? "#FFD54F" : "#e0e0e0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.name ?? u.email}</p>
                    <div style={{ display: "flex", gap: ".4rem", alignItems: "center" }}>
                      {u.oauthAccounts.length > 0 && <span style={{ fontSize: 10, color: "#555" }}><Share2 size={9} style={{ display: "inline", marginRight: 2 }} />{u.oauthAccounts.length}</span>}
                      {u.revenue > 0 && <span style={{ fontSize: 10, color: "#22c55e" }}>{fmtBRL(u.revenue)}</span>}
                      {u.adminMessage && <span style={{ fontSize: 9, padding: "1px 4px", borderRadius: 3, background: "rgba(255,213,79,.1)", color: "#FFD54F" }}>msg</span>}
                    </div>
                  </div>
                  <ChevronRight size={12} color={isActive ? "#FFD54F" : "#333"} style={{ flexShrink: 0, transform: isActive ? "rotate(90deg)" : "none", transition: "transform .15s" }} />
                </button>
              );
            })}
          </div>
        </Panel>

        {/* Detail */}
        {selUser ? (
          <Panel style={{ padding: "1.25rem", maxHeight: "calc(100vh - 280px)", overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", gap: ".875rem", marginBottom: "1.1rem" }}>
              <div style={{ width: 44, height: 44, borderRadius: 11, flexShrink: 0, background: "linear-gradient(135deg,rgba(255,213,79,.25),rgba(255,213,79,.08))", border: "1px solid rgba(255,213,79,.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700, color: "#FFD54F" }}>
                {(selUser.name ?? selUser.email)[0].toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                {selUser.name && <p style={{ fontWeight: 700, fontSize: 14, color: "#f0f0f0" }}>{selUser.name}</p>}
                <p style={{ fontSize: 12, color: "#666" }}>{selUser.email}</p>
                <p style={{ fontSize: 11, color: "#444" }}>Cadastrado {fmtDate(selUser.createdAt)}</p>
              </div>
            </div>

            <div style={{ display: "flex", gap: ".5rem", marginBottom: "1.1rem" }}>
              <button onClick={() => setModal("message")} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "8px", borderRadius: 9, background: "rgba(255,213,79,.1)", border: "1px solid rgba(255,213,79,.2)", color: "#FFD54F", fontSize: 12, cursor: "pointer", fontWeight: 600, fontFamily: "var(--font-sans)" }}>
                <MessageSquare size={13} /> {selUser.adminMessage ? "Editar msg" : "Enviar msg"}
              </button>
              <button onClick={() => setModal("delete")} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "8px", borderRadius: 9, background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.2)", color: "#f87171", fontSize: 12, cursor: "pointer", fontWeight: 600, fontFamily: "var(--font-sans)" }}>
                <Trash2 size={13} /> Deletar
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".5rem", marginBottom: "1.1rem" }}>
              {[
                { label: "Faturamento", value: fmtBRL(selUser.revenue), color: selUser.revenue > 0 ? "#22c55e" : "#444" },
                { label: "Vendas", value: selUser.salesCount, color: "#3b82f6" },
                { label: "Publicados", value: selUser.postsDone, color: "#22c55e" },
                { label: "Falhas", value: selUser.postsFailed, color: selUser.postsFailed > 0 ? "#ef4444" : "#444" },
              ].map(s => (
                <div key={s.label} style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)", borderRadius: 9, padding: ".75rem" }}>
                  <p style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 5 }}>{s.label}</p>
                  <p style={{ fontSize: 18, fontWeight: 700, color: s.color }}>{s.value}</p>
                </div>
              ))}
            </div>

            {selUser.adminMessage && (
              <div style={{ padding: ".75rem", borderRadius: 9, background: "rgba(255,213,79,.06)", border: "1px solid rgba(255,213,79,.15)", marginBottom: "1.1rem" }}>
                <p style={{ fontSize: 11, color: "#FFD54F", fontWeight: 700, marginBottom: 3 }}>Mensagem ativa</p>
                <p style={{ fontSize: 12, color: "#ccc" }}>{selUser.adminMessage}</p>
              </div>
            )}

            <p style={{ fontSize: 10, fontWeight: 700, color: "#444", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: ".5rem" }}>Contas IG ({selUser.oauthAccounts.length})</p>
            {selUser.oauthAccounts.length === 0
              ? <p style={{ fontSize: 12, color: "#444", marginBottom: "1rem" }}>Nenhuma</p>
              : (
                <div style={{ display: "flex", flexDirection: "column", gap: ".4rem", marginBottom: "1rem" }}>
                  {selUser.oauthAccounts.map(acc => (
                    <div key={acc.id} style={{ display: "flex", alignItems: "center", gap: ".6rem", padding: ".5rem .75rem", borderRadius: 9, background: acc.lastError ? "rgba(239,68,68,.06)" : "rgba(34,197,94,.06)", border: `1px solid ${acc.lastError ? "rgba(239,68,68,.2)" : "rgba(34,197,94,.2)"}` }}>
                      {acc.profilePictureUrl
                        ? <img src={acc.profilePictureUrl} alt="" style={{ width: 22, height: 22, borderRadius: "50%" }} />
                        : <div style={{ width: 22, height: 22, borderRadius: "50%", background: "rgba(255,255,255,.08)", display: "flex", alignItems: "center", justifyContent: "center" }}><Share2 size={10} color="#888" /></div>}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 12, fontWeight: 600, color: acc.lastError ? "#f87171" : "#4ade80" }}>@{acc.username}</p>
                        {acc.lastError && <p style={{ fontSize: 10, color: "#f87171", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{acc.lastError}</p>}
                      </div>
                      <button onClick={() => revokeAccount(acc.id)} disabled={revokingId === acc.id} style={{ background: "none", border: "none", cursor: "pointer", color: "#555", display: "flex", padding: "2px" }}>
                        {revokingId === acc.id ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> : <XCircle size={12} />}
                      </button>
                    </div>
                  ))}
                </div>
              )}

            {userPosts.length > 0 && (
              <>
                <p style={{ fontSize: 10, fontWeight: 700, color: "#444", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: ".5rem" }}>Atividade</p>
                <div style={{ display: "flex", flexDirection: "column", gap: ".35rem" }}>
                  {userPosts.map(p => (
                    <div key={p.id} style={{ display: "flex", alignItems: "center", gap: ".6rem", padding: ".45rem .7rem", borderRadius: 8, background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.05)" }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: ST_COLOR[p.status] ?? "#888", flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 11, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>@{p.accountUsername}</p>
                        <p style={{ fontSize: 10, color: "#555", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.videoName}</p>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <p style={{ fontSize: 10, color: ST_COLOR[p.status] ?? "#888", fontWeight: 600 }}>{ST_LABEL[p.status] ?? p.status}</p>
                        <p style={{ fontSize: 9, color: "#444" }}>{timeAgo(p.createdAt)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Panel>
        ) : (
          <Panel style={{ padding: "3rem", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: ".75rem", minHeight: 280 }}>
            <Users size={28} color="#333" />
            <p style={{ fontSize: 13, color: "#444" }}>Selecione um usuário</p>
          </Panel>
        )}
      </div>

      {/* Message modal */}
      {modal === "message" && selUser && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setModal(null)}>
          <div style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,.08)", borderRadius: 16, padding: "1.75rem", width: 420, maxWidth: "90vw" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem" }}>
              <h3 style={{ fontSize: "1rem", fontWeight: 700 }}>Mensagem para {selUser.name ?? selUser.email}</h3>
              <button onClick={() => setModal(null)} style={{ background: "none", border: "none", color: "#666", cursor: "pointer" }}><X size={16} /></button>
            </div>
            <textarea value={msgText} onChange={e => setMsgText(e.target.value)} rows={4} placeholder="Digite a mensagem..."
              style={{ width: "100%", padding: "10px 12px", borderRadius: 10, background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.1)", color: "#f0f0f0", fontSize: 13, resize: "vertical", outline: "none", fontFamily: "var(--font-sans)", marginBottom: ".75rem" }} />
            <div style={{ display: "flex", gap: ".6rem", justifyContent: "flex-end" }}>
              {selUser.adminMessage && <button onClick={clearMessage} disabled={busy} style={{ padding: "7px 14px", borderRadius: 8, background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)", color: "#aaa", fontSize: 13, cursor: "pointer", fontWeight: 600, fontFamily: "var(--font-sans)" }}>Remover</button>}
              <button onClick={sendMessage} disabled={busy || !msgText.trim()} style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 14px", borderRadius: 8, background: "rgba(255,213,79,.15)", border: "1px solid rgba(255,213,79,.3)", color: "#FFD54F", fontSize: 13, cursor: "pointer", fontWeight: 600, fontFamily: "var(--font-sans)" }}>
                {busy ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Send size={13} />} Enviar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete modal */}
      {modal === "delete" && selUser && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setModal(null)}>
          <div style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,.08)", borderRadius: 16, padding: "1.75rem", width: 400, maxWidth: "90vw" }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "1rem" }}>Deletar usuário</h3>
            <p style={{ fontSize: 13, color: "#aaa", marginBottom: "1.25rem" }}>Remove <strong style={{ color: "#fff" }}>{selUser.email}</strong> e todos os dados permanentemente.</p>
            <div style={{ display: "flex", gap: ".75rem", justifyContent: "flex-end" }}>
              <button onClick={() => setModal(null)} style={{ padding: "7px 16px", borderRadius: 8, background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)", color: "#aaa", fontSize: 13, cursor: "pointer", fontWeight: 600, fontFamily: "var(--font-sans)" }}>Cancelar</button>
              <button onClick={deleteUser} disabled={busy} style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 16px", borderRadius: 8, background: "rgba(239,68,68,.15)", border: "1px solid rgba(239,68,68,.3)", color: "#f87171", fontSize: 13, cursor: "pointer", fontWeight: 600, fontFamily: "var(--font-sans)" }}>
                {busy ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Trash2 size={13} />} Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════ erros tab ═══════════════════════ */
function ErrosTab({ users }: { users: UserRow[] }) {
  const errorAccounts = users.flatMap(u =>
    u.oauthAccounts.filter(a => a.lastError).map(a => ({ ...a, userEmail: u.email, userName: u.name }))
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.75rem" }}>
      <PageHeader title="Erros de Conta" subtitle={`${errorAccounts.length} conta${errorAccounts.length !== 1 ? "s" : ""} com problema`} />

      {errorAccounts.length === 0 ? (
        <Panel style={{ padding: "3rem", textAlign: "center" }}>
          <CheckCircle2 size={28} color="#22c55e" style={{ margin: "0 auto 1rem", display: "block" }} />
          <p style={{ fontSize: 13, color: "#444" }}>Nenhuma conta com erro</p>
        </Panel>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: ".65rem" }}>
          {errorAccounts.map(acc => (
            <div key={acc.id} style={{ background: "#141414", borderTop: "2px solid #ef4444", borderRight: "1px solid rgba(239,68,68,.2)", borderBottom: "1px solid rgba(239,68,68,.2)", borderLeft: "1px solid rgba(239,68,68,.2)", borderRadius: 12, padding: "1rem 1.25rem", display: "flex", alignItems: "flex-start", gap: "1rem" }}>
              <div style={{ width: 38, height: 38, borderRadius: 9, flexShrink: 0, background: "rgba(239,68,68,.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <AlertTriangle size={16} color="#ef4444" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: ".5rem", marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#f87171" }}>@{acc.username}</span>
                  <span style={{ fontSize: 11, color: "#555" }}>· {acc.userName ?? acc.userEmail}</span>
                </div>
                <p style={{ fontSize: 12, color: "#aaa" }}>{acc.lastError}</p>
              </div>
              <span style={{ fontSize: 11, color: "#444", flexShrink: 0 }}>{fmtDate(acc.createdAt)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════ logs tab ═══════════════════════ */
function LogsTab({ posts }: { posts: RecentPost[] }) {
  const [filter, setFilter] = useState("TODOS");
  const statuses = ["TODOS", "DONE", "FAILED", "PENDING", "RUNNING"];
  const filtered = filter === "TODOS" ? posts : posts.filter(p => p.status === filter);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.75rem" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <PageHeader title="Registros" subtitle="Posts de todos os usuários" />
        <div style={{ display: "flex", gap: ".3rem", background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 10, padding: "3px" }}>
          {statuses.map(s => {
            const c = ST_COLOR[s] ?? "#FFD54F";
            const isActive = filter === s;
            return (
              <button key={s} onClick={() => setFilter(s)} style={{ padding: "5px 12px", borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: "pointer", background: isActive ? `${c}20` : "transparent", border: isActive ? `1px solid ${c}44` : "1px solid transparent", color: isActive ? c : "#666", fontFamily: "var(--font-sans)" }}>
                {s === "TODOS" ? "Todos" : ST_LABEL[s] ?? s}
              </button>
            );
          })}
        </div>
      </div>

      <Panel>
        {filtered.length === 0
          ? <p style={{ padding: "2.5rem", textAlign: "center", fontSize: 13, color: "#444" }}>Nenhum log</p>
          : (
            <div style={{ maxHeight: "calc(100vh - 320px)", overflowY: "auto" }}>
              {filtered.map((p, i) => (
                <div key={p.id} style={{ display: "flex", alignItems: "center", gap: "1rem", padding: ".875rem 1.4rem", borderBottom: i < filtered.length - 1 ? "1px solid rgba(255,255,255,.04)" : "none" }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: ST_COLOR[p.status] ?? "#888", flexShrink: 0 }} />
                  <div style={{ width: 130, flexShrink: 0 }}>
                    <p style={{ fontSize: 12, fontWeight: 600 }}>@{p.accountUsername}</p>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 12, color: "#888", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.videoName}</p>
                    {p.errorMsg && <p style={{ fontSize: 11, color: "#f87171" }}>{p.errorMsg}</p>}
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: ST_COLOR[p.status] ?? "#888", flexShrink: 0 }}>{ST_LABEL[p.status] ?? p.status}</span>
                  <span style={{ fontSize: 11, color: "#444", flexShrink: 0 }}>{timeAgo(p.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
      </Panel>
    </div>
  );
}

/* ═══════════════════════ mensagem global tab ═══════════════════════ */
function MensagemTab() {
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  async function sendAll() {
    if (!msg.trim()) return;
    setBusy(true); setResult(null);
    const r = await fetch("/api/admin/message-all", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: msg }) });
    const d = await r.json();
    setBusy(false);
    if (r.ok) { setResult({ ok: true, text: `Enviado para ${d.sent} usuário${d.sent !== 1 ? "s" : ""}` }); setMsg(""); }
    else setResult({ ok: false, text: d.error ?? "Erro" });
  }

  async function clearAll() {
    setBusy(true); setResult(null);
    await fetch("/api/admin/message-all", { method: "DELETE" });
    setBusy(false); setResult({ ok: true, text: "Mensagens removidas de todos os usuários" });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.75rem", maxWidth: 640 }}>
      <PageHeader title="Mensagem Global" subtitle="Envia um aviso para todos os usuários da plataforma" />

      <Panel style={{ padding: "1.5rem" }}>
        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#888", marginBottom: ".5rem", textTransform: "uppercase", letterSpacing: ".08em" }}>Mensagem</label>
        <textarea value={msg} onChange={e => setMsg(e.target.value)} placeholder="Ex: Manutenção programada amanhã às 22h..." rows={5}
          style={{ width: "100%", padding: "12px 14px", borderRadius: 10, background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.09)", color: "#f0f0f0", fontSize: 13, resize: "vertical", outline: "none", fontFamily: "var(--font-sans)", marginBottom: "1rem" }} />
        {msg && (
          <div style={{ padding: ".875rem 1rem", borderRadius: 10, background: "rgba(255,213,79,.08)", border: "1px solid rgba(255,213,79,.2)", marginBottom: "1rem" }}>
            <p style={{ fontSize: 11, color: "#FFD54F", fontWeight: 700, marginBottom: 4, textTransform: "uppercase", letterSpacing: ".08em" }}>Preview</p>
            <p style={{ fontSize: 13, color: "#e0e0e0" }}><strong style={{ color: "#FFD54F" }}>Mensagem do suporte: </strong>{msg}</p>
          </div>
        )}
        {result && (
          <div style={{ padding: ".75rem", borderRadius: 9, background: result.ok ? "rgba(34,197,94,.08)" : "rgba(239,68,68,.08)", border: `1px solid ${result.ok ? "rgba(34,197,94,.2)" : "rgba(239,68,68,.2)"}`, marginBottom: "1rem" }}>
            <p style={{ fontSize: 13, color: result.ok ? "#4ade80" : "#f87171" }}>{result.text}</p>
          </div>
        )}
        <div style={{ display: "flex", gap: ".75rem" }}>
          <button onClick={sendAll} disabled={busy || !msg.trim()} style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 20px", borderRadius: 9, background: "rgba(255,213,79,.15)", border: "1px solid rgba(255,213,79,.3)", color: "#FFD54F", fontSize: 13, cursor: busy || !msg.trim() ? "not-allowed" : "pointer", fontWeight: 700, opacity: !msg.trim() ? 0.5 : 1, fontFamily: "var(--font-sans)" }}>
            {busy ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Megaphone size={14} />} Enviar para todos
          </button>
          <button onClick={clearAll} disabled={busy} style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", borderRadius: 9, background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.1)", color: "#777", fontSize: 13, cursor: busy ? "not-allowed" : "pointer", fontWeight: 600, fontFamily: "var(--font-sans)" }}>
            <X size={13} /> Remover de todos
          </button>
        </div>
      </Panel>
    </div>
  );
}

/* ═══════════════════════ testadores tab ═══════════════════════ */
function TestadoresTab() {
  const [input, setInput] = useState("");
  const [appKey, setAppKey] = useState("");
  const [apps, setApps] = useState<{ key: string; name: string; appId: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<{ username: string; ok: boolean; error?: string; appName?: string }[]>([]);

  useEffect(() => {
    fetch("/api/admin/meta-apps")
      .then(r => r.json())
      .then((d: { apps?: { key: string; name: string; appId: string }[] }) => {
        const list = d.apps ?? [];
        setApps(list);
        if (list.length > 0) setAppKey(list[0].key);
      });
  }, []);

  async function addTester(username: string) {
    const clean = username.trim().replace(/^@/, "");
    if (!clean) return;
    const selectedApp = apps.find(a => a.key === appKey);
    try {
      const r = await fetch("/api/admin/add-instagram-tester", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ igUsername: clean, appKey: appKey || undefined }),
      });
      const d = await r.json() as { ok?: boolean; error?: string };
      setResults(prev => [{ username: clean, ok: !!d.ok, error: d.error, appName: selectedApp?.name }, ...prev]);
    } catch {
      setResults(prev => [{ username: clean, ok: false, error: "Erro de conexão", appName: selectedApp?.name }, ...prev]);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const names = input.split(/[\n,]+/).map(s => s.trim().replace(/^@/, "")).filter(Boolean);
    setInput("");
    setLoading(true);
    for (const name of names) await addTester(name);
    setLoading(false);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.75rem", maxWidth: 600 }}>
      <PageHeader title="Testadores Instagram" subtitle="Adiciona usuários como Instagram Tester no app da Meta via API" />

      <Panel style={{ padding: "1.5rem" }}>
        <SectionLabel>Adicionar Testador</SectionLabel>
        <p style={{ fontSize: 12, color: "#555", marginBottom: "1rem", lineHeight: 1.6 }}>
          Cole o @ do Instagram (um por linha ou separado por vírgula). O usuário receberá um convite em{" "}
          <strong style={{ color: "#e0e0e0" }}>Instagram → Configurações → Apps e Sites</strong> para aceitar.
        </p>
        <form onSubmit={(e) => void handleSubmit(e)} style={{ display: "flex", flexDirection: "column", gap: ".75rem" }}>
          {/* App selector */}
          {apps.length > 0 && (
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#555", marginBottom: 6, textTransform: "uppercase", letterSpacing: ".08em" }}>App de destino</label>
              <div style={{ display: "flex", gap: ".4rem", flexWrap: "wrap" }}>
                {apps.map(app => (
                  <button
                    key={app.key}
                    type="button"
                    onClick={() => setAppKey(app.key)}
                    style={{
                      padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
                      background: appKey === app.key ? "rgba(255,213,79,.18)" : "rgba(255,255,255,.04)",
                      border: appKey === app.key ? "1px solid rgba(255,213,79,.4)" : "1px solid rgba(255,255,255,.08)",
                      color: appKey === app.key ? "#FFD54F" : "#888",
                      transition: "all .15s", fontFamily: "var(--font-sans)",
                    }}
                  >
                    {app.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={"@username1\n@username2\nou username1, username2"}
            rows={4}
            style={{ width: "100%", padding: "10px 12px", borderRadius: 9, background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.09)", color: "#f0f0f0", fontSize: 13, resize: "vertical", outline: "none", fontFamily: "var(--font-sans)" }}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px 20px", borderRadius: 9, background: "rgba(255,213,79,.15)", border: "1px solid rgba(255,213,79,.3)", color: "#FFD54F", fontSize: 13, cursor: loading || !input.trim() ? "not-allowed" : "pointer", fontWeight: 700, opacity: !input.trim() ? 0.5 : 1, fontFamily: "var(--font-sans)" }}
          >
            {loading ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Send size={14} />}
            Adicionar como Testador
          </button>
        </form>
      </Panel>

      {results.length > 0 && (
        <Panel style={{ padding: "1.5rem" }}>
          <SectionLabel>Resultados</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: ".5rem" }}>
            {results.map((r, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: ".75rem", padding: ".6rem .85rem", borderRadius: 9, background: r.ok ? "rgba(34,197,94,.07)" : "rgba(239,68,68,.07)", border: `1px solid ${r.ok ? "rgba(34,197,94,.2)" : "rgba(239,68,68,.2)"}` }}>
                {r.ok ? <CheckCircle2 size={15} color="#4ade80" /> : <XCircle size={15} color="#f87171" />}
                <span style={{ fontSize: 13, fontWeight: 600, color: r.ok ? "#4ade80" : "#f87171" }}>@{r.username}</span>
                {r.appName && <span style={{ fontSize: 11, color: "#444", padding: "2px 7px", borderRadius: 5, background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.07)" }}>{r.appName}</span>}
                {r.ok
                  ? <span style={{ fontSize: 12, color: "#555", marginLeft: "auto" }}>Convite enviado ✓</span>
                  : <span style={{ fontSize: 12, color: "#f87171", marginLeft: "auto" }}>{r.error}</span>}
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}

/* ═══════════════════════ main ═══════════════════════ */
function AdminContent() {
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab") ?? "dashboard";

  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(true);

  const loadOverview = useCallback(() => {
    setLoadingOverview(true);
    fetch("/api/admin/overview").then(r => r.json()).then(setOverview).finally(() => setLoadingOverview(false));
  }, []);

  useEffect(() => { loadOverview(); }, [loadOverview]);

  const needsOverview = tab === "usuarios" || tab === "erros" || tab === "logs";
  if (loadingOverview && needsOverview) {
    return <Spinner />;
  }

  return (
    <div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      {tab === "dashboard" && <DashboardTab />}
      {tab === "planos"    && <PlanosTab />}
      {tab === "usuarios"  && overview && <UsuariosTab users={overview.users} recentPosts={overview.recentPosts} onRefresh={loadOverview} />}
      {tab === "erros"     && overview && <ErrosTab users={overview.users} />}
      {tab === "logs"      && overview && <LogsTab posts={overview.recentPosts} />}
      {tab === "mensagem"   && <MensagemTab />}
      {tab === "testadores" && <TestadoresTab />}
    </div>
  );
}

export default function AdminPage() {
  return (
    <Suspense fallback={<div style={{ display: "flex", justifyContent: "center", paddingTop: "4rem" }}><Loader2 size={24} color="#FFD54F" style={{ animation: "spin 1s linear infinite" }} /></div>}>
      <AdminContent />
    </Suspense>
  );
}
