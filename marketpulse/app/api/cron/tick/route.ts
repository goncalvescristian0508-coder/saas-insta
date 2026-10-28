/**
 * Job automático. Protegido por CRON_SECRET (Vercel Cron envia "Authorization: Bearer <CRON_SECRET>";
 * agendadores externos podem usar ?secret=). Roda a cada minuto; internamente há lock e TTLs.
 */
import { cronAuthorized } from '@/lib/auth';
import { runTick } from '@/lib/jobs/tick';
import { json, fail } from '@/lib/http';

export async function GET(req: Request) {
  if (!cronAuthorized(req)) return fail('não autorizado', 401);
  const report = await runTick();
  return json(report);
}
export const maxDuration = 300;
