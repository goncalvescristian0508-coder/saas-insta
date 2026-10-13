/**
 * Indicadores técnicos calculados a partir de candles reais. Funções puras (testáveis).
 * Se não houver barras suficientes, os campos ficam undefined — nunca inventamos níveis.
 */
import type { Candle } from './types';

export function sma(values: number[], period: number): number | undefined {
  if (values.length < period) return undefined;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

export function ema(values: number[], period: number): number | undefined {
  if (values.length < period) return undefined;
  const k = 2 / (period + 1);
  let e = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) e = values[i] * k + e * (1 - k);
  return e;
}

export function rsi(closes: number[], period = 14): number | undefined {
  if (closes.length < period + 1) return undefined;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) { const d = closes[i] - closes[i - 1]; if (d > 0) gain += d; else loss -= d; }
  gain /= period; loss /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
  }
  if (loss === 0) return 100;
  const rs = gain / loss;
  return 100 - 100 / (1 + rs);
}

export function atr(candles: Candle[], period = 14): number | undefined {
  if (candles.length < period + 1) return undefined;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i], p = candles[i - 1];
    trs.push(Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)));
  }
  let a = trs.slice(0, period).reduce((x, y) => x + y, 0) / period;
  for (let i = period; i < trs.length; i++) a = (a * (period - 1) + trs[i]) / period;
  return a;
}

export interface Pivots { P: number; R1: number; R2: number; R3: number; S1: number; S2: number; S3: number; basedOn: string }
/** Pivôs clássicos com base na última barra diária COMPLETA. */
export function classicPivots(daily: Candle[], nowSec = Math.floor(Date.now() / 1000)): Pivots | undefined {
  const completed = daily.filter((c) => c.time + 86400 <= nowSec);
  const last = completed[completed.length - 1];
  if (!last) return undefined;
  const P = (last.high + last.low + last.close) / 3;
  const range = last.high - last.low;
  return { P, R1: 2 * P - last.low, S1: 2 * P - last.high, R2: P + range, S2: P - range, R3: last.high + 2 * (P - last.low), S3: last.low - 2 * (last.high - P), basedOn: new Date(last.time * 1000).toISOString().slice(0, 10) };
}

/** Topos e fundos (fractais de 2 barras para cada lado) — níveis "swing" recentes. */
export function swingLevels(candles: Candle[], lookback = 120, max = 4): { highs: number[]; lows: number[] } {
  const c = candles.slice(-lookback);
  const highs: number[] = [], lows: number[] = [];
  for (let i = 2; i < c.length - 2; i++) {
    if (c[i].high > c[i - 1].high && c[i].high > c[i - 2].high && c[i].high >= c[i + 1].high && c[i].high >= c[i + 2].high) highs.push(c[i].high);
    if (c[i].low < c[i - 1].low && c[i].low < c[i - 2].low && c[i].low <= c[i + 1].low && c[i].low <= c[i + 2].low) lows.push(c[i].low);
  }
  return { highs: highs.slice(-max), lows: lows.slice(-max) };
}

export type TrendLabel = 'alta' | 'baixa' | 'lateral';
export type VolLabel = 'baixa' | 'normal' | 'alta' | 'extrema';

export interface TechnicalSnapshot {
  symbol: string;
  interval: string;
  bars: number;
  lastClose?: number;
  lastBarTime?: string;
  sma20?: number; sma50?: number; sma200?: number; ema20?: number;
  rsi14?: number;
  atr14?: number; atrPct?: number; atrAvg50?: number;
  volatility?: VolLabel;
  trend?: TrendLabel;
  bias: 'altista' | 'baixista' | 'neutro' | 'indefinido';
  biasReason: string;
  high20?: number; low20?: number;
  pivots?: Pivots;
  swings?: { highs: number[]; lows: number[] };
  supports: number[];
  resistances: number[];
  dataSufficient: boolean;
}

