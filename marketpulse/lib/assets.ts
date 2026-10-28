/**
 * Catálogo de ativos. Mapeia símbolos "de corretora" (XAUUSD, NAS100...) para símbolos do provedor.
 * Índices CFD (NAS100/US30/SPX500) não existem como tal nos provedores: usamos o índice à vista
 * (NDX/DJI/SPX) e, se o plano não incluir índices, o ETF equivalente (QQQ/DIA/SPY) com rótulo explícito.
 */
export type AssetClass = 'metal' | 'forex' | 'index' | 'macro';

export interface AssetDef {
  symbol: string;          // símbolo usado no app
  name: string;
  cls: AssetClass;
  provider: string;        // símbolo principal no Twelve Data
  fallback?: string;       // símbolo alternativo (ETF) se o principal não estiver no plano
  fallbackLabel?: string;
  decimals: number;
  currencies: string[];    // moedas que afetam o ativo (para filtrar eventos)
  keywords: string[];      // para relacionar notícias
}

export const ASSETS: AssetDef[] = [
  { symbol: 'XAUUSD', name: 'Ouro / Dólar', cls: 'metal', provider: 'XAU/USD', decimals: 2, currencies: ['USD'], keywords: ['gold', 'ouro', 'xau', 'bullion', 'precious metal'] },
  { symbol: 'XAGUSD', name: 'Prata / Dólar', cls: 'metal', provider: 'XAG/USD', decimals: 3, currencies: ['USD'], keywords: ['silver', 'prata', 'xag'] },
  { symbol: 'EURUSD', name: 'Euro / Dólar', cls: 'forex', provider: 'EUR/USD', decimals: 5, currencies: ['EUR', 'USD'], keywords: ['euro', 'ecb', 'eurusd', 'eurozone', 'lagarde'] },
  { symbol: 'GBPUSD', name: 'Libra / Dólar', cls: 'forex', provider: 'GBP/USD', decimals: 5, currencies: ['GBP', 'USD'], keywords: ['pound', 'sterling', 'boe', 'gbpusd', 'bank of england', 'uk '] },
  { symbol: 'USDJPY', name: 'Dólar / Iene', cls: 'forex', provider: 'USD/JPY', decimals: 3, currencies: ['USD', 'JPY'], keywords: ['yen', 'boj', 'usdjpy', 'bank of japan', 'japan'] },
  { symbol: 'USDCHF', name: 'Dólar / Franco', cls: 'forex', provider: 'USD/CHF', decimals: 5, currencies: ['USD', 'CHF'], keywords: ['franc', 'snb', 'usdchf', 'swiss'] },
  { symbol: 'AUDUSD', name: 'Dólar Australiano', cls: 'forex', provider: 'AUD/USD', decimals: 5, currencies: ['AUD', 'USD'], keywords: ['aussie', 'rba', 'audusd', 'australia'] },
  { symbol: 'USDCAD', name: 'Dólar / Dólar Canadense', cls: 'forex', provider: 'USD/CAD', decimals: 5, currencies: ['USD', 'CAD'], keywords: ['loonie', 'boc', 'usdcad', 'canada', 'oil'] },
  { symbol: 'NAS100', name: 'Nasdaq 100', cls: 'index', provider: 'NDX', fallback: 'QQQ', fallbackLabel: 'ETF QQQ (proxy)', decimals: 2, currencies: ['USD'], keywords: ['nasdaq', 'tech stocks', 'nvidia', 'apple', 'microsoft', 'wall street', 'stocks'] },
  { symbol: 'US30', name: 'Dow Jones', cls: 'index', provider: 'DJI', fallback: 'DIA', fallbackLabel: 'ETF DIA (proxy)', decimals: 2, currencies: ['USD'], keywords: ['dow', 'wall street', 'stocks', 'equities'] },
  { symbol: 'SPX500', name: 'S&P 500', cls: 'index', provider: 'SPX', fallback: 'SPY', fallbackLabel: 'ETF SPY (proxy)', decimals: 2, currencies: ['USD'], keywords: ['s&p', 'sp500', 'wall street', 'stocks', 'equities'] },
  { symbol: 'DXY', name: 'Índice Dólar', cls: 'macro', provider: 'DXY', fallback: 'UUP', fallbackLabel: 'ETF UUP (proxy)', decimals: 3, currencies: ['USD'], keywords: ['dollar index', 'dxy', 'greenback'] },
];

export const DEFAULT_FAVORITES = ['XAUUSD', 'XAGUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'USDCAD', 'NAS100', 'US30', 'SPX500'];

const BY_SYMBOL = new Map(ASSETS.map((a) => [a.symbol, a]));
export function getAsset(symbol: string): AssetDef | undefined {
  return BY_SYMBOL.get(symbol.toUpperCase());
}

/** Cria uma definição para um símbolo extra adicionado pelo usuário (ex.: "USD/MXN" ou "AAPL"). */
export function customAsset(symbol: string): AssetDef {
  const s = symbol.toUpperCase().trim();
  const isFx = /^[A-Z]{3}\/[A-Z]{3}$/.test(s);
  return {
    symbol: s.replace('/', ''),
    name: s,
    cls: isFx ? 'forex' : 'index',
    provider: s,
    decimals: isFx ? 5 : 2,
    currencies: isFx ? [s.slice(0, 3), s.slice(4, 7)] : ['USD'],
    keywords: [s.toLowerCase()],
  };
}

export function resolveAsset(symbol: string): AssetDef {
  return getAsset(symbol) ?? customAsset(symbol);
}

export const ALL_CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'AUD', 'CAD', 'NZD', 'CNY'];
