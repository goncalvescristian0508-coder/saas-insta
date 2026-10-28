/**
 * News Service: agrega manchetes de feeds RSS/Atom públicos (fontes oficiais e de mercado).
 * Só manchete + link + fonte + horário. Classificação por palavras-chave para relacionar a ativos.
 */
import 'server-only';
import { XMLParser } from 'fast-xml-parser';
import { config } from '../config';
import { cached } from '../kv';
import { logger, errMsg } from '../logger';
import { ASSETS } from '../assets';

const log = logger('news');

export interface NewsItem {
  id: string; title: string; link: string; source: string; publishedAt: string; summary?: string;
  tags: string[]; assets: string[]; importance: 'high' | 'normal';
}

export const DEFAULT_FEEDS: { name: string; url: string }[] = [
  { name: 'Federal Reserve', url: 'https://www.federalreserve.gov/feeds/press_all.xml' },
  { name: 'BLS', url: 'https://www.bls.gov/feed/bls_latest.rss' },
  { name: 'FXStreet', url: 'https://www.fxstreet.com/rss/news' },
  { name: 'ForexLive', url: 'https://www.forexlive.com/feed/news' },
  { name: 'CNBC Economy', url: 'https://www.cnbc.com/id/20910258/device/rss/rss.html' },
  { name: 'Investing.com Forex', url: 'https://www.investing.com/rss/news_1.rss' },
  { name: 'Investing.com Commodities', url: 'https://www.investing.com/rss/news_11.rss' },
];

export function configuredFeeds(): { name: string; url: string }[] {
  if (!config.news.feeds) return DEFAULT_FEEDS;
  return config.news.feeds.split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
    const [name, url] = s.includes('|') ? s.split('|') : [new URL(s).hostname, s];
    return { name: name.trim(), url: url.trim() };
  });
}

const TAG_RULES: { tag: string; re: RegExp; high?: boolean }[] = [
  { tag: 'fed', re: /\bfed\b|fomc|powell|federal reserve|rate (cut|hike)|interest rate/i, high: true },
  { tag: 'inflation', re: /inflation|\bcpi\b|\bppi\b|\bpce\b|price index/i, high: true },
  { tag: 'employment', re: /payroll|\bnfp\b|jobs report|unemployment|jobless|labor market/i, high: true },
  { tag: 'growth', re: /\bgdp\b|retail sales|\bpmi\b|\bism\b|recession|manufacturing/i },
  { tag: 'gold', re: /\bgold\b|bullion|precious metal|silver|\bxau/i, high: true },
  { tag: 'fx', re: /dollar|\bdxy\b|euro|sterling|pound|\byen\b|\becb\b|\bboe\b|\bboj\b|central bank|forex|currency/i },
  { tag: 'equities', re: /wall street|s&p|nasdaq|dow|stocks|equities|earnings/i },
  { tag: 'geopolitics', re: /war|missile|sanction|tariff|geopolit|israel|iran|ukraine|russia|china|taiwan|ceasefire|attack/i, high: true },
  { tag: 'energy', re: /\boil\b|crude|opec|brent|\bwti\b|energy prices/i },
  { tag: 'treasuries', re: /treasur|yield|bond market/i },
];

export function classify(title: string, summary = ''): { tags: string[]; assets: string[]; importance: 'high' | 'normal' } {
  const text = `${title} ${summary}`;
  const tags = TAG_RULES.filter((r) => r.re.test(text)).map((r) => r.tag);
  const assets = ASSETS.filter((a) => a.keywords.some((k) => text.toLowerCase().includes(k))).map((a) => a.symbol);
  if (tags.includes('fed') || tags.includes('inflation') || tags.includes('employment')) assets.push('XAUUSD', 'EURUSD', 'USDJPY', 'NAS100', 'SPX500');
  if (tags.includes('geopolitics')) assets.push('XAUUSD', 'USDJPY', 'USDCHF');
  if (tags.includes('equities')) assets.push('NAS100', 'US30', 'SPX500');
  if (tags.includes('gold')) assets.push('XAUUSD', 'XAGUSD');
  const importance = TAG_RULES.some((r) => r.high && r.re.test(text)) ? 'high' : 'normal';
  return { tags: Array.from(new Set(tags)), assets: Array.from(new Set(assets)), importance };
}

function strip(html: unknown): string {
  return String(html ?? '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
}

export function parseFeed(xml: string, source: string): NewsItem[] {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', cdataPropName: '__cdata', textNodeName: '#text' });
  const doc = parser.parse(xml) as Record<string, unknown>;
  const text = (v: unknown): string => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'string' || typeof v === 'number') return String(v);
    if (Array.isArray(v)) return text(v[0]);
    if (typeof v === 'object') { const o = v as Record<string, unknown>; return text(o.__cdata ?? o['#text'] ?? o['@_href'] ?? ''); }
    return '';
  };
  const out: NewsItem[] = [];
  const rss = doc.rss as { channel?: { item?: unknown } } | undefined;
  const atom = doc.feed as { entry?: unknown } | undefined;
  const items: Record<string, unknown>[] = rss?.channel?.item ? ([] as unknown[]).concat(rss.channel.item) as Record<string, unknown>[]
    : atom?.entry ? ([] as unknown[]).concat(atom.entry) as Record<string, unknown>[] : [];
  for (const it of items.slice(0, 40)) {
    const title = strip(text(it.title));
    let link = text(it.link);
    if (!link && Array.isArray(it.link)) link = text((it.link as unknown[]).find((l) => (l as Record<string, unknown>)['@_rel'] !== 'self'));
    const dateStr = text(it.pubDate ?? it.published ?? it.updated ?? it['dc:date']);
    const d = new Date(dateStr);
    if (!title || Number.isNaN(d.getTime())) continue;
    const summary = strip(text(it.description ?? it.summary ?? it.content)).slice(0, 300);
    const cls = classify(title, summary);
    out.push({ id: `${source}:${hash(link || title)}`, title, link, source, publishedAt: d.toISOString(), summary: summary || undefined, ...cls });
  }
  return out;
}

function hash(s: string) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h.toString(36); }

export async function getNews(): Promise<{ items: NewsItem[]; fetchedAt: string; stale: boolean; failures: string[] }> {
  const r = await cached('news:all', config.news.ttlSec, async () => {
    const failures: string[] = [];
    const results = await Promise.all(configuredFeeds().map(async (f) => {
      try {
        const res = await fetch(f.url, { signal: AbortSignal.timeout(10000), cache: 'no-store', headers: { 'user-agent': 'MarketPulse/1.0 (personal RSS reader)', accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return parseFeed(await res.text(), f.name);
      } catch (e) { failures.push(`${f.name}: ${errMsg(e)}`); log.warn('feed falhou', { feed: f.name, message: errMsg(e) }); return []; }
    }));
    const items = results.flat().sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, 150);
    if (items.length === 0 && failures.length) throw new Error(`Todos os feeds falharam: ${failures.join('; ')}`);
    return { items, failures };
  });
  return { items: r.data.items, fetchedAt: r.fetchedAt, stale: r.stale, failures: r.data.failures };
}
