/**
 * Monta o "retrato" de dados reais que alimenta a IA: cotações, técnicos, calendário,
 * notícias, juros. Registra as fontes/horários e os avisos de dados incompletos.
 */
import 'server-only';
import { getQuotes, getCandles } from '../market/service';
import { technicalSnapshot, type TechnicalSnapshot } from '../market/technicals';
import { getCalendar } from '../calendar/service';
import { KEY_EVENT_PATTERN } from '../calendar/glossary';
import { getNews } from '../news/service';
import { getRates } from '../market/rates';
import { resolveAsset } from '../assets';
import { fmtDateTime, currentSession, SESSION_LABEL } from '../time';
import type { Quote } from '../market/types';
import type { EconEvent } from '../calendar/types';

export interface DataSnapshot {
  now: string;
  session: string;
  quotes: Record<string, { quote: Quote | null; stale: boolean; error?: string }>;
  technicals: Record<string, TechnicalSnapshot>;
  upcoming: EconEvent[];
  released: EconEvent[];
  news: { title: string; source: string; publishedAt: string; tags: string[] }[];
  rates: { label: string; value: number; date: string }[];
  sources: { name: string; asOf: string; note?: string }[];
  warnings: string[];
  calendarSupportsActuals: boolean;
}

export async function buildSnapshot(symbols: string[], currencies: string[]): Promise<DataSnapshot> {
  const warnings: string[] = [];
  const sources: DataSnapshot['sources'] = [];
  const now = new Date();

  const quotes = await getQuotes(symbols);
  const technicals: Record<string, TechnicalSnapshot> = {};
  for (const s of symbols) {
    const asset = resolveAsset(s);
    const q = quotes[asset.symbol];
    if (!q?.quote) warnings.push(`${asset.symbol}: cotação indisponível (${q?.error ?? 'sem dado'})`);
    else if (q.stale) warnings.push(`${asset.symbol}: cotação desatualizada (${q.error ?? 'cache antigo'})`);
    const h1 = await getCandles(asset.symbol, '1h', { allowFetch: true });
    const d1 = await getCandles(asset.symbol, '1day', { allowFetch: true });
    if (h1.series && h1.series.candles.length >= 30) {
      technicals[asset.symbol] = technicalSnapshot(asset.symbol, h1.series.candles, 'H1', d1.series?.candles);
      if (h1.stale) warnings.push(`${asset.symbol}: candles H1 desatualizados`);
    } else {
      technicals[asset.symbol] = technicalSnapshot(asset.symbol, [], 'H1');
      warnings.push(`${asset.symbol}: histórico H1 indisponível — níveis técnicos não calculados`);
    }
    if (!d1.series) warnings.push(`${asset.symbol}: histórico D1 indisponível — pivôs diários não calculados`);
  }
  const quoteTimes = Object.values(quotes).map((q) => q.quote?.fetchedAt).filter(Boolean) as string[];
  if (quoteTimes.length) sources.push({ name: 'Twelve Data (cotações e candles)', asOf: quoteTimes.sort().at(-1)! });

  const { snapshot: cal } = await getCalendar();
  sources.push({ name: `${cal.source} (calendário)`, asOf: cal.fetchedAt, note: cal.supportsActuals ? undefined : 'provedor não publica resultados divulgados' });
  if (cal.stale) warnings.push(`Calendário desatualizado: ${cal.error ?? ''}`);
  const t = now.getTime();
  const relevant = cal.events.filter((e) => currencies.includes(e.currency) && e.impact !== 'holiday');
  const upcoming = relevant.filter((e) => { const et = new Date(e.time).getTime(); return et >= t && et <= t + 36 * 3600000 && (e.impact === 'high' || e.impact === 'medium' || KEY_EVENT_PATTERN.test(e.title)); }).slice(0, 25);
  const released = relevant.filter((e) => { const et = new Date(e.time).getTime(); return et < t && et >= t - 30 * 3600000 && (e.actual || e.impact === 'high'); }).slice(-20);

  let news: DataSnapshot['news'] = [];
  try {
    const n = await getNews();
    news = n.items.filter((i) => i.importance === 'high' || i.tags.length > 0).slice(0, 30).map((i) => ({ title: i.title, source: i.source, publishedAt: i.publishedAt, tags: i.tags }));
    sources.push({ name: 'Notícias (RSS: ' + Array.from(new Set(n.items.map((i) => i.source))).join(', ') + ')', asOf: n.fetchedAt });
    if (n.stale) warnings.push('Notícias desatualizadas');
  } catch (e) { warnings.push(`Notícias indisponíveis: ${e instanceof Error ? e.message : String(e)}`); }

  let rates: DataSnapshot['rates'] = [];
  const r = await getRates();
  if (r.available && r.rates.length) { rates = r.rates.map((x) => ({ label: x.label, value: x.value, date: x.date })); sources.push({ name: 'FRED (juros americanos, diário)', asOf: r.fetchedAt ?? now.toISOString(), note: 'defasagem de ~1 dia útil' }); }
  else warnings.push('Juros americanos indisponíveis (configure FRED_API_KEY) — análise não considera yields');

  return {
    now: now.toISOString(), session: SESSION_LABEL[currentSession(now)], quotes, technicals, upcoming, released, news, rates, sources, warnings, calendarSupportsActuals: cal.supportsActuals,
  };
}

