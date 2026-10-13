/**
 * Scheduled Job ("tick"): roda a cada minuto via Vercel Cron (ou agendador externo).
 * Etapas: lock -> sincronizar calendário -> alertas pré-evento -> resultados/surpresas/revisões ->
 * aquecer cotações/candles -> análise agendada (ou pós-evento) -> alertas de viés/volatilidade.
 * Idempotente: toda notificação usa chave de deduplicação.
 */
import 'server-only';
import { kv } from '../kv';
import { logger, errMsg } from '../logger';
import { getPrefs } from '../prefs/service';
import { getCalendar } from '../calendar/service';
import { getQuotes, warmCandles, getCandles } from '../market/service';
import { technicalSnapshot } from '../market/technicals';
import { runAnalysis, analysisDue } from '../analysis/engine';
import { notifyOnce } from '../notifications/service';
import { eventMatchesPrefs, affectedAssets, dueLeadTimes, dedupKey, preEventMessage, releasedMessage, revisionMessage, biasChangeMessage, volatilityMessage, analysisUpdatedMessage, detectSurprise } from '../notifications/rules';
import { isForexOpen, dayKey } from '../time';
import { resolveAsset } from '../assets';

const log = logger('tick');
const LOCK = 'tick:lock';
const LAST_KEY = 'tick:last';

export interface TickReport { at: string; ms: number; steps: Record<string, unknown>; errors: string[] }

export async function getLastTick(): Promise<TickReport | null> { return kv().get<TickReport>(LAST_KEY); }

export async function runTick(): Promise<TickReport> {
  const started = Date.now();
  const report: TickReport = { at: new Date().toISOString(), ms: 0, steps: {}, errors: [] };
  if (!(await kv().setnx(LOCK, '1', 55))) { report.steps.skipped = 'tick anterior ainda em execução'; return report; }
  try {
    const prefs = await getPrefs();
    const now = Date.now();
    const symbols = Array.from(new Set([...prefs.favorites, ...prefs.customSymbols]));

    // 1) Calendário: sincroniza (TTL interno evita chamadas excessivas) e captura mudanças
    const { snapshot: cal, changes } = await getCalendar({ sync: true });
    report.steps.calendar = { events: cal.events.length, stale: cal.stale, released: changes.released.length, revised: changes.revised.length, source: cal.source };

    // 2) Alertas pré-evento
    let pre = 0;
    if (prefs.alerts.preEvent) {
      for (const ev of cal.events) {
        if (!eventMatchesPrefs(ev, prefs)) continue;
        for (const lead of dueLeadTimes(ev, prefs.leadTimes, now)) {
          if (await notifyOnce(dedupKey.preEvent(ev.id, lead), preEventMessage(ev, lead, affectedAssets(ev, prefs)))) pre++;
        }
      }
    }
    report.steps.preEventAlerts = pre;

    // 3) Resultados divulgados, surpresas e revisões
    let rel = 0, rev = 0; let highImpactReleased = false;
    for (const ev of changes.released) {
      if (!eventMatchesPrefs(ev, prefs)) continue;
      const surprise = detectSurprise(ev);
      const relevant = surprise?.relevant ?? false;
      if (!prefs.alerts.released && !(prefs.alerts.surprise && relevant)) continue;
      if (await notifyOnce(dedupKey.released(ev.id), releasedMessage(ev, affectedAssets(ev, prefs)))) rel++;
      if (ev.impact === 'high' || relevant) highImpactReleased = true;
    }
    for (const { event, from, to } of changes.revised) {
      if (!eventMatchesPrefs(event, prefs) || !prefs.alerts.released) continue;
      if (await notifyOnce(dedupKey.revised(event.id, to), revisionMessage(event, from, to, affectedAssets(event, prefs)))) rev++;
    }
    report.steps.releasedAlerts = rel; report.steps.revisionAlerts = rev;

    // 4) Dados de mercado (respeitando orçamento de créditos) — só com mercado aberto
    const open = isForexOpen();
    if (open) {
      const q = await getQuotes(symbols);
      const warm = await warmCandles(symbols);
      report.steps.market = { quotes: Object.values(q).filter((x) => x.quote && !x.stale).length, candlesFetched: warm.fetched.length, candlesPending: warm.pending.length };
    } else report.steps.market = 'mercado fechado';

    // 5) Análise: agendada pelo intervalo, ou após divulgação de alto impacto (com atraso de 10 min para o mercado reagir)
    let analysisRan = false;
    if (highImpactReleased) await kv().set('analysis:event-trigger-at', now + 10 * 60000, 3600);
    const eventTriggerAt = await kv().get<number>('analysis:event-trigger-at');
    const eventDue = eventTriggerAt !== null && now >= Number(eventTriggerAt);
    if (eventDue || (await analysisDue(prefs.analysisIntervalMinutes, open))) {
      const r = await runAnalysis(eventDue ? 'event' : 'scheduled');
      if (eventDue) await kv().del('analysis:event-trigger-at');
      report.steps.analysis = r.ok ? { id: r.analysis?.id, biasChanges: r.biasChanges } : { skipped: r.skipped };
      analysisRan = r.ok;
      if (r.ok && r.analysis) {
        const day = dayKey(new Date());
        if (prefs.alerts.biasChange) for (const c of r.biasChanges) {
          const a = r.analysis.output.assets.find((x) => x.symbol === c.symbol);
          await notifyOnce(dedupKey.bias(c.symbol, c.from, c.to, day), biasChangeMessage(c.symbol, c.from, c.to, a?.summary ?? ''));
        }
        if (prefs.alerts.analysisUpdated) await notifyOnce(dedupKey.analysis(r.analysis.id), analysisUpdatedMessage(r.analysis.output.intelligence.regime.label, r.analysis.output.intelligence.dollar.reading));
      }
    }
    if (!analysisRan && report.steps.analysis === undefined) report.steps.analysis = 'não devida';

    // 6) Alerta de volatilidade extrema (ATR H1 >= 1.8x média) — 1 por ativo por 4h
    let vol = 0;
    if (open && prefs.alerts.volatility) {
      for (const s of symbols) {
        const sym = resolveAsset(s).symbol;
        const h1 = await getCandles(sym, '1h', { allowFetch: false });
        if (!h1.series || h1.stale) continue;
        const t = technicalSnapshot(sym, h1.series.candles, 'H1');
        if (t.volatility === 'extrema' && t.atrPct !== undefined) {
          const hourKey = String(Math.floor(now / (4 * 3600000)));
          if (await notifyOnce(dedupKey.volatility(sym, hourKey), volatilityMessage(sym, t.atrPct, t.volatility), 5 * 3600)) vol++;
        }
      }
    }
    report.steps.volatilityAlerts = vol;
  } catch (e) {
    report.errors.push(errMsg(e));
    log.error('tick falhou', { message: errMsg(e) });
  } finally {
    await kv().del(LOCK);
  }
  report.ms = Date.now() - started;
  await kv().set(LAST_KEY, report, 24 * 3600);
  log.info('tick concluído', { ms: report.ms, errors: report.errors.length });
  return report;
}
