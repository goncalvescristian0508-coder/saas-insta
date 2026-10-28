/**
 * Trading Economics (https://docs.tradingeconomics.com/economic_calendar/).
 * Requer plano pago para EUA/Europa (a conta gratuita cobre poucos países). Datas em UTC.
 */
import 'server-only';
import { config } from '../config';
import type { EconEvent } from './types';
import { stableEventId, impactFrom, eventStatus } from './normalize';

type TEItem = { CalendarId?: string; Date?: string; Country?: string; Event?: string; Actual?: string; Previous?: string; Forecast?: string; TEForecast?: string; Importance?: number; Currency?: string; Revised?: string; LastUpdate?: string; URL?: string };

const COUNTRY_CODE: Record<string, string> = { 'united states': 'US', 'euro area': 'EU', 'united kingdom': 'GB', japan: 'JP', switzerland: 'CH', australia: 'AU', canada: 'CA', 'new zealand': 'NZ', china: 'CN', germany: 'DE', france: 'FR' };
const CURRENCY_OF: Record<string, string> = { US: 'USD', EU: 'EUR', GB: 'GBP', JP: 'JPY', CH: 'CHF', AU: 'AUD', CA: 'CAD', NZ: 'NZD', CN: 'CNY', DE: 'EUR', FR: 'EUR' };

export function parseTradingEconomics(items: TEItem[]): EconEvent[] {
  const out: EconEvent[] = [];
  for (const it of items) {
    if (!it.Event || !it.Date) continue;
    const time = new Date(it.Date.endsWith('Z') ? it.Date : it.Date + 'Z').toISOString();
    const country = COUNTRY_CODE[(it.Country ?? '').toLowerCase()] ?? (it.Country ?? '').slice(0, 2).toUpperCase();
    const currency = (it.Currency || CURRENCY_OF[country] || '').toUpperCase();
    const ev: EconEvent = {
      id: it.CalendarId ? `te-${it.CalendarId}` : stableEventId(it.Event, currency, time),
      title: it.Event, country, currency, time, impact: impactFrom(it.Importance),
      previous: it.Previous || undefined, forecast: it.Forecast || it.TEForecast || undefined, actual: it.Actual || undefined,
      revised: it.Revised || undefined, status: 'scheduled', source: 'Trading Economics', url: it.URL, lastUpdate: it.LastUpdate,
    };
    ev.status = eventStatus(ev, true);
    out.push(ev);
  }
  return out;
}

export async function fetchTradingEconomics(d1: string, d2: string, countries: string[]): Promise<EconEvent[]> {
  const key = config.calendar.tradingEconomicsKey;
  if (!key) throw new Error('TRADINGECONOMICS_API_KEY não configurada');
  const url = `https://api.tradingeconomics.com/calendar/country/${encodeURIComponent(countries.join(','))}?c=${encodeURIComponent(key)}&d1=${d1}&d2=${d2}&f=json`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000), cache: 'no-store' });
  if (!res.ok) throw new Error(`Trading Economics HTTP ${res.status}`);
  return parseTradingEconomics((await res.json()) as TEItem[]);
}
