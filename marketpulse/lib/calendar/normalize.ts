/** Funções puras para normalizar eventos (ids estáveis, status, parsing de números). */
import type { EconEvent, EventStatus, Impact } from './types';

export function stableEventId(title: string, currency: string, timeIso: string): string {
  const s = `${currency}|${title.toLowerCase().replace(/\s+/g, ' ').trim()}|${timeIso}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(36) + '-' + s.length.toString(36);
}

export function impactFrom(v: unknown): Impact {
  const s = String(v ?? '').toLowerCase();
  if (s.includes('high') || s === '3' || s.includes('alto')) return 'high';
  if (s.includes('med') || s === '2') return 'medium';
  if (s.includes('holiday') || s.includes('feriado')) return 'holiday';
  return 'low';
}

/** Converte "3.4%", "-0.2", "250K", "1.2M", "" em número (ou undefined). */
export function parseNumeric(v?: string | number | null): number | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  const s = v.trim();
  if (!s) return undefined;
  const m = s.replace(/,/g, '').match(/^(-?\d+(?:\.\d+)?)\s*([KMBT%])?/i);
  if (!m) return undefined;
  let n = Number(m[1]);
  const suf = (m[2] ?? '').toUpperCase();
  if (suf === 'K') n *= 1e3; else if (suf === 'M') n *= 1e6; else if (suf === 'B') n *= 1e9; else if (suf === 'T') n *= 1e12;
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Status do evento: 'released' se tem resultado; 'delayed' se já passou >20 min sem resultado
 * e o provedor publica resultados; 'unavailable' se passou e o provedor não publica resultados.
 */
export function eventStatus(ev: { time: string; actual?: string; impact: Impact }, supportsActuals: boolean, now = Date.now()): EventStatus {
  if (ev.actual && ev.actual.trim() !== '') return 'released';
  const t = new Date(ev.time).getTime();
  if (ev.impact === 'holiday') return 'scheduled';
  if (t + 20 * 60000 < now) return supportsActuals ? 'delayed' : 'unavailable';
  return 'scheduled';
}

export function sortByTime(events: EconEvent[]): EconEvent[] {
  return [...events].sort((a, b) => a.time.localeCompare(b.time));
}
