"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { RefreshCw, Bell, TrendingUp, TrendingDown, Minus, AtSign, ChevronDown } from "lucide-react";

// ── Periods ────────────────────────────────────────────────────────────────────

const PERIODS = [
  { id: "hoje",   label: "Hoje" },
  { id: "ontem",  label: "Ontem" },
  { id: "7dias",  label: "7 dias" },
  { id: "1mes",   label: "1 Mês" },
  { id: "maximo", label: "Máximo" },
];

const STATUS_MAP: Record<string, { label: string; cls: string; dot: string }> = {
  APPROVED:  { label: "Aprovada",  cls: "green", dot: "#4ade80" },
  PENDING:   { label: "Pendente",  cls: "amber", dot: "#FFB800" },
  REFUNDED:  { label: "Reembolso", cls: "blue",  dot: "#60a5fa" },
  CANCELLED: { label: "Cancelada", cls: "red",   dot: "#f87171" },
};

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

// ── Avatar ─────────────────────────────────────────────────────────────────────

const AVATAR_COLORS = ["#7c3aed","#0ea5e9","#10b981","#f59e0b","#ef4444","#ec4899","#6366f1","#14b8a6"];
function avatarColor(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}
function initials(str: string) {
  return str.replace("@","").slice(0, 2).toUpperCase();
}

// ── Interfaces ─────────────────────────────────────────────────────────────────

interface Sale {
  id: string; gateway: string; amount: number; status: string;
  customerName: string | null; igUsername: string | null;
  planName: string | null; createdAt: string;
}
interface TopItem { igUsername?: string | null; planName?: string | null; count: number; revenue: number; }
interface DashboardData {
  stats: { approvedCount: number; approvedRevenue: number; pendingCount: number; totalCount: number; uniqueAccounts: number };
  sales: Sale[];
  topAccounts: TopItem[];
  topProducts: TopItem[];
}

// ── Chart data ─────────────────────────────────────────────────────────────────

type ChartPoint = { label: string; approved: number; generated: number; count: number };

function buildChartData(sales: Sale[], period: string): ChartPoint[] {
  const n   = period === "1mes" || period === "maximo" ? 14 : 7;
  const now = new Date();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (n - 1 - i));
    d.setHours(0, 0, 0, 0);
    const nextD = new Date(d);
    nextD.setDate(nextD.getDate() + 1);
    const daySales = sales.filter(s => {
      const t = new Date(s.createdAt);
      return t >= d && t < nextD;
    });
    return {
      label:    d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      approved: daySales.filter(s => s.status === "APPROVED").reduce((s, x) => s + x.amount, 0),
      generated:daySales.reduce((s, x) => s + x.amount, 0),
      count:    daySales.length,
    };
  });
}

// ── Y-axis scale ───────────────────────────────────────────────────────────────

function niceScale(rawMax: number, ticks = 5) {
  if (rawMax <= 0) {
    const step = 500;
    return { max: step * ticks, ticks: Array.from({ length: ticks + 1 }, (_, i) => i * step) };
  }
  const rough = rawMax / ticks;
  const mag   = Math.pow(10, Math.floor(Math.log10(rough)));
  const nice  = ([1, 2, 2.5, 5, 10].find(m => m * mag >= rough) ?? 10) * mag;
  const niceMax = Math.ceil(rawMax / nice) * nice;
  return { max: niceMax, ticks: Array.from({ length: ticks + 1 }, (_, i) => i * nice) };
}

function fmtTick(v: number) {
  if (v === 0) return "0";
  if (v >= 1_000_000) return `${(v/1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `${(v % 1_000 === 0 ? v/1_000 : (v/1_000).toFixed(1))}k`;
  return String(Math.round(v));
}

// ── Catmull-Rom → cubic bezier ─────────────────────────────────────────────────

function splinePath(pts: { x: number; y: number }[]) {
  if (!pts.length) return "";
  if (pts.length === 1) return `M ${pts[0].x},${pts[0].y}`;
  const t = 0.16;
  let d = `M ${pts[0].x.toFixed(2)},${pts[0].y.toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(i-1,0)], p1 = pts[i];
    const p2 = pts[i+1], p3 = pts[Math.min(i+2,pts.length-1)];
    const cp1x = p1.x + (p2.x - p0.x)*t, cp1y = p1.y + (p2.y - p0.y)*t;
    const cp2x = p2.x - (p3.x - p1.x)*t, cp2y = p2.y - (p3.y - p1.y)*t;
    d += ` C ${cp1x.toFixed(2)},${cp1y.toFixed(2)} ${cp2x.toFixed(2)},${cp2y.toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)}`;
  }
  return d;
}

