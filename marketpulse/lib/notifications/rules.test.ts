import { describe, it, expect } from 'vitest';
import { dueLeadTimes, detectSurprise, eventMatchesPrefs, affectedAssets, preEventMessage, releasedMessage, dedupKey, usdImplication } from './rules';
import { DEFAULT_PREFS } from '../prefs/types';
import type { EconEvent } from '../calendar/types';

const base: EconEvent = { id: 'cpi-1', title: 'CPI m/m', country: 'US', currency: 'USD', time: '2026-10-14T12:30:00.000Z', impact: 'high', previous: '0.2%', forecast: '0.3%', status: 'scheduled', source: 'test' };
const T = new Date(base.time).getTime();

describe('dueLeadTimes', () => {
  it('dispara o alerta de 15 min dentro da janela [11, 15] min', () => {
    expect(dueLeadTimes(base, [60, 15, 5], T - 15 * 60000)).toEqual([15]);
    expect(dueLeadTimes(base, [60, 15, 5], T - 12 * 60000)).toEqual([15]);
  });
  it('não dispara fora da janela (evita duplicar com o alerta de 5 min)', () => {
    expect(dueLeadTimes(base, [60, 15, 5], T - 10 * 60000)).toEqual([]);
    expect(dueLeadTimes(base, [60, 15, 5], T - 16 * 60000)).toEqual([]);
  });
  it('dispara 1h e 5 min nas respectivas janelas', () => {
    expect(dueLeadTimes(base, [60, 30, 15, 5], T - 59 * 60000)).toEqual([60]);
    expect(dueLeadTimes(base, [60, 30, 15, 5], T - 3 * 60000)).toEqual([5]);
  });
  it('não dispara após o evento', () => {
    expect(dueLeadTimes(base, [5], T + 60000)).toEqual([]);
  });
});

describe('detectSurprise', () => {
  it('detecta resultado acima com magnitude relevante', () => {
    const s = detectSurprise({ actual: '3.4%', forecast: '3.0%' });
    expect(s?.direction).toBe('above');
    expect(s?.relevant).toBe(true);
    expect(s?.magnitude).toBeCloseTo(0.1333, 3);
  });
  it('resultado em linha não é relevante', () => {
    expect(detectSurprise({ actual: '3.0%', forecast: '3.0%' })).toMatchObject({ direction: 'inline', relevant: false });
  });
  it('pequena diferença não é relevante', () => {
    expect(detectSurprise({ actual: '3.1%', forecast: '3.0%' })?.relevant).toBe(false);
  });
  it('inversão de sinal é relevante', () => {
    expect(detectSurprise({ actual: '-0.1%', forecast: '0.1%' })).toMatchObject({ direction: 'below', relevant: true });
  });
  it('usa o anterior quando não há previsão', () => {
    expect(detectSurprise({ actual: '250K', previous: '200K' })).toMatchObject({ direction: 'above', relevant: true });
  });
  it('retorna null sem números', () => {
    expect(detectSurprise({ actual: undefined, forecast: '3.0%' })).toBeNull();
    expect(detectSurprise({ actual: 'n/a', forecast: '3.0%' })).toBeNull();
  });
});

describe('eventMatchesPrefs / affectedAssets', () => {
  it('respeita impacto e moeda das preferências', () => {
    expect(eventMatchesPrefs(base, DEFAULT_PREFS)).toBe(true);
    expect(eventMatchesPrefs({ ...base, impact: 'low' }, DEFAULT_PREFS)).toBe(false);
    expect(eventMatchesPrefs({ ...base, currency: 'NZD' }, DEFAULT_PREFS)).toBe(false);
    expect(eventMatchesPrefs({ ...base, impact: 'holiday' }, DEFAULT_PREFS)).toBe(false);
  });
  it('relaciona CPI dos EUA a ouro e pares com USD', () => {
    const a = affectedAssets(base, DEFAULT_PREFS);
    expect(a).toContain('XAUUSD');
    expect(a).toContain('EURUSD');
    expect(a).toContain('NAS100');
  });
  it('evento do EUR só afeta ativos com EUR', () => {
    const a = affectedAssets({ ...base, currency: 'EUR', title: 'ECB Rate Decision' }, DEFAULT_PREFS);
    expect(a).toEqual(['EURUSD']);
  });
});

describe('mensagens', () => {
  it('pré-evento segue o formato esperado', () => {
    const m = preEventMessage(base, 15, ['XAUUSD', 'EURUSD']);
    expect(m.title).toBe('🔴 CPI M/M EM 15 MINUTOS');
    expect(m.body).toContain('Evento de alto impacto (USD).');
    expect(m.body).toContain('Ativos monitorados: XAUUSD, EURUSD.');
    expect(m.body).toContain('volatilidade');
    expect(m.kind).toBe('pre-event');
  });
  it('resultado divulgado com surpresa marca kind=surprise e explica o impacto', () => {
    const m = releasedMessage({ ...base, actual: '3.4%', forecast: '3.0%', status: 'released' }, ['XAUUSD']);
    expect(m.kind).toBe('surprise');
    expect(m.title).toContain('🚨');
    expect(m.body).toContain('Previsão: 3.0%');
    expect(m.body).toContain('Resultado: 3.4%');
    expect(m.body).toContain('Acima do esperado.');
    expect(m.body.toLowerCase()).toContain('ouro');
  });
  it('resultado em linha marca kind=released', () => {
    const m = releasedMessage({ ...base, actual: '0.3%', status: 'released' }, []);
    expect(m.kind).toBe('released');
  });
  it('desemprego acima do esperado é dovish (dólar mais fraco)', () => {
    const ev = { ...base, title: 'Unemployment Rate', forecast: '4.0%', actual: '4.5%' };
    const s = detectSurprise(ev)!;
    expect(usdImplication(ev, s)).toContain('Dólar cai');
  });
});

describe('dedupKey', () => {
  it('é determinística por evento e antecedência', () => {
    expect(dedupKey.preEvent('cpi-1', 15)).toBe('alert:pre:cpi-1:15');
    expect(dedupKey.preEvent('cpi-1', 5)).not.toBe(dedupKey.preEvent('cpi-1', 15));
    expect(dedupKey.bias('XAUUSD', 'neutro', 'altista', '2026-10-14')).toBe('alert:bias:XAUUSD:neutro>altista:2026-10-14');
  });
});
