/** Financial Modeling Prep — economic calendar (verifique se o seu plano inclui este endpoint). */
import 'server-only';
import { config } from '../config';
import type { EconEvent } from './types';
import { COUNTRY_BY_CURRENCY } from './types';
import { stableEventId, impactFrom, eventStatus } from './normalize';

type FMPItem = { date?: string; country?: string; event?: string; currency?: string; previous?: number | string | null; estimate?: number | string | null; actual?: number | string | null; impact?: string };

export function parseFmp(items: FMPItem[]): EconEvent[] {
  const out: EconEvent[] = [];
  const s = (v: number | string | null | undefined) => (v === null || v === undefined || v === '' ? undefined : String(v));
  for (const it of items) {
    if (!it.event || !it.date) continue;
    const time = new Date(it.date.includes('T') ? it.date : it.date.replace(' ', 'T') + 'Z').toISOString();
    const currency = (it.currency ?? '').toUpperCase();
    const country = (it.country ?? COUNTRY_BY_CURRENCY[currency] ?? '').toUpperCase();
    const ev: EconEvent = {
      id: stableEventId(it.event, currency, time), title: it.event, country, currency, time, impact: impactFrom(it.impact),
      previous: s(it.previous), forecast: s(it.estimate), actual: s(it.actual), status: 'scheduled', source: 'FMP',
    };
    ev.status = eventStatus(ev, true);
    out.push(ev);
  }
  return out;
}

export async function fetchFmp(from: string, to: string): Promise<EconEvent[]> {
  const key = config.calendar.fmpKey;
  if (!key) throw new Error('FMP_API_KEY não configurada');
  const url = `https://financialmodelingprep.com/stable/economic-calendar?from=${from}&to=${to}&apikey=${encodeURIComponent(key)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000), cache: 'no-store' });
  if (!res.ok) throw new Error(`FMP HTTP ${res.status}`);
  const json = await res.json();
  if (!Array.isArray(json)) throw new Error('FMP: resposta inesperada');
  return parseFmp(json as FMPItem[]);
}