// ── Trend helper ───────────────────────────────────────────────────────────────

function computeTrend(data: ChartPoint[], key: "approved" | "generated") {
  const n = data.length;
  if (n < 2) return null;
  const mid = Math.floor(n / 2);
  const a = data.slice(0,mid).reduce((s,d) => s + d[key], 0);
  const b = data.slice(mid).reduce((s,d) => s + d[key], 0);
  if (a === 0) return null;
  return ((b - a) / a) * 100;
}

// ── Trend indicator ────────────────────────────────────────────────────────────

function TrendBadge({ pct }: { pct: number | null }) {
  if (pct === null) return null;
  const up  = pct > 0;
  const zero = Math.abs(pct) < 0.5;
  const color = zero ? "#6c6c6c" : up ? "#4ade80" : "#f87171";
  const Icon  = zero ? Minus : up ? TrendingUp : TrendingDown;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, color, fontWeight: 500 }}>
      <Icon size={11} strokeWidth={2} />
      {zero ? "—" : `${up ? "+" : ""}${pct.toFixed(1)}%`}
    </span>
  );
}

// ── Hero chart ─────────────────────────────────────────────────────────────────

type SeriesVis = { approved: boolean; generated: boolean; count: boolean };

function HeroChart({
  data, loading, approvedTotal,
}: {
  data: ChartPoint[]; loading: boolean; approvedTotal: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [vis,     setVis]     = useState<SeriesVis>({ approved: true, generated: true, count: false });
  const [hovIdx,  setHovIdx]  = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);
  const trend = useMemo(() => computeTrend(data, "approved"), [data]);

  useEffect(() => {
    setMounted(false);
    const t = setTimeout(() => setMounted(true), 80);
    return () => clearTimeout(t);
  }, [data]);

  // SVG coordinate system
  const W = 900, H = 280;
  const PL = 58, PR = 16, PT = 20, PB = 32;
  const iw = W - PL - PR, ih = H - PT - PB;
  const n  = data.length;

  const rawMax = Math.max(...data.map(d => Math.max(d.approved, d.generated)), 1);
  const { max: scaleMax, ticks: yTicks } = useMemo(() => niceScale(rawMax, 4), [rawMax]);
  const maxCount = Math.max(...data.map(d => d.count), 1);

  const toXY = (i: number, val: number) => ({
    x: PL + (n <= 1 ? iw/2 : (i/(n-1))*iw),
    y: PT + (1 - val/scaleMax)*ih,
  });
  const toXYCount = (i: number, val: number) => ({
    x: PL + (n <= 1 ? iw/2 : (i/(n-1))*iw),
    y: PT + (1 - val/maxCount)*ih,
  });

  const approvedPts  = data.map((d, i) => toXY(i, d.approved));
  const generatedPts = data.map((d, i) => toXY(i, d.generated));
  const countPts     = data.map((d, i) => toXYCount(i, d.count));

  const appPath = splinePath(approvedPts);
  const genPath = splinePath(generatedPts);
  const cntPath = splinePath(countPts);

  const appArea = approvedPts.length > 0
    ? appPath
      + ` L ${approvedPts[n-1].x.toFixed(2)},${(PT+ih).toFixed(2)}`
      + ` L ${approvedPts[0].x.toFixed(2)},${(PT+ih).toFixed(2)} Z`
    : "";

  const hasApp = data.some(d => d.approved > 0);
  const hasGen = data.some(d => d.generated > 0);
  const hasCnt = data.some(d => d.count > 0);

  const labelStep = n <= 7 ? 1 : 2;

  function handleMouseMove(e: React.MouseEvent<SVGRectElement>) {
    const svgEl = e.currentTarget.closest("svg") as SVGSVGElement | null;
    if (!svgEl) return;
    const rect = svgEl.getBoundingClientRect();
    const dataX = ((e.clientX - rect.left) / rect.width * W - PL) / iw;
    setHovIdx(Math.max(0, Math.min(Math.round(dataX*(n-1)), n-1)));
  }

  const hovData  = hovIdx !== null ? data[hovIdx]        : null;
  const hovApp   = hovIdx !== null ? approvedPts[hovIdx]  : null;
  const hovGen   = hovIdx !== null ? generatedPts[hovIdx] : null;
  const hovCnt   = hovIdx !== null ? countPts[hovIdx]     : null;
  const tooltipPct = hovApp ? (hovApp.x / W) * 100 : 0;
  const flipLeft   = tooltipPct > 55;

  const toggle = (k: keyof SeriesVis) => setVis(v => ({ ...v, [k]: !v[k] }));

  const SERIES_META = [
    { key: "approved" as const,  label: "Aprovado",  color: "#FFB800", dash: undefined,  stroke: 1.75 },
    { key: "generated" as const, label: "Gerado",    color: "#3a3a3a", dash: "4 4",      stroke: 1.25 },
    { key: "count" as const,     label: "Vendas",    color: "#4ade80", dash: undefined,  stroke: 1.4  },
  ];

  if (loading) {
    return (
      <div>
        <div style={{ padding: "20px 22px 14px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
          <div style={{ width: 110, height: 9, background: "rgba(255,255,255,0.03)", borderRadius: 3, marginBottom: 10 }} />
          <div style={{ width: 180, height: 28, background: "rgba(255,255,255,0.04)", borderRadius: 4, marginBottom: 8 }} />
          <div style={{ width: 120, height: 9, background: "rgba(255,255,255,0.02)", borderRadius: 3 }} />
        </div>
        <div style={{ height: 280, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ width: 18, height: 18, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.04)", borderTop: "2px solid rgba(255,255,255,0.12)", animation: "spin 0.9s linear infinite" }} />
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{
        padding: "20px 22px 14px",
        display: "flex", alignItems: "flex-start", justifyContent: "space-between",
        borderBottom: "1px solid rgba(255,255,255,0.04)",
      }}>
        <div>
          <div style={{ fontSize: 10.5, color: "#444", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 7, fontWeight: 500 }}>
            Faturamento
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 3 }}>
            <span style={{ fontSize: 30, fontWeight: 600, letterSpacing: "-0.035em", color: "#ededed", lineHeight: 1 }}>
              {fmtBRL(approvedTotal)}
            </span>
            <TrendBadge pct={trend} />
          </div>
          <div style={{ fontSize: 11, color: "#444" }}>
            {hasApp ? "faturamento aprovado no período" : "nenhuma venda aprovada no período"}
          </div>
        </div>

        {/* Legend toggles */}
        <div style={{ display: "flex", alignItems: "center", gap: 2, paddingTop: 4 }}>
          {SERIES_META.map(s => (
            <button
              key={s.key}
              onClick={() => toggle(s.key)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "4px 9px", borderRadius: 5, border: "1px solid",
                borderColor: vis[s.key] ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)",
                background: vis[s.key] ? "rgba(255,255,255,0.04)" : "transparent",
                cursor: "pointer", fontFamily: "inherit",
                opacity: vis[s.key] ? 1 : 0.4,
                transition: "all 0.12s",
              }}
            >
              <svg width="18" height="8" viewBox="0 0 18 8">
                {s.dash
                  ? <line x1="0" y1="4" x2="18" y2="4" stroke={s.color} strokeWidth="1.5" strokeDasharray={s.dash} />
                  : <line x1="0" y1="4" x2="18" y2="4" stroke={s.color} strokeWidth="1.5" />
                }
                {!s.dash && <circle cx="9" cy="4" r="2" fill={s.color} />}
              </svg>
              <span style={{ fontSize: 11, color: "#a0a0a0", fontWeight: 400 }}>{s.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div ref={containerRef} style={{ position: "relative", userSelect: "none" }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          style={{ width: "100%", height: 280, display: "block", overflow: "visible" }}
        >
          <defs>
            <linearGradient id="hc-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#FFB800" stopOpacity={hasApp && vis.approved ? 0.18 : 0} />
              <stop offset="85%"  stopColor="#FFB800" stopOpacity="0" />
            </linearGradient>
            <filter id="hc-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          {/* Y-axis grid + labels */}
          {yTicks.map((tick, i) => {
            const y = PT + (1 - tick/scaleMax)*ih;
            return (
              <g key={i}>
                <line
                  x1={PL} y1={y} x2={W-PR} y2={y}
                  stroke={i === 0 ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.03)"}
                  strokeWidth="1"
                  strokeDasharray={i === 0 ? undefined : "2 4"}
                />
                <text x={PL-8} y={y+3.5} textAnchor="end" fontSize="9.5" fill="#333" fontFamily="Geist,sans-serif">
                  {fmtTick(tick)}
                </text>
              </g>
            );
          })}

          {/* Area under approved */}
          {vis.approved && hasApp && <path d={appArea} fill="url(#hc-area)" />}

          {/* Generated line (dashed gray) */}
          {vis.generated && (
            <path
              d={genPath} fill="none"
              stroke={hasGen ? "#3a3a3a" : "rgba(255,255,255,0.03)"}
              strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"
              strokeDasharray="4 4"
              pathLength="2000"
              style={{
                strokeDasharray: vis.generated ? "4 4" : "0 0",
                opacity: hovIdx !== null ? 0.5 : 0.7,
              }}
            />
          )}

          {/* Count line (green) */}
          {vis.count && (
            <path
              d={cntPath} fill="none"
              stroke={hasCnt ? "#4ade80" : "rgba(255,255,255,0.03)"}
              strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"
              pathLength="2000"
              style={{
                strokeDasharray: 2000,
                strokeDashoffset: mounted ? 0 : 2000,
                transition: mounted ? "stroke-dashoffset 1.2s ease 0.15s" : "none",
                opacity: hovIdx !== null ? 0.6 : 0.8,
              }}
            />
          )}

          {/* Approved line (yellow, with glow) */}
          {vis.approved && (
            <path
              d={appPath} fill="none"
              stroke={hasApp ? "#FFB800" : "rgba(255,255,255,0.04)"}
              strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
              filter={hasApp ? "url(#hc-glow)" : undefined}
              pathLength="2000"
              style={{
                strokeDasharray: 2000,
                strokeDashoffset: mounted ? 0 : 2000,
                transition: mounted ? "stroke-dashoffset 1.2s ease" : "none",
              }}
            />
          )}

          {/* Resting dots (approved) */}
          {hovIdx === null && vis.approved && hasApp && approvedPts.map((p, i) =>
            data[i].approved > 0
              ? <circle key={i} cx={p.x} cy={p.y} r="2" fill="#FFB800" stroke="#0a0a0a" strokeWidth="1.5" opacity="0.7" />
              : null
          )}

          {/* Hover cursor */}
          {hovIdx !== null && hovApp && (
            <line
              x1={hovApp.x} y1={PT-4} x2={hovApp.x} y2={PT+ih+4}
              stroke="rgba(255,255,255,0.06)" strokeWidth="1"
              strokeDasharray="3 5"
            />
          )}

          {/* Hover dots */}
          {hovIdx !== null && hovApp && vis.approved && hasApp && (
            <circle cx={hovApp.x} cy={hovApp.y} r="4.5" fill="#FFB800" stroke="#0a0a0a" strokeWidth="2" />
          )}
          {hovIdx !== null && hovGen && vis.generated && hasGen && (
            <circle cx={hovGen.x} cy={hovGen.y} r="3" fill="#3a3a3a" stroke="#0a0a0a" strokeWidth="1.5" />
          )}
          {hovIdx !== null && hovCnt && vis.count && hasCnt && (
            <circle cx={hovCnt.x} cy={hovCnt.y} r="3.5" fill="#4ade80" stroke="#0a0a0a" strokeWidth="1.5" />
          )}

          {/* X-axis labels */}
          {data.map((d, i) => {
            if (i % labelStep !== 0 && i !== n-1) return null;
            const x = PL + (n <= 1 ? iw/2 : (i/(n-1))*iw);
            return (
              <text key={i} x={x} y={H-6} textAnchor="middle" fontSize="9.5"
                fill={hovIdx === i ? "#6c6c6c" : "#2e2e2e"}
                fontFamily="Geist,sans-serif" style={{ transition: "fill 0.1s" }}>
                {d.label}
              </text>
            );
          })}

          {/* Hover rect */}
          <rect
            x={PL} y={PT} width={iw} height={ih}
            fill="transparent"
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHovIdx(null)}
            style={{ cursor: "crosshair" }}
          />
        </svg>

        {/* Tooltip */}
        {hovIdx !== null && hovData && (
          <div style={{
            position: "absolute", top: 12, zIndex: 20,
            ...(flipLeft ? { left: `calc(${tooltipPct}% - 198px)` } : { left: `calc(${tooltipPct}% + 10px)` }),
            background: "#161616", border: "1px solid #2a2a2a",
            borderRadius: 9, padding: "10px 14px", minWidth: 184,
            pointerEvents: "none",
            boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
          }}>
            <div style={{ fontSize: 10.5, fontWeight: 500, color: "#555", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 9 }}>
              {hovData.label}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {vis.approved && (
                <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#FFB800" }} />
                    <span style={{ fontSize: 11, color: "#6c6c6c" }}>Aprovado</span>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#FFB800", letterSpacing: "-0.01em" }}>
                    {fmtBRL(hovData.approved)}
                  </span>
                </div>
              )}
              {vis.generated && (
                <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#3a3a3a" }} />
                    <span style={{ fontSize: 11, color: "#6c6c6c" }}>Gerado</span>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#a0a0a0", letterSpacing: "-0.01em" }}>
                    {fmtBRL(hovData.generated)}
                  </span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 5, height: 5, borderRadius: "50%", background: vis.count ? "#4ade80" : "#333" }} />
                  <span style={{ fontSize: 11, color: "#6c6c6c" }}>Vendas</span>
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color: vis.count ? "#4ade80" : "#555", letterSpacing: "-0.01em" }}>
                  {hovData.count}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── KPI card ───────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, trend, sub, last,
}: {
  label: string; value: string; trend: number | null; sub: string; last?: boolean;
}) {
  return (
    <div style={{
      padding: "14px 18px",
      borderRight: last ? "none" : "1px solid rgba(255,255,255,0.06)",
      minWidth: 0,
    }}>
      <div style={{ fontSize: 11.5, color: "#6c6c6c", fontWeight: 400, marginBottom: 5 }}>
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 7, marginBottom: 4 }}>
        <span style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.028em", color: "#ededed", lineHeight: 1 }}>
          {value}
        </span>
        <TrendBadge pct={trend} />
      </div>
      <div style={{ fontSize: 11, color: "#444" }}>{sub}</div>
    </div>
  );
}

// ── Top list row ───────────────────────────────────────────────────────────────

function TopRow({ rank, name, sub, pct, value }: {
  rank: number; name: string; sub: string; pct: number; value: string;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "7px 0", borderBottom: "1px solid rgba(255,255,255,0.04)",
    }}>
      <span style={{ width: 14, fontSize: 10.5, color: "#333", fontWeight: 500, flexShrink: 0, textAlign: "right" }}>
        {rank}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 500, color: "#d4d4d4", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {name}
        </div>
        <div style={{ fontSize: 10.5, color: "#333", marginTop: 1 }}>{sub}</div>
        <div style={{ height: 2, background: "rgba(255,255,255,0.04)", borderRadius: 1, marginTop: 4 }}>
          <div style={{ height: 2, width: `${pct}%`, background: "#FFB800", borderRadius: 1, opacity: 0.6 }} />
        </div>
      </div>
      <span style={{ fontSize: 12, fontWeight: 600, color: "#a0a0a0", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </span>
    </div>
  );
}

// ── Panel header ───────────────────────────────────────────────────────────────

function PanelHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div style={{
      padding: "11px 18px", borderBottom: "1px solid rgba(255,255,255,0.05)",
      display: "flex", alignItems: "center", justifyContent: "space-between",
    }}>
      <span style={{ fontSize: 12.5, fontWeight: 500, color: "#d4d4d4" }}>{title}</span>
      {action}
    </div>
  );
}

