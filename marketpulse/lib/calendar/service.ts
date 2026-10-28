/**
 * Economic Calendar Service: sincroniza eventos (cache), detecta resultados novos e revisões,
 * e aplica filtros. Horários sempre ISO UTC; a conversão para Brasília é feita na UI.
 */
import 'server-only';
import { config } from '../config';
import { kv } from '../kv';
import { logger, errMsg } from '../logger';
import { fetchForexFactory } from './forexfactory';
import { fetchTradingEconomics } from './tradingeconomics';
import { fetchFmp } from './fmp';
import { eventStatus, sortByTime } from './normalize';
import type { CalendarSnapshot, EconEvent, Impact } from './types';
import { resolveAsset } from '../assets';
import { addDays } from '../time';

const log = logger('calendar');
const KEY = 'calendar:snapshot';
const STALE_KEY = 'calendar:snapshot:stale';
const LAST_ACTUALS_KEY = 'calendar:last-actuals'; // hash eventId -> actual (para detectar divulgações e revisões)
const INIT_KEY = 'calendar:initialized';

export interface CalendarChanges { released: EconEvent[]; revised: { event: EconEvent; from: string; to: string }[] }

async function fetchFromProvider(): Promise<{ events: EconEvent[]; supportsActuals: boolean; source: string }> {
  const now = new Date();
  const d1 = addDays(now, -1).toISOString().slice(0, 10);
  const d2 = addDays(now, 14).toISOString().slice(0, 10);
  switch (config.calendar.provider) {
    case 'tradingeconomics': {
      const events = await fetchTradingEconomics(d1, d2, ['united states', 'euro area', 'united kingdom', 'japan', 'switzerland', 'australia', 'canada', 'new zealand', 'china']);
      return { events, supportsActuals: true, source: 'Trading Economics' };
    }
    case 'fmp': {
      const events = await fetchFmp(d1, d2);
      return { events, supportsActuals: true, source: 'FMP' };
    }
    default: {
      const r = await fetchForexFactory();
      return { ...r, source: 'Forex Factory' };
    }
  }
}

/** Há evento de impacto alto/médio nas próximas 2h ou últimos 30 min? (reduz o TTL para captar resultados) */
function nearImportantEvent(events: EconEvent[], now = Date.now()) {
  return events.some((e) => (e.impact === 'high' || e.impact === 'medium') && new Date(e.time).getTime() > now - 30 * 60000 && new Date(e.time).getTime() < now + 2 * 3600000);
}

/**
 * Retorna o calendário (do cache quando fresco). `sync` força atualização e retorna as mudanças
 * (resultados divulgados e revisões) — usado pelo job automático.
 */
export async function getCalendar(opts?: { sync?: boolean }): Promise<{ snapshot: CalendarSnapshot; changes: CalendarChanges }> {
  const store = kv();
  const changes: CalendarChanges = { released: [], revised: [] };
  const cached = await store.get<CalendarSnapshot>(KEY);
  if (cached && !opts?.sync) return { snapshot: refreshStatuses(cached), changes };

  try {
    const { events, supportsActuals, source } = await fetchFromProvider();
    const sorted = sortByTime(events);
    const now = new Date();
    const snapshot: CalendarSnapshot = {
      events: sorted, fetchedAt: now.toISOString(), source, supportsActuals,
      rangeStart: sorted[0]?.time ?? now.toISOString(), rangeEnd: sorted[sorted.length - 1]?.time ?? now.toISOString(), stale: false,
    };
    // detecta divulgações/revisões comparando com o último estado conhecido.
    // No primeiro sync após o deploy apenas registramos (evita avalanche de alertas antigos).
    const initialized = Boolean(await store.get<boolean>(INIT_KEY));
    const last = await store.hgetall<string>(LAST_ACTUALS_KEY);
    for (const ev of sorted) {
      if (!ev.actual) continue;
      const prev = last[ev.id];
      if (prev === undefined) {
        const age = Date.now() - new Date(ev.time).getTime();
        if (initialized && age < 6 * 3600000 && age > -30 * 60000) changes.released.push(ev);
        await store.hset(LAST_ACTUALS_KEY, ev.id, ev.actual);
      } else if (prev !== ev.actual) {
        if (initialized) changes.revised.push({ event: ev, from: prev, to: ev.actual });
        await store.hset(LAST_ACTUALS_KEY, ev.id, ev.actual);
      }
    }
    if (!initialized) await store.set(INIT_KEY, true, 30 * 24 * 3600);
    const ttl = nearImportantEvent(sorted) ? config.calendar.nearEventTtlSec : config.calendar.ttlSec;
    await store.set(KEY, snapshot, ttl);
    await store.set(STALE_KEY, snapshot, 7 * 24 * 3600);
    return { snapshot, changes };
  } catch (e) {
    const msg = errMsg(e);
    log.error('sincronização falhou', { message: msg });
    const stale = (await store.get<CalendarSnapshot>(STALE_KEY)) ?? cached;
    if (stale) return { snapshot: { ...refreshStatuses(stale), stale: true, error: msg }, changes };
    return { snapshot: { events: [], fetchedAt: new Date().toISOString(), source: config.calendar.provider, supportsActuals: false, rangeStart: '', rangeEnd: '', stale: true, error: msg }, changes };
  }
}

function refreshStatuses(s: CalendarSnapshot): CalendarSnapshot {
  return { ...s, events: s.events.map((e) => ({ ...e, status: eventStatus(e, s.supportsActuals) })) };
}

export interface CalendarFilter {
  range?: 'today' | 'tomorrow' | 'week' | 'next7' | 'all';
  currencies?: string[];
  countries?: string[];
  impacts?: Impact[];
  asset?: string;
  tz?: string;
}

export function filterEvents(events: EconEvent[], f: CalendarFilter, now = new Date()): EconEvent[] {
  const tz = f.tz ?? 'America/Sao_Paulo';
  const dayOf = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
  const today = dayOf(now.toISOString());
  const tomorrow = dayOf(addDays(now, 1).toISOString());
  const weekStart = (() => { const d = new Date(now); const dow = Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(d) === 'Sun' ? 0 : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(d)) + 1); return dayOf(addDays(d, -dow).toISOString()); })();
  const weekEnd = dayOf(addDays(new Date(weekStart + 'T12:00:00Z'), 6).toISOString());
  const in7 = dayOf(addDays(now, 7).toISOString());
  const assetCurrencies = f.asset ? resolveAsset(f.asset).currencies : undefined;
  return events.filter((e) => {
    const d = dayOf(e.time);
    if (f.range === 'today' && d !== today) return false;
    if (f.range === 'tomorrow' && d !== tomorrow) return false;
    if (f.range === 'week' && (d < weekStart || d > weekEnd)) return false;
    if (f.range === 'next7' && (d < today || d > in7)) return false;
    if (f.currencies?.length && !f.currencies.includes(e.currency)) return false;
    if (f.countries?.length && !f.countries.includes(e.country)) return false;
    if (f.impacts?.length && !f.impacts.includes(e.impact)) return false;
    if (assetCurrencies && !assetCurrencies.includes(e.currency)) return false;
    return true;
  });
}

export function findEvent(events: EconEvent[], id: string) {
  return events.find((e) => e.id === id);
}