/** Calcula o retrato técnico de um ativo. `daily` (D1) é usado para pivôs; `main` para o resto. */
export function technicalSnapshot(symbol: string, main: Candle[], interval: string, daily?: Candle[], nowSec = Math.floor(Date.now() / 1000)): TechnicalSnapshot {
  const closes = main.map((c) => c.close);
  const last = main[main.length - 1];
  const base: TechnicalSnapshot = { symbol, interval, bars: main.length, bias: 'indefinido', biasReason: 'Histórico insuficiente para calcular indicadores.', supports: [], resistances: [], dataSufficient: false };
  if (!last || closes.length < 30) return base;

  const s20 = sma(closes, 20), s50 = sma(closes, 50), s200 = sma(closes, 200), e20 = ema(closes, 20);
  const r = rsi(closes, 14);
  const a = atr(main, 14);
  const atrPct = a !== undefined ? (a / last.close) * 100 : undefined;
  // média do ATR nas últimas 50 barras para rotular volatilidade relativa
  let atrAvg50: number | undefined;
  if (main.length >= 65) {
    const samples: number[] = [];
    for (let i = main.length - 50; i <= main.length; i += 5) { const v = atr(main.slice(0, i), 14); if (v !== undefined) samples.push(v); }
    if (samples.length) atrAvg50 = samples.reduce((x, y) => x + y, 0) / samples.length;
  }
  let volatility: VolLabel | undefined;
  if (a !== undefined && atrAvg50 !== undefined) {
    const ratio = a / atrAvg50;
    volatility = ratio < 0.8 ? 'baixa' : ratio < 1.25 ? 'normal' : ratio < 1.8 ? 'alta' : 'extrema';
  }
  const recent = main.slice(-20);
  const high20 = Math.max(...recent.map((c) => c.high));
  const low20 = Math.min(...recent.map((c) => c.low));

  let trend: TrendLabel | undefined;
  let bias: TechnicalSnapshot['bias'] = 'neutro';
  let biasReason = 'Preço próximo das médias; sem direção clara.';
  if (s20 !== undefined && s50 !== undefined) {
    const slope20 = s20 - (sma(closes.slice(0, -5), 20) ?? s20);
    if (last.close > s20 && s20 > s50 && slope20 > 0) { trend = 'alta'; bias = 'altista'; biasReason = 'Preço acima da SMA20, SMA20 acima da SMA50 e média de curto prazo subindo.'; }
    else if (last.close < s20 && s20 < s50 && slope20 < 0) { trend = 'baixa'; bias = 'baixista'; biasReason = 'Preço abaixo da SMA20, SMA20 abaixo da SMA50 e média de curto prazo caindo.'; }
    else { trend = 'lateral'; }
    if (r !== undefined) {
      if (bias === 'altista' && r > 75) biasReason += ' RSI sobrecomprado: risco de correção.';
      if (bias === 'baixista' && r < 25) biasReason += ' RSI sobrevendido: risco de repique.';
    }
  }
  const pivots = daily ? classicPivots(daily, nowSec) : undefined;
  const swings = swingLevels(main);
  const supports = [...swings.lows, low20, pivots?.S1, pivots?.S2].filter((x): x is number => typeof x === 'number' && x < last.close).sort((x, y) => y - x).slice(0, 4);
  const resistances = [...swings.highs, high20, pivots?.R1, pivots?.R2].filter((x): x is number => typeof x === 'number' && x > last.close).sort((x, y) => x - y).slice(0, 4);

  return {
    ...base, lastClose: last.close, lastBarTime: new Date(last.time * 1000).toISOString(),
    sma20: s20, sma50: s50, sma200: s200, ema20: e20, rsi14: r, atr14: a, atrPct, atrAvg50, volatility, trend, bias, biasReason,
    high20, low20, pivots, swings, supports: dedupe(supports), resistances: dedupe(resistances), dataSufficient: true,
  };
}

function dedupe(levels: number[]): number[] {
  const out: number[] = [];
  for (const l of levels) if (!out.some((o) => Math.abs(o - l) / l < 0.0015)) out.push(l);
  return out;
}
