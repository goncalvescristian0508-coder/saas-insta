import { getQuotes } from '@/lib/market/service';
import { getPrefs } from '@/lib/prefs/service';
import { getCandles } from '@/lib/market/service';
import { technicalSnapshot } from '@/lib/market/technicals';
import { resolveAsset } from '@/lib/assets';
import { json } from '@/lib/http';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const param = url.searchParams.get('symbols');
  const prefs = await getPrefs();
  const symbols = (param ? param.split(',') : [...prefs.favorites, ...prefs.customSymbols]).map((s) => s.trim().toUpperCase()).filter(Boolean).slice(0, 40);
  const quotes = await getQuotes(symbols);
  // viés técnico de curto prazo + volatilidade, somente a partir do cache de candles (sem gastar créditos aqui)
  const technicals: Record<string, { bias: string; volatility?: string; trend?: string; atrPct?: number; asOf?: string }> = {};
  for (const s of symbols) {
    const sym = resolveAsset(s).symbol;
    const h1 = await getCandles(sym, '1h', { allowFetch: false });
    if (h1.series) { const t = technicalSnapshot(sym, h1.series.candles, 'H1'); technicals[sym] = { bias: t.bias, volatility: t.volatility, trend: t.trend, atrPct: t.atrPct, asOf: h1.series.fetchedAt }; }
  }
  return json({ quotes, technicals, assets: Object.fromEntries(symbols.map((s) => { const a = resolveAsset(s); return [a.symbol, { name: a.name, cls: a.cls, decimals: a.decimals }]; })), fetchedAt: new Date().toISOString() });
}
