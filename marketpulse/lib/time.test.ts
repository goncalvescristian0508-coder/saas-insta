import { describe, it, expect } from 'vitest';
import { fmtTime, fmtDateTime, dayKey, currentSession, relativeTime } from './time';

describe('fuso de Brasília', () => {
  it('converte UTC para Brasília (UTC-3, sem horário de verão)', () => {
    expect(fmtTime('2026-10-14T12:30:00Z')).toBe('09:30');
    expect(fmtDateTime('2026-01-15T02:00:00Z')).toContain('14/01');
    expect(dayKey('2026-01-15T02:00:00Z')).toBe('2026-01-14');
  });
  it('horário de verão dos EUA é refletido pela fonte (offset no ISO)', () => {
    // 8:30 ET em março (EDT, UTC-4) = 12:30Z = 09:30 BRT; em janeiro (EST, UTC-5) = 13:30Z = 10:30 BRT
    expect(fmtTime(new Date('2026-03-13T08:30:00-04:00').toISOString())).toBe('09:30');
    expect(fmtTime(new Date('2026-01-14T08:30:00-05:00').toISOString())).toBe('10:30');
  });
});

describe('sessões', () => {
  it('identifica sessões e fim de semana', () => {
    expect(currentSession(new Date('2026-10-14T15:00:00Z'))).toBe('newyork');
    expect(currentSession(new Date('2026-10-14T09:00:00Z'))).toBe('london');
    expect(currentSession(new Date('2026-10-14T02:00:00Z'))).toBe('asia');
    expect(currentSession(new Date('2026-10-17T12:00:00Z'))).toBe('closed'); // sábado
    expect(currentSession(new Date('2026-10-16T23:00:00Z'))).toBe('closed'); // sexta após 22h UTC
    expect(currentSession(new Date('2026-10-18T23:00:00Z'))).toBe('asia'); // domingo 22h+
  });
  it('tempo relativo', () => {
    const now = Date.parse('2026-10-14T12:00:00Z');
    expect(relativeTime('2026-10-14T11:57:00Z', now)).toBe('há 3 min');
    expect(relativeTime('2026-10-14T12:30:00Z', now)).toBe('em 30 min');
  });
});
