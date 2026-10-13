/**
 * Market Data Service: cotações e candles com cache, orçamento de créditos por minuto e
 * fallback para proxy (ETF) quando o símbolo não está no plano do provedor.
 * Nunca inventa preço: sem dado, retorna null e a UI mostra "indisponível".
 */
import 'server-only';
import { config } from '../config';
import { kv } from '../kv';
import { logger, errMsg } from '../logger';
import { resolveAsset, type AssetDef } from '../assets';
import { fetchQuotes, fetchCandles, quoteToNumbers, isPlanOrSymbolError, TwelveDataUnavailable } from './twelvedata';
import type { Quote, CandleSeries, Interval } from './types';

const log = logger('market');
const SOURCE = 'Twelve Data';

export interface QuoteResult { quote: Quote | null; stale: boolean; error?: string }

/** Orçamento de créditos por minuto (persistido no KV para valer entre instâncias serverless). */
async function reserveCredits(n: number): Promise<boolean> {
  const minute = Math.floor(Date.now() / 60000);
  const key = `td:credits:${minute}`;
  let used = 0;
  for (let i = 0; i < n; i++) used = await kv().incr(key, 120);
  return used <= config.market.creditsPerMinute;
}

async function creditsAvailable(): Promise<number> {
  const minute = Math.floor(Date.now() / 60000);
  const used = (await kv().get<number>(`td:credits:${minute}`)) ?? 0;
  return Math.max(0, config.market.creditsPerMinute - Number(used));
}

const quoteKey = (symbol: string) => `quote:${symbol}`;
const quoteStaleKey = (symbol: string) => `quote:stale:${symbol}`;
const proxyKey = (symbol: string) => `proxy:${symbol}`;

/** Lembra por 24h que o símbolo principal foi recusado e devemos usar o proxy. */
async function shouldUseProxy(asset: AssetDef): Promise<boolean> {
  if (!asset.fallback) return false;
  return Boolean(await kv().get<boolean>(proxyKey(asset.symbol)));
}

function buildQuote(asset: AssetDef, providerSymbol: string, isProxy: boolean, raw: ReturnType<typeof quoteToNumbers>): Quote | null {
  if (raw.price === undefined) return null;
  const chg = raw.changePct ?? (raw.previousClose ? ((raw.price - raw.previousClose) / raw.previousClose) * 100 : undefined);
  return {
    symbol: asset.symbol, providerSymbol, isProxy, proxyLabel: isProxy ? asset.fallbackLabel : undefined,
    name: asset.name, price: raw.price, open: raw.open, high: raw.high, low: raw.low, previousClose: raw.previousClose,
    change: raw.change ?? (raw.previousClose ? raw.price - raw.previousClose : undefined), changePct: chg,
    direction: chg === undefined || Math.abs(chg) < 1e-9 ? 'flat' : chg > 0 ? 'up' : 'down',
    marketOpen: raw.marketOpen, asOf: raw.asOf, fetchedAt: new Date().toISOString(), source: SOURCE,
  };
}

/**
 * Retorna cotações para os símbolos pedidos. Usa cache (TTL ~2 min). Para os vencidos, busca
 * em lote respeitando o orçamento de créditos; o que não couber vem do cache "stale".
 */
export async function getQuotes(symbols: string[]): Promise<Record<string, QuoteResult>> {
  const store = kv();
  const out: Record<string, QuoteResult> = {};
  const assets = symbols.map(resolveAsset);
  const toFetch: AssetDef[] = [];
  for (const a of assets) {
    const fresh = await store.get<Quote>(quoteKey(a.symbol));
    if (fresh) out[a.symbol] = { quote: fresh, stale: false };
    else toFetch.push(a);
  }
  if (toFetch.length === 0) return out;

  if (!config.market.twelveDataKey) {
    for (const a of toFetch) out[a.symbol] = { quote: await store.get<Quote>(quoteStaleKey(a.symbol)), stale: true, error: 'TWELVEDATA_API_KEY não configurada' };
    return out;
  }

  // Monta o lote: prioridade = ordem pedida; limita ao orçamento disponível no minuto.
  const avail = await creditsAvailable();
  const batch = toFetch.slice(0, Math.max(0, avail));
  const deferred = toFetch.slice(batch.length);
  for (const a of deferred) out[a.symbol] = { quote: await store.get<Quote>(quoteStaleKey(a.symbol)), stale: true, error: 'limite de créditos/min do provedor; aguardando próximo minuto' };
  if (batch.length === 0) return out;
  if (!(await reserveCredits(batch.length))) {
    for (const a of batch) out[a.symbol] = { quote: await store.get<Quote>(quoteStaleKey(a.symbol)), stale: true, error: 'limite de créditos/min do provedor' };
    return out;
  }

  const providerSyms = await Promise.all(batch.map(async (a) => ((await shouldUseProxy(a)) && a.fallback) ? a.fallback : a.provider));
  let results: Awaited<ReturnType<typeof fetchQuotes>>;
  try {
    results = await fetchQuotes(providerSyms);
  } catch (e) {
    log.error('lote de cotações falhou', { message: errMsg(e) });
    for (const a of batch) out[a.symbol] = { quote: await store.get<Quote>(quoteStaleKey(a.symbol)), stale: true, error: errMsg(e) };
    return out;
  }

  const retryWithProxy: AssetDef[] = [];
  for (let i = 0; i < batch.length; i++) {
    const a = batch[i];
    const ps = providerSyms[i];
    const r = results.get(ps);
    if (r?.ok) {
      const q = buildQuote(a, ps, ps !== a.provider, quoteToNumbers(r.quote));
      if (q) {
        await store.set(quoteKey(a.symbol), q, config.market.quoteTtlSec);
        await store.set(quoteStaleKey(a.symbol), q, 7 * 24 * 3600);
        out[a.symbol] = { quote: q, stale: false };
        continue;
      }
    }
    const err = r && !r.ok ? r.error : { code: 0, message: 'sem preço' };
    if (a.fallback && ps === a.provider && isPlanOrSymbolError(err.code)) { retryWithProxy.push(a); continue; }
    log.warn('cotação indisponível', { symbol: a.symbol, providerSymbol: ps, error: err });
    out[a.symbol] = { quote: await store.get<Quote>(quoteStaleKey(a.symbol)), stale: true, error: `${err.message}` };
  }

  if (retryWithProxy.length && (await reserveCredits(retryWithProxy.length))) {
    try {
      const res2 = await fetchQuotes(retryWithProxy.map((a) => a.fallback!));
      for (const a of retryWithProxy) {
        const r = res2.get(a.fallback!);
        if (r?.ok) {
          const q = buildQuote(a, a.fallback!, true, quoteToNumbers(r.quote));
          if (q) {
            await store.set(proxyKey(a.symbol), true, 24 * 3600);
            await store.set(quoteKey(a.symbol), q, config.market.quoteTtlSec);
            await store.set(quoteStaleKey(a.symbol), q, 7 * 24 * 3600);
            out[a.symbol] = { quote: q, stale: false };
            log.info('usando proxy', { symbol: a.symbol, proxy: a.fallback });
            continue;
          }
        }
        out[a.symbol] = { quote: await store.get<Quote>(quoteStaleKey(a.symbol)), stale: true, error: r && !r.ok ? r.error.message : 'sem preço' };
      }
    } catch (e) {
      for (const a of retryWithProxy) out[a.symbol] = { quote: await store.get<Quote>(quoteStaleKey(a.symbol)), stale: true, error: errMsg(e) };
    }
  } else {
    for (const a of retryWithProxy) if (!out[a.symbol]) out[a.symbol] = { quote: await store.get<Quote>(quoteStaleKey(a.symbol)), stale: true, error: 'símbolo fora do plano; proxy adiado por limite de créditos' };
  }
  return out;
}

