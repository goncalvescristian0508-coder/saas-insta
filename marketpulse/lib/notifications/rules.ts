/**
 * Regras de alerta — funções puras, sem I/O, cobertas por testes.
 * Todas as chaves de deduplicação são determinísticas para evitar notificações repetidas.
 */
import type { EconEvent } from '../calendar/types';
import type { Preferences, LeadMinutes } from '../prefs/types';
import { parseNumeric } from '../calendar/normalize';
import { resolveAsset } from '../assets';
import { indicatorInfo } from '../calendar/glossary';

export interface PushMessage { title: string; body: string; url?: string; tag?: string; kind: AlertKind; symbols: string[]; eventId?: string }
export type AlertKind = 'pre-event' | 'released' | 'surprise' | 'bias-change' | 'volatility' | 'analysis' | 'revision' | 'test' | 'news';

/** Evento interessa ao usuário? (impacto e moeda configurados) */
export function eventMatchesPrefs(ev: EconEvent, prefs: Preferences): boolean {
  if (ev.impact === 'holiday') return false;
  if (!prefs.impacts.includes(ev.impact)) return false;
  return prefs.currencies.includes(ev.currency);
}

/** Ativos monitorados afetados pela moeda do evento. */
export function affectedAssets(ev: EconEvent, prefs: Preferences): string[] {
  const all = Array.from(new Set([...prefs.favorites, ...prefs.customSymbols]));
  const info = indicatorInfo(ev.title);
  return all.filter((s) => {
    const a = resolveAsset(s);
    if (!a.currencies.includes(ev.currency)) return false;
    if (info && ev.currency === 'USD') return info.assets.includes(a.symbol) || a.cls === 'metal' || a.cls === 'forex';
    return true;
  });
}

/**
 * Janela de antecedência: dispara quando faltam entre (lead - tolerância) e lead minutos.
 * O job roda a cada ~1 min; a tolerância (padrão 4 min) cobre atrasos do cron sem duplicar (dedup por chave).
 */
export function dueLeadTimes(ev: EconEvent, leadTimes: LeadMinutes[], now: number, toleranceMin = 4): LeadMinutes[] {
  const minutes = (new Date(ev.time).getTime() - now) / 60000;
  return leadTimes.filter((lead) => minutes <= lead && minutes > lead - toleranceMin);
}

export const dedupKey = {
  preEvent: (eventId: string, lead: number) => `alert:pre:${eventId}:${lead}`,
  released: (eventId: string) => `alert:rel:${eventId}`,
  revised: (eventId: string, value: string) => `alert:rev:${eventId}:${value}`,
  bias: (symbol: string, from: string, to: string, day: string) => `alert:bias:${symbol}:${from}>${to}:${day}`,
  volatility: (symbol: string, hourKey: string) => `alert:vol:${symbol}:${hourKey}`,
  analysis: (analysisId: string) => `alert:analysis:${analysisId}`,
};

const IMPACT_ICON: Record<string, string> = { high: '🔴', medium: '🟠', low: '🟡', holiday: '⚪' };
const IMPACT_LABEL: Record<string, string> = { high: 'alto impacto', medium: 'impacto médio', low: 'baixo impacto', holiday: 'feriado' };

export function preEventMessage(ev: EconEvent, lead: number, assets: string[]): PushMessage {
  const when = lead >= 60 ? `EM ${lead / 60} HORA${lead >= 120 ? 'S' : ''}` : `EM ${lead} MINUTOS`;
  const body = [
    `Evento de ${IMPACT_LABEL[ev.impact]} (${ev.currency}).`,
    ev.forecast ? `Previsão: ${ev.forecast}${ev.previous ? ` | Anterior: ${ev.previous}` : ''}` : (ev.previous ? `Anterior: ${ev.previous}` : ''),
    assets.length ? `Ativos monitorados: ${assets.join(', ')}.` : '',
    ev.impact === 'high' ? 'Atenção ao possível aumento de volatilidade.' : '',
  ].filter(Boolean).join('\n');
  return { title: `${IMPACT_ICON[ev.impact]} ${ev.title.toUpperCase()} ${when}`, body, url: `/calendar?event=${ev.id}`, tag: `pre-${ev.id}`, kind: 'pre-event', symbols: assets, eventId: ev.id };
}

export type Surprise = { direction: 'above' | 'below' | 'inline'; magnitude: number; relevant: boolean };

/**
 * Surpresa econômica: compara resultado com previsão. "Relevante" quando a diferença relativa
 * é >= `threshold` (padrão 10% do valor previsto) ou o sinal muda ou a previsão é zero e o resultado não.
 */
