'use client';
import { useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { PriceChart } from './PriceChart';
import { Card, Seg, Skeleton, ErrorBox, StaleBadge, Notice, BiasChip } from './ui';
import { AssetAnalysisCard, TechnicalLevels } from './AssetAnalysis';
import { useAnalysis, Block, List } from './IntelligencePanel';
import { NewsList } from './NewsList';
import { EventRow, EventDetailSheet, EventListSkeleton } from './EventList';
import { useQuotes } from './QuoteGrid';
import { useApi } from '@/lib/client/useApi';
import { fmtPrice, fmtPct, fmtDateTime, relativeTime } from '@/lib/client/format';
import { INTERVALS, type Interval, type CandleSeries } from '@/lib/market/types';
import type { TechnicalSnapshot } from '@/lib/market/technicals';
import type { EconEvent } from '@/lib/calendar/types';

interface CandlesResponse { asset: { symbol: string; name: string; decimals: number }; series: CandleSeries | null; stale: boolean; error?: string; technicals: TechnicalSnapshot | null; dailyStale: boolean }

export function AssetDetail({ symbol, gold }: { symbol: string; gold?: boolean }) {
  const [interval, setInterval_] = useState<Interval>(gold ? '1h' : '1h');
  const [sel, setSel] = useState<string | null>(null);
  const quotes = useQuotes([symbol], 120000);
  const candles = useApi<CandlesResponse>(`/api/market/candles?symbol=${symbol}&interval=${interval}`, { intervalMs: interval === '1day' ? 30 * 60000 : 5 * 60000 });
  const analysis = useAnalysis();
  const events = useApi<{ events: EconEvent[]; fetchedAt: string; stale: boolean }>(`/api/calendar?range=next7&asset=${symbol}&impacts=high,medium`, { intervalMs: 5 * 60000 });
  const rates = useApi<{ rates: { label: string; value: number; date: string }[]; available: boolean; error?: string; stale: boolean }>(gold ? '/api/rates' : null);
  const dxy = useQuotes(gold ? ['DXY'] : undefined, 300000);
  const q = quotes.data?.quotes[symbol]?.quote;
  const dec = quotes.data?.assets[symbol]?.decimals ?? candles.data?.asset.decimals ?? 2;
  const t = candles.data?.technicals;
  const levels = useMemo(() => {
    if (!t?.dataSufficient) return [];
    const out: { price: number; label: string; color: string }[] = [];
    t.resistances.slice(0, 2).forEach((p, i) => out.push({ price: p, label: `R${i + 1}`, color: '#ef4444' }));
    t.supports.slice(0, 2).forEach((p, i) => out.push({ price: p, label: `S${i + 1}`, color: '#22c55e' }));
    if (t.pivots) out.push({ price: t.pivots.P, label: 'Pivô', color: '#f59e0b' });
    return out;
  }, [t]);
  const dir = q?.direction ?? 'flat';
  const Icon = dir === 'up' ? ArrowUpRight : dir === 'down' ? ArrowDownRight : Minus;
  const goldOut = analysis.data?.analysis?.output.gold;
  const dxyQ = dxy.data?.quotes.DXY;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">{gold ? 'GOLD · XAUUSD' : symbol} {t && <BiasChip bias={t.bias} />}</h1>
          <p className="text-xs text-text-3">{candles.data?.asset.name ?? ''}{q?.isProxy ? ` · cotação via ${q.proxyLabel}` : ''}</p>
        </div>
        <div className="text-right">
          {quotes.loading && !q ? <Skeleton className="h-8 w-32" /> : q ? <><div className="text-2xl font-semibold num">{fmtPrice(q.price, dec)}</div><div className={`text-sm num flex items-center justify-end gap-1 ${dir === 'up' ? 'text-up' : dir === 'down' ? 'text-down' : 'text-text-2'}`}><Icon size={14} />{fmtPct(q.changePct)} · {relativeTime(q.asOf)}</div></> : <span className="chip chip-warn">cotação indisponível{quotes.data?.quotes[symbol]?.error ? `: ${quotes.data.quotes[symbol].error}` : ''}</span>}
        </div>
      </div>

      <Card title="Gráfico" action={<div className="flex items-center gap-2"><Seg value={interval} options={INTERVALS} onChange={setInterval_} />{candles.data && <StaleBadge at={candles.data.series?.fetchedAt} stale={candles.data.stale} />}</div>}>
        {candles.error && <ErrorBox message={candles.error} onRetry={candles.refresh} />}
        {candles.loading && !candles.data && <Skeleton className="h-[360px]" />}
        {candles.data && !candles.data.series && <Notice>Histórico indisponível: {candles.data.error ?? 'sem dados'}.</Notice>}
        {candles.data?.series && <PriceChart candles={candles.data.series.candles} levels={levels} decimals={dec} />}
        {candles.data?.series && <p className="text-[11px] text-text-3 mt-2">{candles.data.series.candles.length} candles {INTERVALS.find((i) => i.id === interval)?.label} · {candles.data.series.source} ({candles.data.series.providerSymbol}{candles.data.series.isProxy ? ', proxy' : ''}) · atualizado {fmtDateTime(candles.data.series.fetchedAt)}. Preços podem diferir da sua corretora por spread, fonte de liquidez e horário de fechamento.</p>}
      </Card>

      <Card title={`Suportes, resistências e volatilidade (${INTERVALS.find((i) => i.id === interval)?.label})`}>
        {candles.loading && !candles.data ? <Skeleton className="h-24" /> : <TechnicalLevels t={t} decimals={dec} />}
      </Card>

      {gold && (
        <Card title="Dólar e juros" subtitle="Força do dólar (DXY ou proxy) e Treasuries (FRED, dado diário)">
          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg bg-surface-2/60 border border-border p-3">
              <div className="text-[10px] uppercase text-text-3">Índice Dólar {dxyQ?.quote?.isProxy ? `(${dxyQ.quote.proxyLabel})` : '(DXY)'}</div>
              {dxyQ?.quote ? <div className="num text-lg">{fmtPrice(dxyQ.quote.price, 3)} <span className={`text-sm ${dxyQ.quote.direction === 'up' ? 'text-up' : dxyQ.quote.direction === 'down' ? 'text-down' : 'text-text-2'}`}>{fmtPct(dxyQ.quote.changePct)}</span></div> : <div className="text-text-3 text-xs">indisponível{dxyQ?.error ? `: ${dxyQ.error}` : ''}</div>}
            </div>
            <div className="rounded-lg bg-surface-2/60 border border-border p-3">
              <div className="text-[10px] uppercase text-text-3">Juros americanos</div>
              {rates.data?.available && rates.data.rates.length ? rates.data.rates.map((r) => <div key={r.label} className="num text-xs flex justify-between"><span className="text-text-2">{r.label}</span><span>{r.value.toFixed(2)}% <span className="text-text-3">({r.date})</span></span></div>) : <div className="text-text-3 text-xs">{rates.data?.error ?? 'indisponível'} — configure FRED_API_KEY para juros.</div>}
            </div>
          </div>
          {goldOut && <p className="text-sm mt-3">{goldOut.dollarAndRates}</p>}
        </Card>
      )}

      {gold && goldOut && (
        <Card title="Cenários por sessão" subtitle={analysis.data?.analysis ? `Análise de ${fmtDateTime(analysis.data.analysis.generatedAt)}` : undefined}>
          <div className="grid md:grid-cols-3 gap-4">
            <Block title="🌏 Sessão asiática"><p>{goldOut.asia}</p></Block>
            <Block title="🇬🇧 Sessão de Londres"><p>{goldOut.london}</p></Block>
            <Block title="🇺🇸 Sessão de Nova York"><p>{goldOut.newyork}</p></Block>
          </div>
          <div className="grid md:grid-cols-2 gap-4 mt-4">
            <Block title={<span className="text-up">Condições de rompimento</span>}><List items={goldOut.breakoutConditions} /></Block>
            <Block title={<span className="text-down">Condições de rejeição</span>}><List items={goldOut.rejectionConditions} /></Block>
          </div>
        </Card>
      )}
      {gold && analysis.data && !goldOut && <Notice tone="info">Cenários por sessão aparecem após a primeira análise com XAUUSD entre os favoritos.</Notice>}

      <AssetAnalysisCard symbol={symbol} analysis={analysis.data?.analysis} />

      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Eventos relevantes (7 dias)" action={events.data && <StaleBadge at={events.data.fetchedAt} stale={events.data.stale} />}>
          {events.loading && !events.data && <EventListSkeleton />}
          {events.data && events.data.events.length === 0 && <p className="text-sm text-text-3">Nenhum evento de impacto alto/médio para as moedas deste ativo.</p>}
          {events.data?.events.slice(0, 12).map((e) => <EventRow key={e.id} ev={e} showDate onSelect={(ev) => setSel(ev.id)} />)}
        </Card>
        <NewsList symbol={symbol} title={`Notícias · ${symbol}`} limit={12} compact />
      </div>
      <EventDetailSheet id={sel} onClose={() => setSel(null)} />
    </div>
  );
}
