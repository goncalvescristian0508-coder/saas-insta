/**
 * Provedor Twelve Data (https://twelvedata.com/docs).
 * - /quote  : cotação atual (1 crédito por símbolo; aceita lote separado por vírgula)
 * - /time_series : candles (1 crédito por símbolo)
 * Plano gratuito: 800 créditos/dia, 8 créditos/minuto. Forex, metais (XAU/USD) e ETFs estão
 * no plano gratuito; índices à vista (SPX, NDX, DJI, DXY) podem exigir plano pago — o serviço
 * cai para o ETF proxy automaticamente quando o provedor recusa o símbolo.
 */
import 'server-only';
import { config } from '../config';
import { logger } from '../logger';
import type { Candle, Interval, ProviderError } from './types';

const log = logger('twelvedata');
const BASE = process.env.TWELVEDATA_BASE_URL || 'https://api.twelvedata.com';

type TDQuote = {
  symbol: string; name?: string; exchange?: string; datetime?: string; timestamp?: number;
  open?: string; high?: string; low?: string; close?: string; previous_close?: string;
  change?: string; percent_change?: string; is_market_open?: boolean;
};
type TDError = { code: number; message: string; status: 'error' };

export type RawQuoteResult = { ok: true; quote: TDQuote } | { ok: false; error: ProviderError };

function isError(v: unknown): v is TDError {
  return typeof v === 'object' && v !== null && (v as TDError).status === 'error';
}

export class TwelveDataUnavailable extends Error {}

async function call<T>(path: string, params: Record<string, string>): Promise<T> {
  if (!config.market.twelveDataKey) throw new TwelveDataUnavailable('TWELVEDATA_API_KEY não configurada');
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('apikey', config.market.twelveDataKey);
  const res = await fetch(url, { signal: AbortSignal.timeout(12000), cache: 'no-store' });
  if (!res.ok) throw new Error(`Twelve Data HTTP ${res.status}`);
  const json = (await res.json()) as T;
  if (isError(json)) {
    // Erro global (ex.: 429 limite de crédito, 401 chave inválida)
    const e = json as TDError;
    throw Object.assign(new Error(`Twelve Data ${e.code}: ${e.message}`), { code: e.code });
  }
  return json;
}

export async function fetchQuotes(providerSymbols: string[]): Promise<Map<string, RawQuoteResult>> {
  const out = new Map<string, RawQuoteResult>();
  if (providerSymbols.length === 0) return out;
  const json = await call<Record<string, unknown> | TDQuote>('/quote', { symbol: providerSymbols.join(','), timezone: 'UTC' });
  const entries: [string, unknown][] = providerSymbols.length === 1
    ? [[providerSymbols[0], json]]
    : Object.entries(json as Record<string, unknown>);
  for (const [sym, val] of entries) {
    if (isError(val)) out.set(sym, { ok: false, error: { code: val.code, message: val.message } });
    else if (val && typeof val === 'object' && 'close' in (val as object)) out.set(sym, { ok: true, quote: { ...(val as TDQuote), symbol: sym } });
    else out.set(sym, { ok: false, error: { code: 0, message: 'resposta inesperada' } });
  }
  for (const s of providerSymbols) if (!out.has(s)) out.set(s, { ok: false, error: { code: 0, message: 'símbolo ausente na resposta' } });
  return out;
}

export function quoteToNumbers(q: TDQuote) {
  const n = (v?: string) => { const x = Number(v); return Number.isFinite(x) ? x : undefined; };
  const asOf = q.timestamp ? new Date(q.timestamp * 1000).toISOString()
    : q.datetime ? new Date(q.datetime.replace(' ', 'T') + (q.datetime.length <= 10 ? 'T00:00:00Z' : 'Z')).toISOString()
    : new Date().toISOString();
  return {
    name: q.name ?? q.symbol, price: n(q.close), open: n(q.open), high: n(q.high), low: n(q.low),
    previousClose: n(q.previous_close), change: n(q.change), changePct: n(q.percent_change),
    marketOpen: typeof q.is_market_open === 'boolean' ? q.is_market_open : undefined, asOf,
  };
}

type TDSeries = { meta?: { symbol: string; interval: string }; values?: { datetime: string; open: string; high: string; low: string; close: string; volume?: string }[]; status?: string };

export async function fetchCandles(providerSymbol: string, interval: Interval, outputsize = 300): Promise<Candle[]> {
  const json = await call<TDSeries>('/time_series', { symbol: providerSymbol, interval, outputsize: String(outputsize), timezone: 'UTC', order: 'ASC' });
  const values = json.values ?? [];
  const candles: Candle[] = [];
  for (const v of values) {
    const t = Date.parse(v.datetime.length <= 10 ? `${v.datetime}T00:00:00Z` : `${v.datetime.replace(' ', 'T')}Z`);
    const o = Number(v.open), h = Number(v.high), l = Number(v.low), c = Number(v.close);
    if (![t, o, h, l, c].every(Number.isFinite)) continue;
    const vol = Number(v.volume);
    candles.push({ time: Math.floor(t / 1000), open: o, high: h, low: l, close: c, volume: Number.isFinite(vol) ? vol : undefined });
  }
  candles.sort((a, b) => a.time - b.time);
  if (candles.length === 0) log.warn('série vazia', { providerSymbol, interval });
  return candles;
}

/** Erros que indicam "símbolo não disponível no seu plano" (vale tentar o proxy). */
export function isPlanOrSymbolError(code: number) {
  return code === 400 || code === 403 || code === 404;
}
