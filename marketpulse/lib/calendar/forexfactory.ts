/**
 * Feed público do Forex Factory (JSON semanal). Gratuito, sem chave, uso pessoal.
 * Cobre a semana atual e a próxima. Campos: title, country (moeda), date (ISO com offset),
 * impact (High/Medium/Low/Holiday), forecast, previous e — quando divulgado — actual.
 * A presença de "actual" é detectada automaticamente (supportsActuals).
 */
import 'server-only';
import type { EconEvent } from './types';
import { COUNTRY_BY_CURRENCY } from './types';
import { stableEventId, impactFrom, eventStatus } from './normalize';

const URLS = process.env.FF_CALENDAR_URLS?.split(',').map((s) => s.trim()).filter(Boolean) ?? [
  'https://nfs.faireconomy.media/ff_calendar_thisweek.json',
  'https://nfs.faireconomy.media/ff_calendar_nextweek.json',
];

type FFItem = { title?: string; country?: string; date?: string; impact?: string; forecast?: string; previous?: string; actual?: string; url?: string };

export function parseForexFactory(items: unknown[], source = 'Forex Factory'): { events: EconEvent[]; supportsActuals: boolean } {
  const supportsActuals = items.some((i) => typeof i === 'object' && i !== null && 'actual' in (i as object));
  const events: EconEvent[] = [];
  for (const raw of items) {
    const it = raw as FFItem;
    if (!it.title || !it.date) continue;
    const t = new Date(it.date);
    if (Number.isNaN(t.getTime())) continue;
    const currency = (it.country ?? '').toUpperCase();
    const time = t.toISOString();
    const impact = impactFrom(it.impact);
    const ev: EconEvent = {
      id: stableEventId(it.title, currency, time),
      title: it.title.trim(), currency, country: COUNTRY_BY_CURRENCY[currency] ?? currency, time, impact,
      previous: it.previous?.trim() || undefined, forecast: it.forecast?.trim() || undefined, actual: it.actual?.trim() || undefined,
      status: 'scheduled', source, url: it.url,
    };
    ev.status = eventStatus(ev, supportsActuals);
    events.push(ev);
  }
  return { events, supportsActuals };
}

export async function fetchForexFactory(): Promise<{ events: EconEvent[]; supportsActuals: boolean }> {
  const all: unknown[] = [];
  let supportsActuals = false;
  let failures = 0;
  for (const url of URLS) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(12000), cache: 'no-store', headers: { 'user-agent': 'MarketPulse/1.0 (personal use)' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as unknown[];
      if (Array.isArray(json)) all.push(...json);
    } catch (e) {
      failures++;
      if (failures === URLS.length) throw e;
    }
  }
  const parsed = parseForexFactory(all);
  supportsActuals = parsed.supportsActuals;
  // dedupe (as duas semanas podem se sobrepor)
  const seen = new Set<string>();
  const events = parsed.events.filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)));
  return { events, supportsActuals };
}
