'use client';
import { Card, Toggle, Notice, Seg } from '@/components/ui';
import { PushSettings } from '@/components/PushSettings';
import { usePrefs } from '@/lib/client/prefs';
import { ASSETS, ALL_CURRENCIES } from '@/lib/assets';
import { NEWS_TYPES, type LeadMinutes, type Impact } from '@/lib/prefs/types';
import { useApi } from '@/lib/client/useApi';
import { fmtDateTime } from '@/lib/client/format';

const LEADS: LeadMinutes[] = [60, 30, 15, 5];
const IMPACTS: { id: Impact; label: string }[] = [{ id: 'high', label: 'Alto' }, { id: 'medium', label: 'Médio' }, { id: 'low', label: 'Baixo' }];
const TZS = ['America/Sao_Paulo', 'America/Manaus', 'America/Rio_Branco', 'America/Noronha', 'UTC', 'America/New_York', 'Europe/London', 'Europe/Lisbon'];

export default function SettingsPage() {
  const { prefs, ready, save, syncing, syncError } = usePrefs();
  const status = useApi<{ features: Record<string, boolean | string>; storage: string; lastTick: { at: string; steps: Record<string, unknown>; errors: string[] } | null }>('/api/status', { intervalMs: 60000 });
  const toggleIn = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  if (!ready) return null;
  const f = status.data?.features;
  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between"><div><h1 className="text-xl font-semibold">Configurações</h1><p className="text-xs text-text-3">Salvas no dispositivo e sincronizadas com o servidor (usadas pelos alertas automáticos).</p></div>{syncing && <span className="chip chip-muted">sincronizando…</span>}</div>
      {syncError && <Notice>{syncError}</Notice>}

      <PushSettings />

      <Card title="Alertas" subtitle="Ative ou desative cada tipo individualmente">
        <Toggle label="Antes das notícias" description="Lembretes com a antecedência escolhida abaixo" checked={prefs.alerts.preEvent} onChange={(v) => save({ alerts: { ...prefs.alerts, preEvent: v } })} />
        <div className="flex flex-wrap gap-2 py-1 pl-1">{LEADS.map((l) => <button key={l} className={`chip ${prefs.leadTimes.includes(l) ? 'chip-accent' : ''}`} onClick={() => save({ leadTimes: toggleIn(prefs.leadTimes, l) })}>{l >= 60 ? '1 hora' : `${l} min`} antes</button>)}</div>
        <Toggle label="Quando o resultado for publicado" description="Inclui revisões de dados (requer provedor com resultados)" checked={prefs.alerts.released} onChange={(v) => save({ alerts: { ...prefs.alerts, released: v } })} />
        <Toggle label="Surpresa econômica relevante" description="Resultado ≥10% distante da previsão ou com sinal invertido" checked={prefs.alerts.surprise} onChange={(v) => save({ alerts: { ...prefs.alerts, surprise: v } })} />
        <Toggle label="Mudança de viés de um ativo" description="Somente quando confirmada por nova análise com dados completos/parciais" checked={prefs.alerts.biasChange} onChange={(v) => save({ alerts: { ...prefs.alerts, biasChange: v } })} />
        <Toggle label="Volatilidade extrema" description="ATR H1 muito acima da média recente" checked={prefs.alerts.volatility} onChange={(v) => save({ alerts: { ...prefs.alerts, volatility: v } })} />
        <Toggle label="Análise atualizada" description="Aviso a cada nova rodada do Market Intelligence" checked={prefs.alerts.analysisUpdated} onChange={(v) => save({ alerts: { ...prefs.alerts, analysisUpdated: v } })} />
      </Card>

      <Card title="Ativos favoritos">
        <div className="flex flex-wrap gap-2">{ASSETS.map((a) => <button key={a.symbol} className={`chip ${prefs.favorites.includes(a.symbol) ? 'chip-accent' : ''}`} onClick={() => save({ favorites: toggleIn(prefs.favorites, a.symbol) })}>{a.symbol}</button>)}</div>
        {prefs.customSymbols.length > 0 && <div className="flex flex-wrap gap-2 mt-2">{prefs.customSymbols.map((s) => <button key={s} className="chip chip-accent" onClick={() => save({ customSymbols: prefs.customSymbols.filter((x) => x !== s) })}>{s} ×</button>)}</div>}
        <p className="text-[11px] text-text-3 mt-2">Adicione outros símbolos na página Mercado.</p>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card title="Moedas e países monitorados" subtitle="Filtram o calendário e os alertas">
          <div className="flex flex-wrap gap-2">{ALL_CURRENCIES.map((c) => <button key={c} className={`chip ${prefs.currencies.includes(c) ? 'chip-accent' : ''}`} onClick={() => save({ currencies: toggleIn(prefs.currencies, c) })}>{c}</button>)}</div>
        </Card>
        <Card title="Níveis de impacto" subtitle="Eventos que geram alertas">
          <div className="flex flex-wrap gap-2">{IMPACTS.map((i) => <button key={i.id} className={`chip ${prefs.impacts.includes(i.id) ? (i.id === 'high' ? 'chip-down' : i.id === 'medium' ? 'chip-warn' : 'chip-accent') : ''}`} onClick={() => save({ impacts: toggleIn(prefs.impacts, i.id) })}>{i.label}</button>)}</div>
        </Card>
      </div>

      <Card title="Tipos de notícias" subtitle="Temas de interesse na Central de notícias">
        <div className="flex flex-wrap gap-2">{NEWS_TYPES.map((t) => <button key={t.id} className={`chip ${prefs.newsTypes.includes(t.id) ? 'chip-accent' : ''}`} onClick={() => save({ newsTypes: toggleIn(prefs.newsTypes, t.id) })}>{t.label}</button>)}</div>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card title="Horário local e tema">
          <label className="block text-xs text-text-2 mb-1">Fuso horário de exibição</label>
          <select className="input mb-3" value={prefs.timezone} onChange={(e) => save({ timezone: e.target.value })}>{TZS.map((t) => <option key={t} value={t}>{t}</option>)}</select>
          <label className="block text-xs text-text-2 mb-1">Tema</label>
          <Seg value={prefs.theme} options={[{ id: 'dark', label: 'Escuro' }, { id: 'light', label: 'Claro' }, { id: 'system', label: 'Sistema' }]} onChange={(v) => save({ theme: v })} />
        </Card>
        <Card title="Frequência" subtitle="Controla custo de IA e de cotações">
          <label className="block text-xs text-text-2 mb-1">Análises automáticas (minutos, com mercado aberto)</label>
          <Seg value={String(prefs.analysisIntervalMinutes)} options={[{ id: '60', label: '60' }, { id: '120', label: '120' }, { id: '240', label: '240' }, { id: '480', label: '480' }]} onChange={(v) => save({ analysisIntervalMinutes: Number(v) })} />
          <p className="text-[11px] text-text-3 mt-1 mb-3">Além do intervalo, uma análise extra roda ~10 min após divulgações de alto impacto.</p>
          <label className="block text-xs text-text-2 mb-1">Atualização das cotações na tela (segundos)</label>
          <Seg value={String(prefs.quoteRefreshSeconds)} options={[{ id: '60', label: '60' }, { id: '120', label: '120' }, { id: '300', label: '300' }]} onChange={(v) => save({ quoteRefreshSeconds: Number(v) })} />
        </Card>
      </div>

      <Card title="Status do sistema" subtitle="Diagnóstico das integrações">
        {status.data && (
          <div className="grid sm:grid-cols-2 gap-2 text-xs">
            {[['Cotações (Twelve Data)', f?.market], ['Calendário', f?.calendar], [`IA (${f?.aiModel})`, f?.ai], ['Web Push (VAPID)', f?.push], ['Redis/KV', f?.kv], ['Cron (CRON_SECRET)', f?.cron], ['Juros (FRED)', f?.fred], ['Autenticação', f?.auth]].map(([l, v]) => <div key={String(l)} className="flex justify-between rounded-md bg-surface-2/60 border border-border p-2"><span className="text-text-2">{l}</span><span className={v ? 'text-up' : 'text-warn'}>{v ? 'ok' : 'não configurado'}</span></div>)}
            <div className="sm:col-span-2 text-text-3">Armazenamento: {status.data.storage} · Provedor de calendário: {String(f?.calendarProvider)} · Último job: {status.data.lastTick ? `${fmtDateTime(status.data.lastTick.at)} ${status.data.lastTick.errors.length ? `(erros: ${status.data.lastTick.errors.join('; ')})` : ''}` : 'nunca'}</div>
            {status.data.lastTick && <details className="sm:col-span-2 text-text-3"><summary className="cursor-pointer">Detalhes do último job</summary><pre className="text-[10px] whitespace-pre-wrap mt-1">{JSON.stringify(status.data.lastTick.steps, null, 1)}</pre></details>}
          </div>
        )}
      </Card>
    </div>
  );
}
