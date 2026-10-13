import { getCurrentAnalysis, getAnalysisHistory, runAnalysis } from '@/lib/analysis/engine';
import { featureStatus } from '@/lib/config';
import { json, fail } from '@/lib/http';

export async function GET() {
  const [analysis, history] = await Promise.all([getCurrentAnalysis(), getAnalysisHistory(10)]);
  return json({ analysis, history, aiConfigured: featureStatus().ai, model: featureStatus().aiModel });
}

export async function POST() {
  if (!featureStatus().ai) return fail('ANTHROPIC_API_KEY não configurada.', 503);
  const r = await runAnalysis('manual');
  if (!r.ok) return fail(r.skipped ?? 'falha', 409);
  return json({ ok: true, analysis: r.analysis, biasChanges: r.biasChanges });
}

export const maxDuration = 300;
