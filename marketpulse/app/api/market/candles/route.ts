import { getCandles } from '@/lib/market/service';
import { technicalSnapshot } from '@/lib/market/technicals';
import { resolveAsset } from '@/lib/assets';
import { INTERVALS, type Interval } from '@/lib/market/types';
import { json, fail } from '@/lib/http';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const symbol = (url.searchParams.get('symbol') ?? 'XAUUSD').toUpperCase();
  const interval = (url.searchParams.get('interval') ?? '1h') as Interval;
  if (!INTERVALS.some((i) => i.id === interval)) return fail('intervalo inválido');
  const asset = resolveAsset(symbol);
  const main = await getCandles(asset.symbol, interval);
  const daily = interval === '1day' ? main : await getCandles(asset.symbol, '1day');
  const technicals = main.series ? technicalSnapshot(asset.symbol, main.series.candles, interval, daily.series?.candles) : null;
  return json({ asset: { symbol: asset.symbol, name: asset.name, decimals: asset.decimals }, series: main.series, stale: main.stale, error: main.error, technicals, dailyStale: daily.stale });
}