export function detectSurprise(ev: Pick<EconEvent, 'actual' | 'forecast' | 'previous'>, threshold = 0.1): Surprise | null {
  const actual = parseNumeric(ev.actual);
  const forecast = parseNumeric(ev.forecast) ?? parseNumeric(ev.previous);
  if (actual === undefined || forecast === undefined) return null;
  const diff = actual - forecast;
  if (Math.abs(diff) < 1e-9) return { direction: 'inline', magnitude: 0, relevant: false };
  const base = Math.abs(forecast);
  const magnitude = base > 0 ? Math.abs(diff) / base : Infinity;
  const signFlip = Math.sign(actual) !== Math.sign(forecast) && forecast !== 0;
  return { direction: diff > 0 ? 'above' : 'below', magnitude, relevant: magnitude >= threshold || signFlip };
}

/** Leitura qualitativa do impacto típico sobre o ouro/dólar para indicadores dos EUA. */
export function usdImplication(ev: EconEvent, surprise: Surprise): string {
  if (surprise.direction === 'inline') return 'Resultado em linha com a previsão.';
  if (ev.currency !== 'USD') return '';
  const info = indicatorInfo(ev.title);
  // O glossário já descreve os cenários "acima/abaixo do esperado" por indicador (inclusive os inversos, como desemprego).
  if (info) return surprise.direction === 'above' ? info.scenarios.above : info.scenarios.below;
  // Fallback genérico: dado mais forte = dólar mais forte, exceto indicadores "ruins quando altos".
  const inverse = /unemployment|jobless|claims/i.test(ev.title);
  const strongerUsd = inverse ? surprise.direction === 'below' : surprise.direction === 'above';
  return strongerUsd ? 'Leitura mais forte para o dólar; possível pressão sobre o ouro, dependendo da reação dos juros.' : 'Leitura mais fraca para o dólar; possível suporte ao ouro, dependendo da reação dos juros.';
}

export function releasedMessage(ev: EconEvent, assets: string[]): PushMessage {
  const surprise = detectSurprise(ev);
  const lines = [
    `Previsão: ${ev.forecast ?? '—'}`,
    `Resultado: ${ev.actual ?? '—'}`,
    ev.previous ? `Anterior: ${ev.previous}` : '',
  ];
  if (surprise) {
    lines.push(surprise.direction === 'above' ? 'Acima do esperado.' : surprise.direction === 'below' ? 'Abaixo do esperado.' : 'Em linha com o esperado.');
    const impl = usdImplication(ev, surprise);
    if (impl) lines.push(impl);
  }
  const relevant = surprise?.relevant ?? false;
  return {
    title: `${relevant ? '🚨' : '📊'} ${ev.title.toUpperCase()} DIVULGADO (${ev.currency})`,
    body: lines.filter(Boolean).join('\n'), url: `/calendar?event=${ev.id}`, tag: `rel-${ev.id}`,
    kind: relevant ? 'surprise' : 'released', symbols: assets, eventId: ev.id,
  };
}

export function revisionMessage(ev: EconEvent, from: string, to: string, assets: string[]): PushMessage {
  return { title: `✏️ REVISÃO: ${ev.title.toUpperCase()} (${ev.currency})`, body: `Resultado revisado de ${from} para ${to}.`, url: `/calendar?event=${ev.id}`, tag: `rev-${ev.id}`, kind: 'revision', symbols: assets, eventId: ev.id };
}

export function biasChangeMessage(symbol: string, from: string, to: string, summary: string): PushMessage {
  const icon = to === 'altista' ? '🟢' : to === 'baixista' ? '🔴' : '⚪';
  return { title: `${icon} ${symbol}: viés mudou para ${to.toUpperCase()}`, body: `Antes: ${from}. ${summary}`.slice(0, 220), url: `/markets/${symbol}`, tag: `bias-${symbol}`, kind: 'bias-change', symbols: [symbol] };
}

export function volatilityMessage(symbol: string, atrPct: number, label: string): PushMessage {
  return { title: `⚡ ${symbol}: volatilidade ${label}`, body: `ATR14 (H1) em ${atrPct.toFixed(2)}% do preço — bem acima da média recente. Ajuste o gerenciamento de risco.`, url: `/markets/${symbol}`, tag: `vol-${symbol}`, kind: 'volatility', symbols: [symbol] };
}

export function analysisUpdatedMessage(regime: string, dollar: string): PushMessage {
  return { title: '🧠 Market Intelligence atualizado', body: `Cenário: ${regime}. Dólar: ${dollar}.`, url: '/', tag: 'analysis', kind: 'analysis', symbols: [] };
}
