'use client';
import { useState } from 'react';
import { Brain, RefreshCw, ShieldAlert, DollarSign, Scale, CalendarClock } from 'lucide-react';
import { Card, Skeleton, ErrorBox, Notice, StaleBadge } from './ui';
import { useApi, postJson } from '@/lib/client/useApi';
import { fmtDateTime, relativeTime, minutesSince } from '@/lib/client/format';
import type { StoredAnalysis } from '@/lib/analysis/schema';

export interface AnalysisResponse { analysis: StoredAnalysis | null; history: { id: string; generatedAt: string; trigger: string }[]; aiConfigured: boolean; model: string }

export function useAnalysis() { return useApi<AnalysisResponse>('/api/analysis', { intervalMs: 5 * 60000 }); }

export function RefreshAnalysisButton({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function run() {
    setBusy(true); setMsg(null);
    const r = await postJson('/api/analysis');
    setBusy(false);
    if (!r.ok) setMsg(r.error ?? 'falha'); else onDone();
  }
  return (
    <div className="flex items-center gap-2">
      {msg && <span className="text-[11px] text-warn max-w-[220px] text-right">{msg}</span>}
      <button className="btn btn-sm" onClick={run} disabled={busy}><RefreshCw size={13} className={busy ? 'animate-spin' : ''} />{busy ? 'Analisando…' : 'Atualizar'}</button>
    </div>
  );
}

export function IntelligencePanel() {
  const { data, error, loading, refresh } = useAnalysis();
  const a = data?.analysis;
  const intel = a?.output.intelligence;
  const regimeCls = intel?.regime.label === 'compradores' ? 'chip-up' : intel?.regime.label === 'vendedores' ? 'chip-down' : 'chip-muted';
  const dollarCls = intel?.dollar.reading === 'força' ? 'chip-up' : intel?.dollar.reading === 'fraqueza' ? 'chip-down' : 'chip-muted';
  const ageMin = a ? minutesSince(a.generatedAt) : 0;
  return (
    <Card title={<span className="flex items-center gap-2"><Brain size={15} className="text-accent-2" /> Market Intelligence</span>}
      subtitle={a ? `Última análise: ${fmtDateTime(a.generatedAt)} (${relativeTime(a.generatedAt)}) · ${a.model}` : 'Resumo inteligente do dia'}
      action={<div className="flex items-center gap-2">{a && <StaleBadge at={a.generatedAt} stale={ageMin > 360} label="gerada" />}{data?.aiConfigured && <RefreshAnalysisButton onDone={refresh} />}</div>}>
      {error && <ErrorBox message={error} onRetry={refresh} />}
      {loading && !data && <div className="space-y-2"><Skeleton className="h-5 w-2/3" /><Skeleton className="h-4" /><Skeleton className="h-4 w-5/6" /><Skeleton className="h-4 w-1/2" /></div>}
      {data && !data.aiConfigured && <Notice>IA não configurada: defina <code>ANTHROPIC_API_KEY</code> no servidor para gerar o Market Intelligence.</Notice>}
      {data && data.aiConfigured && !a && <Notice tone="info">Nenhuma análise gerada ainda. Clique em “Atualizar” (ou aguarde o job automático).</Notice>}
      {a && intel && (
        <div className="space-y-4 fade-up">
          <div className="flex flex-wrap gap-2">
            <span className={`chip ${regimeCls}`}><Scale size={12} /> cenário: {intel.regime.label}</span>
            <span className={`chip ${dollarCls}`}><DollarSign size={12} /> dólar: {intel.dollar.reading}</span>
          </div>
          <Block title="Como está o mercado hoje?"><p>{intel.marketToday}</p></Block>
          <Block title="Cenário" ><p>{intel.regime.rationale}</p></Block>
          <Block title="Dólar: força ou fraqueza?"><p>{intel.dollar.rationale}</p></Block>
          <div className="grid md:grid-cols-2 gap-4">
            <Block title={<span className="flex items-center gap-1.5"><CalendarClock size={13} /> Notícias importantes previstas</span>}><List items={intel.importantNews} /></Block>
            <Block title="Eventos que podem impactar meus ativos"><List items={intel.eventsImpactingAssets} /></Block>
          </div>
          <Block title={<span className="flex items-center gap-1.5 text-warn"><ShieldAlert size={13} /> Principais riscos do dia</span>}><List items={intel.risks} /></Block>
          {a.dataWarnings.length > 0 && (
            <details className="text-xs text-text-3"><summary className="cursor-pointer">Avisos de dados ({a.dataWarnings.length})</summary><ul className="list-disc pl-4 mt-1 space-y-0.5">{a.dataWarnings.map((w, i) => <li key={i}>{w}</li>)}</ul></details>
          )}
          <p className="text-[11px] text-text-3 border-t border-border pt-3">Fontes: {a.sources.map((s) => `${s.name} (${fmtDateTime(s.asOf)}${s.note ? `, ${s.note}` : ''})`).join(' · ')}. {a.output.disclaimer}</p>
        </div>
      )}
    </Card>
  );
}

export function Block({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return <div><h3 className="text-xs font-semibold text-text-2 mb-1">{title}</h3><div className="text-sm text-text leading-relaxed prose-mp">{children}</div></div>;
}
export function List({ items, empty = '—' }: { items: string[]; empty?: string }) {
  if (!items.length) return <p className="text-text-3 text-sm">{empty}</p>;
  return <ul className="list-disc pl-4 space-y-1 text-sm">{items.map((it, i) => <li key={i}>{it}</li>)}</ul>;
}
