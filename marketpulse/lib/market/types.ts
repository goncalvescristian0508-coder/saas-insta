export interface Quote {
  symbol: string;            // símbolo do app (XAUUSD)
  providerSymbol: string;    // símbolo efetivamente consultado (XAU/USD, QQQ...)
  isProxy: boolean;          // true quando usamos ETF/proxy no lugar do índice
  proxyLabel?: string;
  name: string;
  price: number;
  open?: number;
  high?: number;
  low?: number;
  previousClose?: number;
  change?: number;
  changePct?: number;
  direction: 'up' | 'down' | 'flat';
  marketOpen?: boolean;
  asOf: string;              // horário do dado no provedor (ISO)
  fetchedAt: string;         // quando buscamos
  source: string;
}

export interface Candle { time: number; open: number; high: number; low: number; close: number; volume?: number }
export type Interval = '5min' | '15min' | '30min' | '1h' | '4h' | '1day';
export const INTERVALS: { id: Interval; label: string }[] = [
  { id: '5min', label: 'M5' }, { id: '15min', label: 'M15' }, { id: '30min', label: 'M30' },
  { id: '1h', label: 'H1' }, { id: '4h', label: 'H4' }, { id: '1day', label: 'D1' },
];

export interface CandleSeries {
  symbol: string;
  providerSymbol: string;
  isProxy: boolean;
  interval: Interval;
  candles: Candle[];
  fetchedAt: string;
  source: string;
}

export interface ProviderError { code: number; message: string }
