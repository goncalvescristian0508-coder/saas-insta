import { describe, it, expect } from 'vitest';
import { parseNumeric, eventStatus, stableEventId, impactFrom } from './normalize';

describe('parseNumeric', () => {
  it('interpreta percentuais, sufixos e negativos', () => {
    expect(parseNumeric('3.4%')).toBe(3.4);
    expect(parseNumeric('-0.2')).toBe(-0.2);
    expect(parseNumeric('250K')).toBe(250000);
    expect(parseNumeric('1.2M')).toBe(1200000);
    expect(parseNumeric('1,234')).toBe(1234);
    expect(parseNumeric('')).toBeUndefined();
    expect(parseNumeric('n/a')).toBeUndefined();
  });
});

describe('eventStatus', () => {
  const now = Date.parse('2026-10-14T13:00:00Z');
  it('divulgado quando há resultado', () => {
    expect(eventStatus({ time: '2026-10-14T12:30:00Z', actual: '3.4%', impact: 'high' }, true, now)).toBe('released');
  });
  it('atrasado após 20 min sem resultado se o provedor publica resultados', () => {
    expect(eventStatus({ time: '2026-10-14T12:30:00Z', impact: 'high' }, true, now)).toBe('delayed');
  });
  it('indisponível se o provedor não publica resultados', () => {
    expect(eventStatus({ time: '2026-10-14T12:30:00Z', impact: 'high' }, false, now)).toBe('unavailable');
  });
  it('previsto antes do horário ou logo após', () => {
    expect(eventStatus({ time: '2026-10-14T14:00:00Z', impact: 'high' }, true, now)).toBe('scheduled');
    expect(eventStatus({ time: '2026-10-14T12:50:00Z', impact: 'high' }, true, now)).toBe('scheduled');
  });
});

describe('stableEventId / impactFrom', () => {
  it('id é estável e insensível a espaços/caixa', () => {
    expect(stableEventId('CPI m/m', 'USD', '2026-10-14T12:30:00.000Z')).toBe(stableEventId('cpi  M/M ', 'USD', '2026-10-14T12:30:00.000Z'));
    expect(stableEventId('CPI m/m', 'USD', '2026-10-14T12:30:00.000Z')).not.toBe(stableEventId('CPI y/y', 'USD', '2026-10-14T12:30:00.000Z'));
  });
  it('mapeia impactos de diferentes provedores', () => {
    expect(impactFrom('High')).toBe('high'); expect(impactFrom(3)).toBe('high'); expect(impactFrom('Medium')).toBe('medium'); expect(impactFrom('Holiday')).toBe('holiday'); expect(impactFrom('Low')).toBe('low');
  });
});
