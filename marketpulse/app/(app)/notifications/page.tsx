'use client';
import { useState } from 'react';
import Link from 'next/link';
import { CheckCheck, BellOff } from 'lucide-react';
import { Card, ErrorBox, Empty, Seg } from '@/components/ui';
import { useApi, postJson } from '@/lib/client/useApi';
import { usePrefs } from '@/lib/client/prefs';
import { fmtDateTime, KIND_LABEL } from '@/lib/client/format';
import type { NotificationRecord } from '@/lib/notifications/history';

const KINDS = [{ id: 'all', label: 'Todos' }, { id: 'pre-event', label: 'Notícias' }, { id: 'released', label: 'Resultados' }, { id: 'surprise', label: 'Surpresas' }, { id: 'bias-change', label: 'Cenário' }, { id: 'volatility', label: 'Volatilidade' }, { id: 'analysis', label: 'Análises' }];

export default function NotificationsPage() {
  const { prefs } = usePrefs();
  const [kind, setKind] = useState('all');
  const [symbol, setSymbol] = useState('');
  const qs = new URLSearchParams(); if (kind !== 'all') qs.set('kind', kind); if (symbol) qs.set('symbol', symbol);
  const { data, error, loading, refresh } = useApi<{ items: NotificationRecord[]; unread: number }>(`/api/notifications?${qs}`, { intervalMs: 60000 });
  async function markAll() { await postJson('/api/notifications', { ids: 'all' }); refresh(); }
  async function markOne(id: string) { await postJson('/api/notifications', { ids: [id] }); refresh(); }
  const favorites = Array.from(new Set([...prefs.favorites, ...prefs.customSymbols]));
  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div><h1 className="text-xl font-semibold">Central de notificações</h1><p className="text-xs text-text-3">Histórico de alertas enviados pelo servidor{data ? ` · ${data.unread} não lidos` : ''}</p></div>
        <button className="btn btn-sm" onClick={markAll} disabled={!data?.unread}><CheckCheck size={14} /> Marcar todos como lidos</button>
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <Seg value={kind} options={KINDS} onChange={setKind} />
        <select className="input !w-auto !py-1.5 !text-xs" value={symbol} onChange={(e) => setSymbol(e.target.value)}><option value="">Todos os ativos</option>{favorites.map((s) => <option key={s} value={s}>{s}</option>)}</select>
      </div>
      <Card>
        {error && <ErrorBox message={error} onRetry={refresh} />}
        {loading && !data && <div className="text-sm text-text-3">Carregando…</div>}
        {data && data.items.length === 0 && <Empty><BellOff className="mx-auto mb-2" size={20} />Nenhum alerta com estes filtros. <Link href="/settings" className="underline">Configurar notificações</Link>.</Empty>}
        <ul className="divide-y divide-border">
          {data?.items.map((n) => (
            <li key={n.id} className={`py-3 flex items-start gap-3 ${n.read ? 'opacity-75' : ''}`}>
              <span className={`mt-1 h-2 w-2 rounded-full shrink-0 ${n.read ? 'bg-transparent' : 'bg-accent'}`} />
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2"><span className={`chip text-[10px] px-2 py-0.5 ${n.kind === 'surprise' || n.kind === 'volatility' ? 'chip-warn' : n.kind === 'bias-change' ? 'chip-accent' : 'chip-muted'}`}>{KIND_LABEL[n.kind] ?? n.kind}</span><span className="text-[11px] text-text-3 num">{fmtDateTime(n.at)} · entregue a {n.delivered} dispositivo(s)</span></div>
                <div className="font-medium text-sm mt-1">{n.title}</div>
                <div className="text-sm text-text-2 whitespace-pre-line">{n.body}</div>
                <div className="flex flex-wrap gap-2 mt-1.5">{n.symbols.map((s) => <Link key={s} href={s === 'XAUUSD' ? '/gold' : `/markets/${s}`} className="chip chip-accent text-[10px] px-2 py-0.5">{s}</Link>)}{n.url && <Link href={n.url} className="text-[11px] text-accent-2 underline">abrir</Link>}</div>
              </div>
              {!n.read && <button className="btn btn-sm btn-ghost" onClick={() => markOne(n.id)}>Lido</button>}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
