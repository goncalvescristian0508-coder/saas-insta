/**
 * Analysis Engine: combina o retrato de dados reais com a IA (Anthropic) e persiste o resultado.
 * Proteções: não roda sem dados mínimos; não repete execuções em intervalo curto; valida a saída.
 */
import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { config } from '../config';
import { kv } from '../kv';
import { logger, errMsg } from '../logger';
import { buildSnapshot, renderSnapshot, type DataSnapshot } from './snapshot';
import { SYSTEM_PROMPT } from './prompts';
import { AnalysisOutputSchema, type StoredAnalysis, type Bias } from './schema';
import { getPrefs } from '../prefs/service';

const log = logger('analysis');

/** Encadeia as mensagens de `cause` (fetch failed → ECONNREFUSED...) para diagnóstico. */
function causeChain(e: unknown): string {
  const parts: string[] = [];
  let cur = (e as { cause?: unknown }).cause;
  for (let i = 0; i < 5 && cur; i++) { parts.push(cur instanceof Error ? `${cur.name}: ${cur.message}` : String(cur)); cur = (cur as { cause?: unknown }).cause; }
  return parts.join(' ← ');
}
const CURRENT_KEY = 'analysis:current';
const HISTORY_KEY = 'analysis:history';
const LOCK_KEY = 'analysis:lock';
const MIN_MANUAL_GAP_MIN = 5;

export async function getCurrentAnalysis(): Promise<StoredAnalysis | null> {
  return kv().get<StoredAnalysis>(CURRENT_KEY);
}

export async function getAnalysisHistory(limit = 20): Promise<Pick<StoredAnalysis, 'id' | 'generatedAt' | 'trigger' | 'model'>[]> {
  return kv().lrange(HISTORY_KEY, 0, limit - 1);
}

export interface RunResult { ok: boolean; analysis?: StoredAnalysis; skipped?: string; biasChanges: { symbol: string; from: Bias; to: Bias }[] }

/** Dados mínimos: ao menos 1 ativo com cotação fresca e calendário carregado. */
function hasMinimumData(s: DataSnapshot): string | null {
  const withQuote = Object.values(s.quotes).filter((q) => q.quote && !q.stale).length;
  if (withQuote === 0) return 'Nenhuma cotação atual disponível — análise não executada para evitar conclusões sem dados.';
  return null;
}

