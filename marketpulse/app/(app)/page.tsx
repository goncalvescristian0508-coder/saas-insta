'use client';
import Link from 'next/link';
import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { QuoteGrid } from '@/components/QuoteGrid';
import { IntelligencePanel } from '@/components/IntelligencePanel';
import { EventRow, EventDetailSheet, EventListSkeleton } from '@/components/EventList';
import { Card, ErrorBox, Empty, StaleBadge, Notice } from '@/components/ui';
import { useApi } from '@/lib/client/useApi';
import { usePrefs } from '@/lib/client/prefs';
import { relativeTime, KIND_LABEL } from '@/lib/client/format';
import type { EconEvent } from '@/lib/calendar/types';
import type { NotificationRecord } from '@/lib/notifications/history';

export default function DashboardPage() {
  const { prefs, ready } = usePrefs();
  const [sel, setSel] = useState<string | null>(null);
  const symbols = ready ? Array.from(new Set([...prefs.favorites, ...prefs.customSymbols])) : undefined;
  const cal = useApi<{ events: EconEvent[]; fetchedAt: string; stale: boolean; source: string; error?: string }>(ready ? `/api/calendar?range=today&currencies=${prefs.currencies.join(',')}&impacts=high,medium` : null, { intervalMs: 5 * 60000 });
  const notif = useApi<{ items: NotificationRecord[] }>('/api/notifications', { intervalMs: 60000 });
  const status = useApi<{ features: Record<string, boolean | string>; storage: string; subscriptions: number; lastTick: { at: string } | null }>('/api/status');
  const f = status.data?.features;
  const missing = f ? [!f.market && 'cotações (TWELVEDATA_API_KEY)', !f.ai && 'IA (ANTHROPIC_API_KEY)', !f.push && 'push (VAPID)', !f.kv && 'Redis (persistência)', !f.cron && 'cron (CRON_SECRET)'].filter(Boolean) as string[] : [];

  return (
    <div className="space-y-4 lg:space-y-5">
      <div className="flex items-end justify-between">
        <div><h1 className="text-xl font-semibold">Dashboard</h1><p className="text-xs text-text-3">Ouro, forex e índices americanos · horários em Brasília</p></div>
        {status.data?.lastTick && <span className="chip chip-muted hidden sm:inline-flex">job automático {relativeTime(status.data.lastTick.at)}</span>}
      </div>
      {missing.length > 0 && <Notice>Configuração incompleta: {missing.join(' · ')}. {status.data?.storage === 'memory' && 'Armazenamento em memória (não persistente). '}Veja o README.</Notice>}
      {status.data && f?.cron && !status.data.lastTick && <Notice>O job automático ainda não rodou. Na Vercel, confira o Cron em <code>vercel.json</code>; em outro host, agende <code>GET /api/cron/tick</code> a cada minuto.</Notice>}

      <QuoteGrid symbols={symbols} intervalMs={ready ? prefs.quoteRefreshSeconds * 1000 : undefined} />
      <IntelligencePanel />

      <div className="grid lg:grid-cols-2 gap-4 lg:gap-5">
        <Card title="Eventos de hoje" subtitle={cal.data ? `${cal.data.source} · impacto alto e médio` : undefined} action={<div className="flex items-center gap-2">{cal.data && <StaleBadge at={cal.data.fetchedAt} stale={cal.data.stale} />}<Link href="/calendar" className="btn btn-sm btn-ghost">Calendário <ChevronRight size={13} /></Link></div>}>
          {cal.error && <ErrorBox message={cal.error} onRetry={cal.refresh} />}
          {cal.loading && !cal.data && <EventListSkeleton />}
          {cal.data && cal.data.events.length === 0 && <Empty>Sem eventos de impacto alto/médio hoje para {prefs.currencies.join(', ')}.</Empty>}
          {cal.data?.events.slice(0, 12).map((e) => <EventRow key={e.id} ev={e} onSelect={(ev) => setSel(ev.id)} />)}
        </Card>
        <Card title="Últimos alertas" action={<Link href="/notifications" className="btn btn-sm btn-ghost">Central <ChevronRight size={13} /></Link>}>
          {notif.error && <ErrorBox message={notif.error} onRetry={notif.refresh} />}
          {notif.data && notif.data.items.length === 0 && <Empty>Nenhum alerta ainda. Ative as notificações em Configurações.</Empty>}
          <ul className="divide-y divide-border">
            {notif.data?.items.slice(0, 8).map((n) => (
              <li key={n.id} className="py-2.5 flex items-start gap-3">
                <span className={`chip text-[10px] px-2 py-0.5 shrink-0 ${n.kind === 'surprise' || n.kind === 'volatility' ? 'chip-warn' : n.kind === 'bias-change' ? 'chip-accent' : 'chip-muted'}`}>{KIND_LABEL[n.kind] ?? n.kind}</span>
                <div className="min-w-0 flex-1"><div className={`text-sm truncate ${n.read ? 'text-text-2' : ''}`}>{n.title}</div><div className="text-[11px] text-text-3">{relativeTime(n.at)}{n.symbols.length ? ` · ${n.symbols.join(', ')}` : ''}</div></div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <EventDetailSheet id={sel} onClose={() => setSel(null)} />
    </div>
  );
}