// ── Empty state ────────────────────────────────────────────────────────────────

function EmptyState({ icon: Icon, title, body }: { icon: React.ElementType; title: string; body: string }) {
  return (
    <div style={{ padding: "28px 18px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      <div style={{
        width: 36, height: 36, borderRadius: 8, border: "1px solid rgba(255,255,255,0.06)",
        display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 2,
      }}>
        <Icon size={16} color="#444" strokeWidth={1.5} />
      </div>
      <span style={{ fontSize: 13, fontWeight: 500, color: "#6c6c6c" }}>{title}</span>
      <span style={{ fontSize: 12, color: "#333", textAlign: "center", maxWidth: 260, lineHeight: 1.5 }}>{body}</span>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function DashboardSales({ firstName }: { firstName: string }) {
  const [period,   setPeriod]   = useState("hoje");
  const [data,     setData]     = useState<DashboardData | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [spinning, setSpinning] = useState(false);
  const [notifDot, setNotifDot] = useState(true);
  const dropRef = useRef<HTMLDivElement>(null);
  const [dropOpen, setDropOpen] = useState(false);

  const load = useCallback((p: string, showSpin = false) => {
    if (showSpin) setSpinning(true); else setLoading(true);
    fetch(`/api/sales?period=${p}&limit=10`)
      .then(r => r.json()).then(setData).catch(console.error)
      .finally(() => { setLoading(false); setSpinning(false); });
  }, []);

  useEffect(() => { load(period); }, [period, load]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setDropOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const stats       = data?.stats;
  const topAccounts = data?.topAccounts ?? [];
  const topProducts = data?.topProducts ?? [];
  const sales       = data?.sales ?? [];
  const maxAcc      = topAccounts[0]?.revenue ?? 1;
  const maxProd     = topProducts[0]?.revenue ?? 1;
  const convPct     = stats && stats.totalCount > 0 ? Math.round((stats.approvedCount / stats.totalCount) * 100) : 0;
  const currentLabel = PERIODS.find(p => p.id === period)?.label ?? "Hoje";

  const chartData = useMemo(() => buildChartData(sales, period), [sales, period]);
  const trendApp  = useMemo(() => computeTrend(chartData, "approved"), [chartData]);

  // ── Topbar ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>

      {/* ── Topbar ── */}
      <div style={{
        position: "sticky", top: 0, zIndex: 50,
        height: 49,
        marginLeft: -28, marginRight: -28, marginTop: -28,
        background: "rgba(10,10,10,0.88)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 28px",
      }}>
        {/* Breadcrumb */}
        <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13, color: "#444" }}>
          <span>Workspace</span>
          <span style={{ color: "#2a2a2a" }}>/</span>
          <span style={{ color: "#a0a0a0" }}>Dashboard</span>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {/* Period dropdown */}
          <div ref={dropRef} style={{ position: "relative" }}>
            <button onClick={() => setDropOpen(v => !v)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "5px 11px", borderRadius: 7,
                background: "transparent", border: "1px solid rgba(255,255,255,0.06)",
                color: "#a0a0a0", fontSize: 12.5, fontWeight: 400,
                cursor: "pointer", fontFamily: "inherit", transition: "all 0.12s",
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; e.currentTarget.style.color = "#ededed"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)"; e.currentTarget.style.color = "#a0a0a0"; }}
            >
              {currentLabel}
              <ChevronDown size={11} style={{ transition: "transform 0.2s", transform: dropOpen ? "rotate(180deg)" : "none" }} />
            </button>
            {dropOpen && (
              <div style={{
                position: "absolute", top: "calc(100% + 5px)", right: 0,
                background: "#111", border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 9, boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
                minWidth: 150, zIndex: 100, overflow: "hidden",
              }}>
                {PERIODS.map(p => (
                  <button key={p.id} onClick={() => { setPeriod(p.id); setDropOpen(false); }}
                    style={{
                      display: "block", width: "100%", padding: "7px 13px", textAlign: "left",
                      background: period === p.id ? "rgba(255,255,255,0.05)" : "transparent",
                      border: "none", borderBottom: "1px solid rgba(255,255,255,0.04)",
                      color: period === p.id ? "#ededed" : "#a0a0a0",
                      fontSize: 12.5, fontWeight: period === p.id ? 500 : 400,
                      cursor: "pointer", fontFamily: "inherit",
                    }}
                    onMouseEnter={e => { if (period !== p.id) e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
                    onMouseLeave={e => { if (period !== p.id) e.currentTarget.style.background = "transparent"; }}
                  >
                    {PERIODS.find(x => x.id === p.id)?.label ?? p.id}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Refresh */}
          <button onClick={() => load(period, true)} title="Atualizar"
            style={{
              width: 30, height: 30, borderRadius: 6, display: "flex",
              alignItems: "center", justifyContent: "center",
              background: "transparent", border: "1px solid rgba(255,255,255,0.06)",
              cursor: "pointer", color: "#444", transition: "all 0.12s",
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; e.currentTarget.style.color = "#a0a0a0"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)"; e.currentTarget.style.color = "#444"; }}
          >
            <RefreshCw size={12} style={{ transform: spinning ? "rotate(360deg)" : "none", transition: "transform 0.5s" }} />
          </button>

          {/* Notifications */}
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setNotifDot(false)}
              style={{
                width: 30, height: 30, borderRadius: 6, display: "flex",
                alignItems: "center", justifyContent: "center",
                background: "transparent", border: "1px solid rgba(255,255,255,0.06)",
                cursor: "pointer", color: "#444", transition: "all 0.12s",
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; e.currentTarget.style.color = "#a0a0a0"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)"; e.currentTarget.style.color = "#444"; }}
            >
              <Bell size={12} />
            </button>
            {notifDot && (
              <div style={{
                position: "absolute", top: 5, right: 5,
                width: 5, height: 5, borderRadius: "50%",
                background: "#FFB800", border: "1px solid #0a0a0a",
              }} />
            )}
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div style={{ padding: "22px 0 0", display: "flex", flexDirection: "column", gap: 10 }}>

        {/* Page head */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.025em", color: "#ededed" }}>
              Olá, {firstName}
            </div>
            <div style={{ fontSize: 12, color: "#444", marginTop: 2 }}>
              Visão geral das suas operações — {currentLabel.toLowerCase()}
            </div>
          </div>
        </div>

        {/* ── KPI row ── */}
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
          background: "#0d0d0d", border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 9, overflow: "hidden",
        }}>
          <KpiCard
            label="Faturamento"
            value={loading ? "—" : fmtBRL(stats?.approvedRevenue ?? 0)}
            trend={loading ? null : trendApp}
            sub={loading ? "Carregando..." : `${stats?.approvedCount ?? 0} vendas aprovadas`}
          />
          <KpiCard
            label="Conversão PIX"
            value={loading ? "—" : `${convPct}%`}
            trend={null}
            sub={loading ? "" : `de ${stats?.totalCount ?? 0} transações totais`}
          />
          <KpiCard
            label="Contas Ativas"
            value={loading ? "—" : String(stats?.uniqueAccounts ?? 0)}
            trend={null}
            sub={loading ? "" : "contas com vendas no período"}
          />
          <KpiCard
            label="Pendentes"
            value={loading ? "—" : String(stats?.pendingCount ?? 0)}
            trend={null}
            sub={loading ? "" : "aguardando aprovação"}
            last
          />
        </div>

        {/* ── Hero chart ── */}
        <div style={{
          background: "#0d0d0d", border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 9, overflow: "hidden",
        }}>
          <HeroChart
            data={chartData}
            loading={loading}
            approvedTotal={stats?.approvedRevenue ?? 0}
          />
        </div>

        {/* ── Top Contas + Top Produtos ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div style={{ background: "#0d0d0d", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 9, overflow: "hidden" }}>
            <PanelHeader title="Top Contas"
              action={<Link href="/vendas" style={{ fontSize: 11, color: "#444" }}>Ver tudo</Link>} />
            <div style={{ padding: "6px 18px 12px" }}>
              {topAccounts.length === 0
                ? <EmptyState icon={AtSign} title="Sem contas no período" body="Quando suas contas gerarem vendas, elas aparecerão aqui." />
                : topAccounts.map((a, i) => (
                  <TopRow key={i} rank={i+1} name={`@${a.igUsername}`}
                    sub={`${a.count} vendas`}
                    pct={Math.round((a.revenue / maxAcc) * 100)}
                    value={fmtBRL(a.revenue)} />
                ))}
            </div>
          </div>

          <div style={{ background: "#0d0d0d", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 9, overflow: "hidden" }}>
            <PanelHeader title="Top Produtos" />
            <div style={{ padding: "6px 18px 12px" }}>
              {topProducts.length === 0
                ? <EmptyState icon={TrendingUp} title="Sem produtos no período" body="Produtos com mais vendas aparecerão aqui assim que houver conversões." />
                : topProducts.map((p, i) => (
                  <TopRow key={i} rank={i+1} name={p.planName ?? "—"}
                    sub={`${p.count} vendas`}
                    pct={Math.round((p.revenue / maxProd) * 100)}
                    value={fmtBRL(p.revenue)} />
                ))}
            </div>
          </div>
        </div>

        {/* ── Transactions ── */}
        <div style={{ background: "#0d0d0d", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 9, overflow: "hidden" }}>
          <PanelHeader title="Últimas Transações"
            action={<Link href="/vendas" style={{ fontSize: 11, color: "#444" }}>Ver todas</Link>} />
          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  {["ID", "Conta", "Produto", "Valor", "Data", "Status"].map(h => <th key={h}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {sales.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: 0 }}>
                      <EmptyState
                        icon={TrendingUp}
                        title={loading ? "Carregando transações..." : "Nenhuma transação no período"}
                        body={loading ? "" : "Altere o período ou aguarde novas vendas chegarem via webhook."}
                      />
                    </td>
                  </tr>
                ) : sales.map(s => {
                  const cfg = STATUS_MAP[s.status] ?? STATUS_MAP.PENDING;
                  const uname = s.igUsername ?? "—";
                  const color = avatarColor(uname);
                  return (
                    <tr key={s.id}>
                      <td style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "#333", letterSpacing: "0.04em" }}>
                        {s.id.slice(0, 8).toUpperCase()}
                      </td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{
                            width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                            background: color, display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 9.5, fontWeight: 700, color: "#fff",
                          }}>
                            {initials(uname)}
                          </div>
                          <span style={{ fontSize: 12.5, color: "#d4d4d4", fontWeight: 500 }}>
                            {s.igUsername ? `@${s.igUsername}` : "—"}
                          </span>
                        </div>
                      </td>
                      <td style={{ fontSize: 12, color: "#6c6c6c" }}>{s.planName ?? "—"}</td>
                      <td style={{ fontSize: 12.5, fontWeight: 600, color: "#ededed", fontVariantNumeric: "tabular-nums" }}>
                        {fmtBRL(s.amount)}
                      </td>
                      <td style={{ fontSize: 11.5, color: "#444", whiteSpace: "nowrap", fontFamily: "var(--font-mono)" }}>
                        {fmtDate(s.createdAt)}
                      </td>
                      <td>
                        <span className={`pill ${cfg.cls}`}>
                          <span className="pill-dot" style={{ background: cfg.dot }} />
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

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
