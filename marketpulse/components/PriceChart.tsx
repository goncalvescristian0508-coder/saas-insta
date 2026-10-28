'use client';
/** Gráfico de candles com Lightweight Charts (TradingView, Apache-2.0) + linhas de níveis. */
import { useEffect, useRef } from 'react';
import { createChart, CandlestickSeries, LineSeries, type IChartApi, type ISeriesApi, type UTCTimestamp } from 'lightweight-charts';
import type { Candle } from '@/lib/market/types';

export function PriceChart({ candles, levels, decimals = 2, height = 360 }: { candles: Candle[]; levels?: { price: number; label: string; color: string }[]; decimals?: number; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const dark = document.documentElement.getAttribute('data-theme') !== 'light';
    const chart = createChart(ref.current, {
      height, autoSize: true,
      layout: { background: { color: 'transparent' }, textColor: dark ? '#9fb0c8' : '#475569', fontFamily: 'inherit', attributionLogo: false },
      grid: { vertLines: { color: dark ? 'rgba(31,43,69,0.6)' : 'rgba(203,213,225,0.6)' }, horzLines: { color: dark ? 'rgba(31,43,69,0.6)' : 'rgba(203,213,225,0.6)' } },
      rightPriceScale: { borderColor: dark ? '#1f2b45' : '#cbd5e1' },
      timeScale: { borderColor: dark ? '#1f2b45' : '#cbd5e1', timeVisible: true, secondsVisible: false },
      crosshair: { mode: 0 },
      localization: { locale: 'pt-BR', priceFormatter: (p: number) => p.toFixed(decimals) },
    });
    const series = chart.addSeries(CandlestickSeries, { upColor: '#22c55e', downColor: '#ef4444', borderVisible: false, wickUpColor: '#22c55e', wickDownColor: '#ef4444', priceFormat: { type: 'price', precision: decimals, minMove: Number((1 / 10 ** decimals).toFixed(decimals)) } });
    chartRef.current = chart; seriesRef.current = series;
    return () => { chart.remove(); chartRef.current = null; seriesRef.current = null; };
  }, [decimals, height]);

  useEffect(() => {
    const chart = chartRef.current, series = seriesRef.current;
    if (!chart || !series) return;
    series.setData(candles.map((c) => ({ time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close })));
    const lines: ISeriesApi<'Line'>[] = [];
    for (const l of levels ?? []) {
      if (!candles.length) break;
      const ls = chart.addSeries(LineSeries, { color: l.color, lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: true, title: l.label, crosshairMarkerVisible: false });
      ls.setData([{ time: candles[0].time as UTCTimestamp, value: l.price }, { time: candles[candles.length - 1].time as UTCTimestamp, value: l.price }]);
      lines.push(ls);
    }
    chart.timeScale().fitContent();
    return () => { for (const l of lines) { try { chart.removeSeries(l); } catch { /* chart já removido */ } } };
  }, [candles, levels]);

  return <div ref={ref} className="w-full" style={{ height }} />;
}
