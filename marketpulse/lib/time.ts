/** Utilidades de tempo. Armazenamos sempre ISO UTC; exibimos em Brasília (sem horário de verão desde 2019). */
export const BR_TZ = 'America/Sao_Paulo';

export function fmtBR(iso: string | Date | number, opts: Intl.DateTimeFormatOptions = {}, tz = BR_TZ): string {
  const d = typeof iso === 'string' || typeof iso === 'number' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', { timeZone: tz, ...opts }).format(d);
}

export function fmtTime(iso: string | Date | number, tz = BR_TZ) {
  return fmtBR(iso, { hour: '2-digit', minute: '2-digit' }, tz);
}
export function fmtDateTime(iso: string | Date | number, tz = BR_TZ) {
  return fmtBR(iso, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }, tz);
}
export function fmtDate(iso: string | Date | number, tz = BR_TZ) {
  return fmtBR(iso, { weekday: 'short', day: '2-digit', month: 'short' }, tz);
}

/** Chave de dia local (YYYY-MM-DD) no fuso informado. */
export function dayKey(iso: string | Date | number, tz = BR_TZ): string {
  const d = typeof iso === 'string' || typeof iso === 'number' ? new Date(iso) : iso;
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}

/** "há 3 min", "há 2 h" */
export function relativeTime(iso: string | number | Date, now: number = Date.now()): string {
  const t = typeof iso === 'string' || typeof iso === 'number' ? new Date(iso).getTime() : iso.getTime();
  if (!Number.isFinite(t)) return '—';
  const diff = Math.round((now - t) / 1000);
  const abs = Math.abs(diff);
  const fut = diff < 0;
  const f = (n: number, u: string) => (fut ? `em ${n} ${u}` : `há ${n} ${u}`);
  if (abs < 45) return fut ? 'em instantes' : 'agora';
  if (abs < 3600) return f(Math.round(abs / 60), 'min');
  if (abs < 86400) return f(Math.round(abs / 3600), 'h');
  return f(Math.round(abs / 86400), 'd');
}

export function minutesUntil(iso: string, now: number = Date.now()): number {
  return (new Date(iso).getTime() - now) / 60000;
}

/** Sessão de mercado aproximada (Forex/Gold OTC) com base no horário UTC. */
export type Session = 'asia' | 'london' | 'newyork' | 'closed';
export function currentSession(now: Date = new Date()): Session {
  const day = now.getUTCDay();
  const h = now.getUTCHours() + now.getUTCMinutes() / 60;
  // Fechado do fim da sessão de NY na sexta (22:00 UTC) até abertura de Sydney/Ásia no domingo (22:00 UTC)
  if (day === 6) return 'closed';
  if (day === 5 && h >= 22) return 'closed';
  if (day === 0 && h < 22) return 'closed';
  if (h >= 13 && h < 22) return 'newyork';
  if (h >= 7 && h < 13) return 'london';
  return 'asia';
}

export const SESSION_LABEL: Record<Session, string> = {
  asia: 'Sessão asiática',
  london: 'Sessão de Londres',
  newyork: 'Sessão de Nova York',
  closed: 'Mercado fechado (fim de semana)',
};

/** Janela de "mercado ativo" para rodar análises automáticas: domingo 19h BRT até sexta 18h BRT. */
export function isForexOpen(now: Date = new Date()): boolean {
  return currentSession(now) !== 'closed';
}

export function minutesSince(iso: string, now: number = Date.now()): number {
  return (now - new Date(iso).getTime()) / 60000;
}
export function isPast(iso: string, now: number = Date.now()): boolean {
  return new Date(iso).getTime() < now;
}
