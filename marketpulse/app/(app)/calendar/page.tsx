'use client';
import { useMemo, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { EventRow, EventDetailSheet, EventListSkeleton } from '@/components/EventList';
import { Card, ErrorBox, Empty, StaleBadge, Notice, Seg } from '@/components/ui';
import { useApi } from '@/lib/client/useApi';
import { usePrefs } from '@/lib/client/prefs';
import { fmtDate, fmtDateTime } from '@/lib/client/format';
import { ALL_CURRENCIES } from '@/lib/assets';
import type { EconEvent } from '@/lib/calendar/types';

type Range = 'today' | 'tomorrow' | 'week' | 'next7';
const RANGES: { id: Range; label: string }[] = [{ id: 'today', label: 'Hoje' }, { id: 'tomorrow', label: 'Amanhã' }, { id: 'week', label: 'Esta semana' }, { id: 'next7', label: 'Próximos 7 dias' }];
const IMPACTS = [{ id: 'high', label: 'Alto' }, { id: 'medium', label: 'Médio' }, { id: 'low', label: 'Baixo' }];

function CalendarInner({ initialEvent }: { initialEvent: string | null }) {
  const { prefs, ready } = usePrefs();
  const [range, setRange] = useState<Range>('today');
  const [currencyOverride, setCurrencies] = useState<string[] | null>(null); // null = usa as moedas das preferências
  const currencies = currencyOverride ?? prefs.currencies;
  const [impacts, setImpacts] = useState<string[]>(['high', 'medium']);
  const [asset, setAsset] = useState<string>('');
  const [sel, setSel] = useState<string | null>(initialEvent);

  const qs = useMemo(() => { const q = new URLSearchParams({ range }); if (currencies.length) q.set('currencies', currencies.join(',')); if (impacts.length) q.set('impacts', impacts.join(',')); if (asset) q.set('asset', asset); return q.toString(); }, [range, currencies, impacts, asset]);
  const { data, error, loading, refresh } = useApi<{ events: EconEvent[]; fetchedAt: string; source: string; supportsActuals: boolean; stale: boolean; error?: string; rangeStart: string; rangeEnd: string }>(ready ? `/api/calendar?${qs}` : null, { intervalMs: 2 * 60000 });
  const toggle = (arr: string[], v: string, set: (a: string[]) => void) => set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const grouped = useMemo(() => { const m = new Map<string, EconEvent[]>(); for (const e of data?.events ?? []) { const k = fmtDate(e.time); m.set(k, [...(m.get(k) ?? []), e]); } return Array.from(m.entries()); }, [data]);
  const favorites = Array.from(new Set([...prefs.favorites, ...prefs.customSymbols]));

  return (
    <div className="space-y-4">
      <div><h1 className="text-xl font-semibold">Calendário econômico</h1><p className="text-xs text-text-3">Horários em Brasília (fuso {prefs.timezone}); horário de verão dos EUA já aplicado pelo provedor.</p></div>
      <Card>
        <div className="space-y-3">
          <Seg value={range} options={RANGES} onChange={setRange} />
          <div className="flex flex-wrap gap-1.5">{ALL_CURRENCIES.map((c) => <button key={c} onClick={() => toggle(currencies, c, setCurrencies)} className={`chip ${currencies.includes(c) ? 'chip-accent' : ''}`}>{c}</button>)}</div>
          <div className="flex flex-wrap gap-1.5 items-center">
            {IMPACTS.map((i) => <button key={i.id} onClick={() => toggle(impacts, i.id, setImpacts)} className={`chip ${impacts.includes(i.id) ? (i.id === 'high' ? 'chip-down' : i.id === 'medium' ? 'chip-warn' : 'chip-accent') : ''}`}>{i.label}</button>)}
            <select className="input !w-auto !py-1 !text-xs ml-auto" value={asset} onChange={(e) => setAsset(e.target.value)}><option value="">Todos os ativos</option>{favorites.map((s) => <option key={s} value={s}>{s}</option>)}</select>
          </div>
        </div>
      </Card>
      {data && !data.supportsActuals && <Notice>O provedor {data.source} não publica resultados divulgados (apenas anterior/previsão). Para “Resultado divulgado” automático, configure Trading Economics ou FMP (README).</Notice>}
      {data?.stale && <Notice>Calendário desatualizado{data.error ? `: ${data.error}` : ''}. Mostrando a última sincronização bem-sucedida.</Notice>}
      <Card title={`Eventos (${data?.events.length ?? 0})`} subtitle={data ? `Fonte: ${data.source} · cobertura ${fmtDate(data.rangeStart)} – ${fmtDate(data.rangeEnd)} · sincronizado ${fmtDateTime(data.fetchedAt)}` : undefined} action={data && <StaleBadge at={data.fetchedAt} stale={data.stale} />}>
        {error && <ErrorBox message={error} onRetry={refresh} />}
        {loading && !data && <EventListSkeleton />}
        {data && data.events.length === 0 && <Empty>Nenhum evento com estes filtros.</Empty>}
        {grouped.map(([day, evs]) => (
          <div key={day} className="mb-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-text-3 py-1 sticky top-12 lg:top-0 bg-surface/95 backdrop-blur">{day}</div>
            {evs.map((e) => <EventRow key={e.id} ev={e} onSelect={(ev) => setSel(ev.id)} />)}
          </div>
        ))}
      </Card>
      <EventDetailSheet id={sel} onClose={() => setSel(null)} />
    </div>
  );
}

function CalendarWithParams() {
  const params = useSearchParams();
  const ev = params.get('event');
  // key força estado limpo quando um alerta abre outro evento
  return <CalendarInner key={ev ?? ''} initialEvent={ev} />;
}

export default function CalendarPage() { return <Suspense><CalendarWithParams /></Suspense>; }