export async function runAnalysis(trigger: StoredAnalysis['trigger'], opts?: { force?: boolean }): Promise<RunResult> {
  const store = kv();
  if (!config.ai.apiKey) return { ok: false, skipped: 'ANTHROPIC_API_KEY não configurada', biasChanges: [] };

  const current = await getCurrentAnalysis();
  if (trigger === 'manual' && current && !opts?.force) {
    const ageMin = (Date.now() - new Date(current.generatedAt).getTime()) / 60000;
    if (ageMin < MIN_MANUAL_GAP_MIN) return { ok: false, skipped: `Última análise há ${Math.round(ageMin)} min; aguarde ${MIN_MANUAL_GAP_MIN} min entre atualizações manuais.`, biasChanges: [] };
  }
  if (!(await store.setnx(LOCK_KEY, '1', 180))) return { ok: false, skipped: 'Outra análise está em andamento.', biasChanges: [] };

  try {
    const prefs = await getPrefs();
    const symbols = Array.from(new Set([...prefs.favorites, ...prefs.customSymbols]));
    const snapshot = await buildSnapshot(symbols, Array.from(new Set([...prefs.currencies, 'USD'])));
    const minErr = hasMinimumData(snapshot);
    if (minErr) { log.warn('análise pulada', { reason: minErr }); return { ok: false, skipped: minErr, biasChanges: [] }; }

    const rendered = renderSnapshot(snapshot, prefs.timezone);
    const client = new Anthropic({ apiKey: config.ai.apiKey, baseURL: config.ai.baseUrl, timeout: 240_000, maxRetries: 2 });
    const started = Date.now();
    const response = await client.beta.messages.parse({
      model: config.ai.model,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: config.ai.effort, format: zodOutputFormat(AnalysisOutputSchema) },
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: `Ativos monitorados: ${symbols.join(', ')}.\n\nRETRATO DE MERCADO:\n${rendered}` }],
    });
    if (response.stop_reason === 'refusal') {
      return { ok: false, skipped: `O modelo recusou a solicitação (${response.stop_details?.category ?? 'sem categoria'}).`, biasChanges: [] };
    }
    const parsed = response.parsed_output;
    if (!parsed) return { ok: false, skipped: 'Saída da IA inválida (não passou na validação do esquema).', biasChanges: [] };

    // Garante que todo ativo monitorado tenha entrada; os ausentes ficam "indefinido".
    for (const s of symbols) if (!parsed.assets.some((a) => a.symbol === s)) {
      parsed.assets.push({ symbol: s, bias: 'indefinido', horizon: '—', summary: 'A IA não retornou análise para este ativo.', reasons: [], counterpoints: [], catalysts: [], bullishConfirmation: [], bearishConfirmation: [], keyLevelsNote: '', dataQuality: 'insuficiente' });
    }
    // Proteção: sem cotação/técnico, forçamos "indefinido" mesmo que a IA opine.
    for (const a of parsed.assets) {
      const q = snapshot.quotes[a.symbol];
      const t = snapshot.technicals[a.symbol];
      if (!q?.quote && !t?.dataSufficient) { a.bias = 'indefinido'; a.dataQuality = 'insuficiente'; }
    }

    const analysis: StoredAnalysis = {
      id: `a-${Date.now().toString(36)}`, generatedAt: new Date().toISOString(), model: response.model ?? config.ai.model, trigger, output: parsed,
      sources: snapshot.sources, dataWarnings: snapshot.warnings, technicals: snapshot.technicals,
      usage: { input: response.usage.input_tokens, output: response.usage.output_tokens, cacheRead: response.usage.cache_read_input_tokens ?? undefined },
    };
    const biasChanges: RunResult['biasChanges'] = [];
    if (current) {
      for (const a of parsed.assets) {
        const prev = current.output.assets.find((x) => x.symbol === a.symbol);
        // mudança confirmada por novos dados: só com qualidade completa/parcial e viés definido em ambos
        if (prev && prev.bias !== a.bias && a.bias !== 'indefinido' && prev.bias !== 'indefinido' && a.dataQuality !== 'insuficiente') biasChanges.push({ symbol: a.symbol, from: prev.bias, to: a.bias });
      }
    }
    await store.set(CURRENT_KEY, analysis);
    await store.set(`analysis:${analysis.id}`, analysis, 7 * 24 * 3600);
    await store.lpush(HISTORY_KEY, { id: analysis.id, generatedAt: analysis.generatedAt, trigger, model: analysis.model }, 50);
    log.info('análise concluída', { trigger, ms: Date.now() - started, input: analysis.usage?.input, output: analysis.usage?.output, cacheRead: analysis.usage?.cacheRead, biasChanges: biasChanges.length });
    return { ok: true, analysis, biasChanges };
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) log.error('rate limit da API de IA', { message: e.message });
    else if (e instanceof Anthropic.AuthenticationError) log.error('chave da API de IA inválida');
    else if (e instanceof Anthropic.APIError) log.error('erro da API de IA', { status: e.status, message: e.message, cause: causeChain(e) });
    else log.error('falha na análise', { message: errMsg(e) });
    return { ok: false, skipped: `Falha ao gerar análise: ${errMsg(e)}`, biasChanges: [] };
  } finally {
    await store.del(LOCK_KEY);
  }
}

/** Decide se a análise agendada deve rodar agora (intervalo das preferências; só com mercado aberto). */
export async function analysisDue(intervalMinutes: number, marketOpen: boolean): Promise<boolean> {
  if (!marketOpen) return false;
  const current = await getCurrentAnalysis();
  if (!current) return true;
  return Date.now() - new Date(current.generatedAt).getTime() >= intervalMinutes * 60000;
}