/** Serializa o snapshot em texto compacto e determinístico para o prompt. */
export function renderSnapshot(s: DataSnapshot, tz = 'America/Sao_Paulo'): string {
  const lines: string[] = [];
  lines.push(`AGORA (UTC): ${s.now} | Brasília: ${fmtDateTime(s.now, tz)} | ${s.session}`);
  lines.push('');
  lines.push('== COTAÇÕES (fonte: Twelve Data) ==');
  for (const [sym, q] of Object.entries(s.quotes)) {
    if (!q.quote) { lines.push(`${sym}: INDISPONÍVEL (${q.error ?? 'sem dado'})`); continue; }
    const qq = q.quote;
    lines.push(`${sym}${qq.isProxy ? ` (proxy ${qq.providerSymbol})` : ''}: ${qq.price} | var ${qq.changePct?.toFixed(2) ?? '?'}% | O ${qq.open ?? '?'} H ${qq.high ?? '?'} L ${qq.low ?? '?'} | dado de ${qq.asOf}${q.stale ? ' | DESATUALIZADO' : ''}`);
  }
  lines.push('');
  lines.push('== TÉCNICO (H1, calculado a partir de candles reais; pivôs do D1 anterior) ==');
  for (const [sym, tch] of Object.entries(s.technicals)) {
    if (!tch.dataSufficient) { lines.push(`${sym}: histórico insuficiente — SEM níveis técnicos`); continue; }
    const f = (n?: number) => (n === undefined ? '?' : n.toPrecision(6));
    lines.push(`${sym}: close ${f(tch.lastClose)} | SMA20 ${f(tch.sma20)} SMA50 ${f(tch.sma50)} SMA200 ${f(tch.sma200)} | RSI14 ${tch.rsi14?.toFixed(1) ?? '?'} | ATR14 ${f(tch.atr14)} (${tch.atrPct?.toFixed(2) ?? '?'}%, vol ${tch.volatility ?? '?'}) | tendência ${tch.trend ?? '?'} | viés técnico ${tch.bias}`);
    lines.push(`   suportes: ${tch.supports.map(f).join(', ') || '—'} | resistências: ${tch.resistances.map(f).join(', ') || '—'} | pivôs(${tch.pivots?.basedOn ?? '—'}): P ${f(tch.pivots?.P)} R1 ${f(tch.pivots?.R1)} S1 ${f(tch.pivots?.S1)} | 20b H ${f(tch.high20)} L ${f(tch.low20)}`);
  }
  lines.push('');
  lines.push(`== JUROS EUA (FRED, diário) == ${s.rates.length ? s.rates.map((r) => `${r.label}: ${r.value} (${r.date})`).join(' | ') : 'INDISPONÍVEL'}`);
  lines.push('');
  lines.push(`== EVENTOS DIVULGADOS (últimas 30h; resultados ${s.calendarSupportsActuals ? 'disponíveis' : 'NÃO publicados por este provedor'}) ==`);
  for (const e of s.released) lines.push(`${fmtDateTime(e.time, tz)} ${e.currency} [${e.impact}] ${e.title} | prev ${e.previous ?? '—'} | prevê ${e.forecast ?? '—'} | REAL ${e.actual ?? 'n/d'}${e.revised ? ` | revisado ${e.revised}` : ''}`);
  if (!s.released.length) lines.push('(nenhum)');
  lines.push('');
  lines.push('== PRÓXIMOS EVENTOS (36h, horário de Brasília) ==');
  for (const e of s.upcoming) lines.push(`${fmtDateTime(e.time, tz)} ${e.currency} [${e.impact}] ${e.title} | prev ${e.previous ?? '—'} | prevê ${e.forecast ?? '—'}`);
  if (!s.upcoming.length) lines.push('(nenhum)');
  lines.push('');
  lines.push('== MANCHETES RECENTES (RSS) ==');
  for (const n of s.news) lines.push(`[${fmtDateTime(n.publishedAt, tz)}] (${n.source}) ${n.title}`);
  if (!s.news.length) lines.push('(nenhuma)');
  if (s.warnings.length) { lines.push(''); lines.push('== AVISOS DE DADOS =='); for (const w of s.warnings) lines.push(`- ${w}`); }
  return lines.join('\n');
}
