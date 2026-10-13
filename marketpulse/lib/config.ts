/**
 * Leitura centralizada das variáveis de ambiente.
 * Nada daqui deve ser importado por componentes client.
 */
import 'server-only';

function env(name: string, fallback = ''): string {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}

function intEnv(name: string, fallback: number): number {
  const n = Number.parseInt(env(name, ''), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const config = {
  appUrl: env('NEXT_PUBLIC_APP_URL', 'http://localhost:3100'),
  timezone: env('APP_TIMEZONE', 'America/Sao_Paulo'),
  auth: {
    password: env('APP_PASSWORD'),
    secret: env('AUTH_SECRET'),
    cronSecret: env('CRON_SECRET'),
    cookieName: 'mp_session',
    sessionDays: 30,
  },
  kv: {
    url: env('UPSTASH_REDIS_REST_URL') || env('KV_REST_API_URL'),
    token: env('UPSTASH_REDIS_REST_TOKEN') || env('KV_REST_API_TOKEN'),
  },
  market: {
    twelveDataKey: env('TWELVEDATA_API_KEY'),
    creditsPerMinute: intEnv('MARKET_CREDITS_PER_MINUTE', 8),
    quoteTtlSec: 120,
    candleTtlSec: { intraday: 15 * 60, daily: 60 * 60 },
  },
  calendar: {
    provider: env('CALENDAR_PROVIDER', 'forexfactory') as 'forexfactory' | 'tradingeconomics' | 'fmp',
    tradingEconomicsKey: env('TRADINGECONOMICS_API_KEY'),
    fmpKey: env('FMP_API_KEY'),
    ttlSec: 10 * 60,
    nearEventTtlSec: 90,
  },
  fred: { key: env('FRED_API_KEY') },
  news: { feeds: env('NEWS_FEEDS'), ttlSec: 10 * 60 },
  ai: {
    apiKey: env('ANTHROPIC_API_KEY'),
    baseUrl: env('ANTHROPIC_BASE_URL') || undefined,
    model: env('AI_MODEL', 'claude-opus-5-5'),
    effort: env('AI_EFFORT', 'medium') as 'low' | 'medium' | 'high',
  },
  push: {
    publicKey: env('VAPID_PUBLIC_KEY'),
    privateKey: env('VAPID_PRIVATE_KEY'),
    subject: env('VAPID_SUBJECT', 'mailto:admin@marketpulse.local'),
  },
};

/** Quais recursos estão configurados — usado para mostrar avisos honestos na UI. */
export function featureStatus() {
  return {
    kv: Boolean(config.kv.url && config.kv.token),
    market: Boolean(config.market.twelveDataKey),
    calendar: config.calendar.provider === 'forexfactory'
      || (config.calendar.provider === 'tradingeconomics' && Boolean(config.calendar.tradingEconomicsKey))
      || (config.calendar.provider === 'fmp' && Boolean(config.calendar.fmpKey)),
    calendarProvider: config.calendar.provider,
    fred: Boolean(config.fred.key),
    ai: Boolean(config.ai.apiKey),
    aiModel: config.ai.model,
    push: Boolean(config.push.publicKey && config.push.privateKey),
    auth: Boolean(config.auth.password && config.auth.secret.length >= 32),
    cron: Boolean(config.auth.cronSecret),
  };
}
export type FeatureStatus = ReturnType<typeof featureStatus>;
