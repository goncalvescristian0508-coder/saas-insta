/** Preferências do usuário (não sensíveis). Guardadas no LocalStorage e espelhadas no servidor para os jobs. */
import { DEFAULT_FAVORITES, ALL_CURRENCIES } from '../assets';

export type Impact = 'low' | 'medium' | 'high';
export type LeadMinutes = 60 | 30 | 15 | 5;

export interface Preferences {
  favorites: string[];
  customSymbols: string[];
  currencies: string[];
  impacts: Impact[];
  leadTimes: LeadMinutes[];
  alerts: {
    preEvent: boolean;
    released: boolean;
    surprise: boolean;
    biasChange: boolean;
    volatility: boolean;
    analysisUpdated: boolean;
  };
  newsTypes: string[];              // tags de notícias de interesse
  timezone: string;
  theme: 'dark' | 'light' | 'system';
  analysisIntervalMinutes: number;  // frequência das análises automáticas
  quoteRefreshSeconds: number;
  updatedAt: string;
}

export const DEFAULT_PREFS: Preferences = {
  favorites: [...DEFAULT_FAVORITES],
  customSymbols: [],
  currencies: ['USD', 'EUR', 'GBP', 'JPY'],
  impacts: ['high', 'medium'],
  leadTimes: [60, 15, 5],
  alerts: { preEvent: true, released: true, surprise: true, biasChange: true, volatility: true, analysisUpdated: false },
  newsTypes: ['fed', 'inflation', 'employment', 'gold', 'geopolitics', 'growth'],
  timezone: 'America/Sao_Paulo',
  theme: 'dark',
  analysisIntervalMinutes: 120,
  quoteRefreshSeconds: 120,
  updatedAt: new Date(0).toISOString(),
};

export const NEWS_TYPES: { id: string; label: string }[] = [
  { id: 'fed', label: 'Fed / juros' },
  { id: 'inflation', label: 'Inflação (CPI, PPI, PCE)' },
  { id: 'employment', label: 'Emprego (NFP, desemprego)' },
  { id: 'growth', label: 'Atividade (PIB, PMI, varejo)' },
  { id: 'gold', label: 'Ouro e metais' },
  { id: 'fx', label: 'Câmbio / bancos centrais' },
  { id: 'equities', label: 'Bolsas americanas' },
  { id: 'geopolitics', label: 'Geopolítica' },
  { id: 'energy', label: 'Petróleo e energia' },
];

export function sanitizePrefs(input: unknown): Preferences {
  const p = (typeof input === 'object' && input) ? (input as Partial<Preferences>) : {};
  const strArr = (v: unknown, fallback: string[], allowed?: string[]) => {
    if (!Array.isArray(v)) return fallback;
    const out = v.filter((x): x is string => typeof x === 'string').map((x) => x.trim().toUpperCase()).filter(Boolean);
    return allowed ? out.filter((x) => allowed.includes(x)) : out;
  };
  const impacts = Array.isArray(p.impacts) ? p.impacts.filter((x): x is Impact => x === 'low' || x === 'medium' || x === 'high') : DEFAULT_PREFS.impacts;
  const leadTimes = Array.isArray(p.leadTimes) ? p.leadTimes.filter((x): x is LeadMinutes => [60, 30, 15, 5].includes(Number(x))).map((x) => Number(x) as LeadMinutes) : DEFAULT_PREFS.leadTimes;
  const clampInt = (v: unknown, min: number, max: number, d: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : d; };
  return {
    favorites: strArr(p.favorites, DEFAULT_PREFS.favorites).slice(0, 30),
    customSymbols: Array.isArray(p.customSymbols) ? p.customSymbols.filter((x): x is string => typeof x === 'string').map((s) => s.trim().toUpperCase()).filter((s) => /^[A-Z0-9/.:-]{2,15}$/.test(s)).slice(0, 20) : [],
    currencies: strArr(p.currencies, DEFAULT_PREFS.currencies, ALL_CURRENCIES),
    impacts: impacts.length ? impacts : DEFAULT_PREFS.impacts,
    leadTimes: Array.from(new Set(leadTimes)).sort((a, b) => b - a),
    alerts: { ...DEFAULT_PREFS.alerts, ...(typeof p.alerts === 'object' && p.alerts ? Object.fromEntries(Object.entries(p.alerts).filter(([, v]) => typeof v === 'boolean')) : {}) },
    newsTypes: Array.isArray(p.newsTypes) ? p.newsTypes.filter((x): x is string => typeof x === 'string' && NEWS_TYPES.some((t) => t.id === x)) : DEFAULT_PREFS.newsTypes,
    timezone: typeof p.timezone === 'string' && isValidTz(p.timezone) ? p.timezone : DEFAULT_PREFS.timezone,
    theme: p.theme === 'light' || p.theme === 'system' ? p.theme : 'dark',
    analysisIntervalMinutes: clampInt(p.analysisIntervalMinutes, 30, 720, DEFAULT_PREFS.analysisIntervalMinutes),
    quoteRefreshSeconds: clampInt(p.quoteRefreshSeconds, 60, 900, DEFAULT_PREFS.quoteRefreshSeconds),
    updatedAt: typeof p.updatedAt === 'string' ? p.updatedAt : new Date().toISOString(),
  };
}

function isValidTz(tz: string) {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}