export interface CandleResult { series: CandleSeries | null; stale: boolean; error?: string }

const candleKey = (symbol: string, interval: Interval) => `candles:${symbol}:${interval}`;

export async function getCandles(symbol: string, interval: Interval, opts?: { allowFetch?: boolean }): Promise<CandleResult> {
  const store = kv();
  const asset = resolveAsset(symbol);
  const fresh = await store.get<CandleSeries>(candleKey(asset.symbol, interval));
  if (fresh) return { series: fresh, stale: false };
  const stale = await store.get<CandleSeries>(`${candleKey(asset.symbol, interval)}:stale`);
  if (opts?.allowFetch === false) return { series: stale, stale: true, error: 'cache vencido; aguardando atualização' };
  if (!config.market.twelveDataKey) return { series: stale, stale: true, error: 'TWELVEDATA_API_KEY não configurada' };
  if (!(await reserveCredits(1))) return { series: stale, stale: true, error: 'limite de créditos/min do provedor' };

  const ttl = interval === '1day' ? config.market.candleTtlSec.daily : config.market.candleTtlSec.intraday;
  const tryFetch = async (providerSymbol: string, isProxy: boolean): Promise<CandleResult> => {
    const candles = await fetchCandles(providerSymbol, interval, interval === '1day' ? 250 : 300);
    const series: CandleSeries = { symbol: asset.symbol, providerSymbol, isProxy, interval, candles, fetchedAt: new Date().toISOString(), source: SOURCE };
    await store.set(candleKey(asset.symbol, interval), series, ttl);
    await store.set(`${candleKey(asset.symbol, interval)}:stale`, series, 7 * 24 * 3600);
    return { series, stale: false };
  };
  const proxied = await shouldUseProxy(asset);
  try {
    return await tryFetch(proxied && asset.fallback ? asset.fallback : asset.provider, proxied);
  } catch (e) {
    const code = (e as { code?: number }).code ?? 0;
    if (!proxied && asset.fallback && isPlanOrSymbolError(code) && (await reserveCredits(1))) {
      try {
        const r = await tryFetch(asset.fallback, true);
        await store.set(proxyKey(asset.symbol), true, 24 * 3600);
        return r;
      } catch (e2) { return { series: stale, stale: true, error: errMsg(e2) }; }
    }
    if (!(e instanceof TwelveDataUnavailable)) log.warn('candles falharam', { symbol, interval, message: errMsg(e) });
    return { series: stale, stale: true, error: errMsg(e) };
  }
}

/** Pré-aquece candles (D1 + H1) dos favoritos respeitando o orçamento — chamado pelo cron. */
export async function warmCandles(symbols: string[]): Promise<{ fetched: string[]; pending: string[] }> {
  const fetched: string[] = []; const pending: string[] = [];
  for (const s of symbols) {
    for (const interval of ['1day', '1h'] as Interval[]) {
      const fresh = await kv().get<CandleSeries>(candleKey(resolveAsset(s).symbol, interval));
      if (fresh) continue;
      if ((await creditsAvailable()) <= 0) { pending.push(`${s}:${interval}`); continue; }
      const r = await getCandles(s, interval);
      (r.series && !r.stale ? fetched : pending).push(`${s}:${interval}`);
    }
  }
  return { fetched, pending };
}
