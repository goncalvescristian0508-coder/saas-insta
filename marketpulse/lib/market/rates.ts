/**
 * Juros americanos (US10Y, US2Y) e dólar amplo via FRED (gratuito, chave em FRED_API_KEY).
 * Dados DIÁRIOS com defasagem de ~1 dia útil — adequados para contexto macro, não para intraday.
 */
import 'server-only';
import { config } from '../config';
import { cached } from '../kv';

export interface RateObs { series: string; label: string; value: number; date: string; source: string }

const SERIES: { id: string; label: string }[] = [
  { id: 'DGS10', label: 'Treasury 10 anos (%)' },
  { id: 'DGS2', label: 'Treasury 2 anos (%)' },
  { id: 'DFII10', label: 'Juro real 10 anos TIPS (%)' },
];

async function fetchSeries(id: string): Promise<{ value: number; date: string } | null> {
  const url = `${process.env.FRED_BASE_URL || 'https://api.stlouisfed.org'}/fred/series/observations?series_id=${id}&api_key=${encodeURIComponent(config.fred.key)}&file_type=json&sort_order=desc&limit=5`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000), cache: 'no-store' });
  if (!res.ok) throw new Error(`FRED HTTP ${res.status}`);
  const json = (await res.json()) as { observations?: { date: string; value: string }[] };
  for (const o of json.observations ?? []) { const v = Number(o.value); if (Number.isFinite(v)) return { value: v, date: o.date }; }
  return null;
}

export async function getRates(): Promise<{ rates: RateObs[]; fetchedAt?: string; stale: boolean; available: boolean; error?: string }> {
  if (!config.fred.key) return { rates: [], stale: false, available: false, error: 'FRED_API_KEY não configurada' };
  try {
    const r = await cached('fred:rates', 6 * 3600, async () => {
      const out: RateObs[] = [];
      for (const s of SERIES) { const o = await fetchSeries(s.id); if (o) out.push({ series: s.id, label: s.label, value: o.value, date: o.date, source: 'FRED' }); }
      return out;
    });
    return { rates: r.data, fetchedAt: r.fetchedAt, stale: r.stale, available: true, error: r.error };
  } catch (e) {
    return { rates: [], stale: true, available: true, error: e instanceof Error ? e.message : String(e) };
  }
}
