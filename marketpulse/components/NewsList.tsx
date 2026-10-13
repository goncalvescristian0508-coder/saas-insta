'use client';
import { ExternalLink } from 'lucide-react';
import { Card, Skeleton, ErrorBox, Empty, StaleBadge, Notice } from './ui';
import { useApi } from '@/lib/client/useApi';
import { relativeTime } from '@/lib/client/format';
import type { NewsItem } from '@/lib/news/service';

export interface NewsResponse { items: NewsItem[]; fetchedAt: string | null; stale: boolean; failures: string[]; feeds: string[] }

export function NewsList({ symbol, tag, limit = 20, title = 'Notícias', compact }: { symbol?: string; tag?: string; limit?: number; title?: string; compact?: boolean }) {
  const qs = new URLSearchParams(); if (symbol) qs.set('symbol', symbol); if (tag) qs.set('tag', tag);
  const { data, error, loading, refresh } = useApi<NewsResponse>(`/api/news?${qs}`, { intervalMs: 10 * 60000 });
  const items = data?.items.slice(0, limit) ?? [];
  return (
    <Card title={title} subtitle={data?.feeds ? `Fontes RSS: ${data.feeds.join(', ')}` : undefined} action={data?.fetchedAt && <StaleBadge at={data.fetchedAt} stale={data.stale} />}>
      {error && <ErrorBox message={error} onRetry={refresh} />}
      {loading && !data && <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9" />)}</div>}
      {data && data.failures.length > 0 && items.length === 0 && <Notice>Feeds indisponíveis: {data.failures.join('; ')}</Notice>}
      {data && items.length === 0 && data.failures.length === 0 && <Empty>Nenhuma manchete {symbol ? `relacionada a ${symbol}` : ''} no momento.</Empty>}
      <ul className="divide-y divide-border">
        {items.map((n) => (
          <li key={n.id} className="py-2.5">
            <a href={n.link} target="_blank" rel="noreferrer" className="group flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className={`text-sm leading-snug group-hover:text-accent-2 ${n.importance === 'high' ? 'font-medium' : ''}`}>{n.title}</div>
                <div className="text-[11px] text-text-3 mt-0.5 flex flex-wrap gap-x-2">{n.source} · {relativeTime(n.publishedAt)}{!compact && n.assets.slice(0, 4).map((a) => <span key={a} className="text-accent-2">{a}</span>)}</div>
              </div>
              <ExternalLink size={12} className="text-text-3 mt-1 shrink-0" />
            </a>
          </li>
        ))}
      </ul>
      {data && data.failures.length > 0 && items.length > 0 && <p className="text-[10px] text-text-3 mt-2">Alguns feeds falharam: {data.failures.join('; ')}</p>}
    </Card>
  );
}
