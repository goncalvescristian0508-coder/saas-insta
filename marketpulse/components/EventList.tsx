'use client';
import { useEffect, useState } from 'react';
import { X, ExternalLink } from 'lucide-react';
import { ImpactDot, Skeleton, Notice, Empty } from './ui';
import { fmtTime, fmtDate, fmtDateTime, isPast, IMPACT_LABEL, STATUS_LABEL } from '@/lib/client/format';
import type { EconEvent } from '@/lib/calendar/types';

const FLAG: Record<string, string> = { USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', JPY: '🇯🇵', CHF: '🇨🇭', AUD: '🇦🇺', CAD: '🇨🇦', NZD: '🇳🇿', CNY: '🇨🇳' };

export function EventRow({ ev, onSelect, showDate }: { ev: EconEvent; onSelect?: (e: EconEvent) => void; showDate?: boolean }) {
  const past = isPast(ev.time);
  const statusCls = ev.status === 'released' ? 'chip-accent' : ev.status === 'delayed' ? 'chip-warn' : ev.status === 'unavailable' ? 'chip-muted' : '';
  return (
    <button onClick={() => onSelect?.(ev)} className={`w-full text-left flex items-center gap-3 py-2.5 border-b border-border last:border-0 hover:bg-surface-2/60 rounded-md px-1 transition-colors ${past && ev.status !== 'released' ? 'opacity-70' : ''}`}>
      <div className="w-14 shrink-0 text-xs num text-text-2">{showDate && <div className="text-[10px] text-text-3">{fmtDate(ev.time)}</div>}{fmtTime(ev.time)}</div>
      <div className="w-8 shrink-0 text-xs" title={ev.country}>{FLAG[ev.currency] ?? ev.currency}</div>
      <ImpactDot impact={ev.impact} />
      <div className="flex-1 min-w-0"><div className="text-sm truncate">{ev.title}</div><div className="text-[10px] text-text-3">{ev.currency} · {IMPACT_LABEL[ev.impact]}</div></div>
      <div className="hidden sm:grid grid-cols-3 gap-2 text-[11px] num w-48 text-right">
        <div><div className="text-text-3 text-[9px]">anterior</div>{ev.previous ?? '—'}</div>
        <div><div className="text-text-3 text-[9px]">previsão</div>{ev.forecast ?? '—'}</div>
        <div className={ev.actual ? 'font-semibold text-accent-2' : ''}><div className="text-text-3 text-[9px]">resultado</div>{ev.actual ?? '—'}</div>
      </div>
      <span className={`chip ${statusCls} text-[10px] px-2 py-0.5 hidden sm:inline-flex`}>{STATUS_LABEL[ev.status]}</span>
      {ev.actual && <span className="sm:hidden text-xs num font-semibold text-accent-2">{ev.actual}</span>}
    </button>
  );
}

interface Detail { event: EconEvent; info: { name: string; what: string; why: string; scenarios: { above: string; below: string } } | null; affectedAssets: string[]; supportsActuals: boolean; source: string; fetchedAt: string }

export function EventDetailSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  if (!id) return null;
  // key = id garante estado limpo ao trocar de evento
  return <SheetInner key={id} id={id} onClose={onClose} />;
}

function SheetInner({ id, onClose }: { id: string; onClose: () => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(`/api/calendar?event=${encodeURIComponent(id)}`, { cache: 'no-store' }).then(async (r) => { const j = await r.json(); if (!alive) return; if (!r.ok) setErr(j.error ?? 'erro'); else setD(j); }).catch((e) => { if (alive) setErr(String(e)); });
    return () => { alive = false; };
  }, [id]);
  const ev = d?.event;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sheet-backdrop" onClick={onClose}>
      <div className="card w-full sm:max-w-lg max-h-[88dvh] overflow-y-auto rounded-b-none sm:rounded-b-[14px] p-5 safe-bottom fade-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>{ev ? <><h2 className="font-semibold">{ev.title}</h2><p className="text-xs text-text-3">{FLAG[ev.currency] ?? ''} {ev.currency} · {fmtDateTime(ev.time)} (Brasília) · impacto {IMPACT_LABEL[ev.impact].toLowerCase()} · {STATUS_LABEL[ev.status]}</p></> : <Skeleton className="h-5 w-48" />}</div>
          <button className="btn btn-sm btn-ghost" onClick={onClose} aria-label="Fechar"><X size={16} /></button>
        </div>
        {err && <Notice>{err}</Notice>}
        {ev && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-3 gap-2">
              {[['Anterior', ev.previous], ['Previsão', ev.forecast], ['Resultado', ev.actual]].map(([l, v]) => <div key={l} className="rounded-lg bg-surface-2/60 border border-border p-2.5 text-center"><div className="text-[10px] uppercase text-text-3">{l}</div><div className={`num text-base ${l === 'Resultado' && v ? 'text-accent-2 font-semibold' : ''}`}>{v ?? '—'}</div></div>)}
            </div>
            {ev.revised && <Notice tone="info">Valor anterior revisado: {ev.revised}</Notice>}
            {!d?.supportsActuals && <Notice>O provedor atual ({d?.source}) não publica resultados divulgados. Para resultados automáticos, configure Trading Economics ou FMP (veja o README).</Notice>}
            {ev.status === 'delayed' && <Notice>Resultado ainda não publicado pelo provedor (atrasado ou com horário alterado).</Notice>}
            {d?.info ? (
              <>
                <section><h3 className="text-xs font-semibold text-text-2 mb-1">{d.info.name}</h3><p>{d.info.what}</p></section>
                <section><h3 className="text-xs font-semibold text-text-2 mb-1">Relevância</h3><p>{d.info.why}</p></section>
                <section><h3 className="text-xs font-semibold text-text-2 mb-1">Cenários possíveis</h3>
                  <ul className="space-y-1"><li><span className="text-up font-semibold">Acima do esperado:</span> {d.info.scenarios.above}</li><li><span className="text-down font-semibold">Abaixo do esperado:</span> {d.info.scenarios.below}</li></ul>
                  <p className="text-[11px] text-text-3 mt-1">Relações típicas; a reação real depende do contexto (expectativas já precificadas, revisões, outros dados do dia).</p></section>
              </>
            ) : <p className="text-text-3 text-xs">Sem explicação catalogada para este indicador.</p>}
            <section><h3 className="text-xs font-semibold text-text-2 mb-1">Ativos monitorados potencialmente afetados</h3>
              <div className="flex flex-wrap gap-1.5">{d?.affectedAssets.length ? d.affectedAssets.map((s) => <span key={s} className="chip chip-accent">{s}</span>) : <span className="text-text-3 text-xs">nenhum dos seus favoritos usa {ev.currency}</span>}</div></section>
            <p className="text-[11px] text-text-3">Fonte: {d?.source} · sincronizado {d ? fmtDateTime(d.fetchedAt) : ''} {ev.url && <a href={ev.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent-2 ml-2">abrir na fonte <ExternalLink size={10} /></a>}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export function EventListSkeleton() { return <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>; }
export { Empty };
