'use client';
import { Card, BiasChip, Notice } from './ui';
import { Block, List } from './IntelligencePanel';
import { fmtDateTime, fmtPrice, relativeTime, minutesSince } from '@/lib/client/format';
import type { StoredAnalysis } from '@/lib/analysis/schema';
import type { TechnicalSnapshot } from '@/lib/market/technicals';

export function TechnicalLevels({ t, decimals = 2 }: { t: TechnicalSnapshot | null | undefined; decimals?: number }) {
  if (!t || !t.dataSufficient) return <Notice>Níveis técnicos não calculados: histórico de candles indisponível ou insuficiente (precisa de ≥30 barras).</Notice>;
  const f = (n?: number) => fmtPrice(n, decimals);
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
      <Stat label="Resistências" value={t.resistances.length ? t.resistances.map(f).join(' · ') : '—'} tone="down" />
      <Stat label="Suportes" value={t.supports.length ? t.supports.map(f).join(' · ') : '—'} tone="up" />
      <Stat label={`Pivô (${t.pivots?.basedOn ?? '—'})`} value={t.pivots ? `P ${f(t.pivots.P)} · R1 ${f(t.pivots.R1)} · S1 ${f(t.pivots.S1)}` : 'D1 indisponível'} />
      <Stat label="Médias" value={`SMA20 ${f(t.sma20)} · SMA50 ${f(t.sma50)}${t.sma200 ? ` · SMA200 ${f(t.sma200)}` : ''}`} />
      <Stat label="RSI 14" value={t.rsi14?.toFixed(1) ?? '—'} />
      <Stat label="ATR 14" value={`${f(t.atr14)} (${t.atrPct?.toFixed(2) ?? '—'}%)`} />
      <Stat label="Volatilidade" value={t.volatility ?? '—'} tone={t.volatility === 'alta' || t.volatility === 'extrema' ? 'warn' : undefined} />
      <Stat label={`Tendência (${t.interval})`} value={`${t.trend ?? '—'} · ${t.bias}`} />
      <p className="col-span-2 sm:col-span-4 text-[11px] text-text-3">Calculado a partir de {t.bars} candles {t.interval} (última barra {t.lastBarTime ? fmtDateTime(t.lastBarTime) : '—'}). {t.biasReason} Preços de provedores e corretoras podem diferir alguns pontos (spread, horário de fechamento, fonte de liquidez).</p>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'up' | 'down' | 'warn' }) {
  const c = tone === 'up' ? 'text-up' : tone === 'down' ? 'text-down' : tone === 'warn' ? 'text-warn' : '';
  return <div className="rounded-lg bg-surface-2/60 border border-border p-2.5"><div className="text-[10px] uppercase tracking-wide text-text-3">{label}</div><div className={`num text-[13px] mt-0.5 ${c}`}>{value}</div></div>;
}

export function AssetAnalysisCard({ symbol, analysis }: { symbol: string; analysis: StoredAnalysis | null | undefined }) {
  const a = analysis?.output.assets.find((x) => x.symbol === symbol);
  if (!analysis || !a) return <Card title="Análise fundamentalista e técnica"><Notice tone="info">Sem análise para {symbol} ainda. Gere uma análise no Dashboard (Market Intelligence → Atualizar).</Notice></Card>;
  const ageMin = minutesSince(analysis.generatedAt);
  return (
    <Card title="Análise" subtitle={`Gerada ${fmtDateTime(analysis.generatedAt)} (${relativeTime(analysis.generatedAt)}) · horizonte: ${a.horizon}`} action={<div className="flex items-center gap-2"><BiasChip bias={a.bias} />{ageMin > 360 && <span className="chip chip-warn">antiga</span>}</div>}>
      {a.dataQuality !== 'completa' && <div className="mb-3"><Notice>Qualidade dos dados: {a.dataQuality}. {a.bias === 'indefinido' ? 'Viés indefinido por falta de dados.' : 'Interprete com cautela.'}</Notice></div>}
      <p className="text-sm leading-relaxed mb-4">{a.summary}</p>
      <div className="grid md:grid-cols-2 gap-4">
        <Block title="Motivos que sustentam o cenário"><List items={a.reasons} /></Block>
        <Block title="Fatores contrários"><List items={a.counterpoints} /></Block>
        <Block title="Eventos que podem alterar a direção"><List items={a.catalysts} /></Block>
        <Block title="Níveis técnicos"><p className="text-sm">{a.keyLevelsNote || '—'}</p></Block>
        <Block title={<span className="text-up">Condições que confirmariam alta</span>}><List items={a.bullishConfirmation} /></Block>
        <Block title={<span className="text-down">Condições que confirmariam baixa</span>}><List items={a.bearishConfirmation} /></Block>
      </div>
      <p className="text-[11px] text-text-3 border-t border-border pt-3 mt-4">Fontes: {analysis.sources.map((s) => `${s.name} (${fmtDateTime(s.asOf)})`).join(' · ')}. {analysis.output.disclaimer}</p>
    </Card>
  );
}
