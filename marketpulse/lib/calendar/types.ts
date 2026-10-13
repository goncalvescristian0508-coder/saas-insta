export type Impact = 'low' | 'medium' | 'high' | 'holiday';
export type EventStatus = 'scheduled' | 'released' | 'delayed' | 'unavailable';

export interface EconEvent {
  id: string;             // estável entre sincronizações (hash de título+moeda+horário)
  title: string;
  country: string;        // código de país (US, EU, GB...)
  currency: string;       // USD, EUR...
  time: string;           // ISO UTC
  impact: Impact;
  previous?: string;
  forecast?: string;
  actual?: string;
  revised?: string;       // valor anterior revisado, quando o provedor informa
  status: EventStatus;
  source: string;
  url?: string;
  lastUpdate?: string;
}

export interface CalendarSnapshot {
  events: EconEvent[];
  fetchedAt: string;
  source: string;
  supportsActuals: boolean;   // provedor publica resultados divulgados?
  rangeStart: string;
  rangeEnd: string;
  stale: boolean;
  error?: string;
}

export const COUNTRY_BY_CURRENCY: Record<string, string> = {
  USD: 'US', EUR: 'EU', GBP: 'GB', JPY: 'JP', CHF: 'CH', AUD: 'AU', CAD: 'CA', NZD: 'NZ', CNY: 'CN',
};
export const CURRENCY_BY_COUNTRY: Record<string, string> = Object.fromEntries(Object.entries(COUNTRY_BY_CURRENCY).map(([c, p]) => [p, c]));
