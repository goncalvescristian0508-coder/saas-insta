'use client';
import Link from 'next/link';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { Card, Skeleton, ErrorBox, StaleBadge, BiasChip, Notice } from './ui';
import { fmtPrice, fmtPct, relativeTime } from '@/lib/client/format';
import { useApi } from '@/lib/client/useApi';
import type { Quote } from '@/lib/market/types';

export interface QuotesResponse {
  quotes: Record<string, { quote: Quote | null; stale: boolean; error?: string }>;
  technicals: Record<string, { bias: string; volatility?: string; trend?: string; atrPct?: number; asOf?: string }>;
  assets: Record<string, { name: string; cls: string; decimals: number }>;
  fetchedAt: string;
}

export function useQuotes(symbols?: string[], intervalMs = 120000) {
  const url = symbols && symbols.length ? `/api/market/quotes?symbols=${symbols.join(',')}` : '/api/market/quotes';
  return useApi<QuotesResponse>(url, { intervalMs });
}

export function QuoteCard({ symbol, data, compact }: { symbol: string; data: QuotesResponse; compact?: boolean }) {
  const r = data.quotes[symbol];
  const a = data.assets[symbol];
  const t = data.technicals[symbol];
  const q = r?.quote;
  const dir = q?.direction ?? 'flat';
  const Icon = dir === 'up' ? ArrowUpRight : dir === 'down' ? ArrowDownRight : Minus;
  const href = symbol === 'XAUUSD' ? '/gold' : `/markets/${symbol}`;
  return (
    <Link href={href} className="card card-hover p-3.5 block">
      <div className="flex items-center justify-between gap-2">
        <div className="font-semibold text-sm tracking-wide">{symbol}</div>
        {q ? <span className={`chip ${dir === 'up' ? 'chip-up' : dir === 'down' ? 'chip-down' : ''} num`}><Icon size={12} />{fmtPct(q.changePct)}</span> : <span className="chip chip-muted">sem dado</span>}
      </div>
      <div className="text-[11px] text-text-3 truncate">{a?.name ?? symbol}{q?.isProxy ? ` · ${q.proxyLabel}` : ''}</div>
      <div className={`mt-2 text-xl font-semibold num ${q ? '' : 'text-text-3'}`}>{q ? fmtPrice(q.price, a?.decimals ?? 2) : 'indisponível'}</div>
      {!compact && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {t && <BiasChip bias={t.bias} small />}
          {t?.volatility && <span className={`chip text-[10px] px-2 py-0.5 ${t.volatility === 'alta' || t.volatility === 'extrema' ? 'chip-warn' : 'chip-muted'}`}>vol {t.volatility}</span>}
          {q?.marketOpen !== undefined && <span className={`chip text-[10px] px-2 py-0.5 ${q.marketOpen ? 'chip-up' : 'chip-muted'}`}>{q.marketOpen ? 'aberto' : 'fechado'}</span>}
          {r?.stale && <span className="chip chip-warn text-[10px] px-2 py-0.5">desatualizado</span>}
        </div>
      )}
      <div className="mt-2 text-[10px] text-text-3 num">{q ? `dado ${relativeTime(q.asOf)} · ${q.source}` : (r?.error ?? '')}</div>
    </Link>
  );
}

export function QuoteGrid({ symbols, intervalMs }: { symbols?: string[]; intervalMs?: number }) {
  const { data, error, loading, refresh } = useQuotes(symbols, intervalMs);
  const list = symbols ?? (data ? Object.keys(data.quotes) : []);
  const anyError = data && Object.values(data.quotes).every((q) => !q.quote);
  return (
    <Card title="Panorama do mercado" subtitle={data ? `Cotações via ${Object.values(data.quotes).find((q) => q.quote)?.quote?.source ?? 'provedor'} · ${relativeTime(data.fetchedAt)}` : undefined} action={data && <StaleBadge at={data.fetchedAt} stale={Object.values(data.quotes).some((q) => q.stale)} />}>
      {error && <ErrorBox message={error} onRetry={refresh} />}
      {anyError && <div className="mb-3"><Notice>Nenhuma cotação disponível: {Object.values(data!.quotes).find((q) => q.error)?.error ?? 'verifique TWELVEDATA_API_KEY'}.</Notice></div>}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
        {loading && !data && Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        {data && list.map((s) => <QuoteCard key={s} symbol={s} data={data} />)}
      </div>
    </Card>
  );
}
