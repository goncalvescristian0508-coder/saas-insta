import { describe, it, expect } from 'vitest';
import { sma, rsi, atr, classicPivots, technicalSnapshot } from './technicals';
import type { Candle } from './types';

function series(n: number, start = 100, step = 0.5): Candle[] {
  return Array.from({ length: n }, (_, i) => { const c = start + i * step; return { time: 1_700_000_000 + i * 3600, open: c - step / 2, high: c + 1, low: c - 1, close: c }; });
}

describe('indicadores', () => {
  it('sma e rsi em tendência de alta', () => {
    const closes = series(60).map((c) => c.close);
    expect(sma(closes, 20)).toBeCloseTo((closes.slice(-20).reduce((a, b) => a + b, 0)) / 20, 6);
    expect(rsi(closes)).toBe(100);
    expect(sma(closes, 100)).toBeUndefined();
  });
  it('atr com range constante', () => {
    expect(atr(series(40))).toBeCloseTo(2, 5); // TR = max(high-low=2, |high-prevClose|=1.5, |low-prevClose|=0.5) = 2
  });
  it('pivôs usam a última barra diária completa', () => {
    const daily: Candle[] = [{ time: 0, open: 1, high: 3, low: 1, close: 2 }, { time: 86400, open: 2, high: 4, low: 2, close: 3 }];
    const p = classicPivots(daily, 86400 * 2 + 10)!;
    expect(p.P).toBeCloseTo(3, 6); expect(p.R1).toBeCloseTo(4, 6); expect(p.S1).toBeCloseTo(2, 6); expect(p.basedOn).toBe('1970-01-02');
    // barra de hoje ainda incompleta não deve ser usada
    expect(classicPivots(daily, 86400 + 10)!.basedOn).toBe('1970-01-01');
  });
});

describe('technicalSnapshot', () => {
  it('marca dados insuficientes com poucas barras', () => {
    const t = technicalSnapshot('XAUUSD', series(10), 'H1');
    expect(t.dataSufficient).toBe(false); expect(t.bias).toBe('indefinido'); expect(t.supports).toEqual([]);
  });
  it('viés altista em tendência de alta e níveis coerentes com o preço', () => {
    const t = technicalSnapshot('XAUUSD', series(120), 'H1');
    expect(t.dataSufficient).toBe(true); expect(t.bias).toBe('altista'); expect(t.trend).toBe('alta');
    for (const s of t.supports) expect(s).toBeLessThan(t.lastClose!);
    for (const r of t.resistances) expect(r).toBeGreaterThan(t.lastClose!);
  });
  it('viés baixista em tendência de baixa', () => {
    const t = technicalSnapshot('EURUSD', series(120, 200, -0.5), 'H1');
    expect(t.bias).toBe('baixista');
  });
});
