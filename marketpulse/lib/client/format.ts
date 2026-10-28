/** Formatação no cliente (preços, variação, horários em Brasília). */
export { fmtTime, fmtDateTime, fmtDate, relativeTime, minutesSince, isPast, BR_TZ } from '../time';

export function fmtPrice(n: number | undefined | null, decimals = 2): string {
  if (n === undefined || n === null || !Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n);
}
export function fmtPct(n: number | undefined | null): string {
  if (n === undefined || n === null || !Number.isFinite(n)) return '—';
  return `${n > 0 ? '+' : ''}${n.toFixed(2)}%`;
}
export const BIAS_LABEL: Record<string, string> = { altista: 'Altista', baixista: 'Baixista', neutro: 'Neutro', indefinido: 'Indefinido' };
export const IMPACT_LABEL: Record<string, string> = { high: 'Alto', medium: 'Médio', low: 'Baixo', holiday: 'Feriado' };
export const STATUS_LABEL: Record<string, string> = { scheduled: 'Previsto', released: 'Divulgado', delayed: 'Atrasado', unavailable: 'Indisponível' };
export const KIND_LABEL: Record<string, string> = { 'pre-event': 'Notícia em breve', released: 'Resultado', surprise: 'Surpresa', 'bias-change': 'Mudança de cenário', volatility: 'Volatilidade', analysis: 'Análise', revision: 'Revisão', test: 'Teste', news: 'Notícia' };
