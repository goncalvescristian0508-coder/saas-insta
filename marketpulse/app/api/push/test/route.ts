import { notifyNow } from '@/lib/notifications/service';
import { pushConfigured } from '@/lib/notifications/push';
import { fmtDateTime } from '@/lib/time';
import { json, fail } from '@/lib/http';

export async function POST() {
  if (!pushConfigured()) return fail('VAPID não configurado.', 503);
  const log = await notifyNow({ kind: 'test', title: '✅ MarketPulse: notificação de teste', body: `Enviada às ${fmtDateTime(new Date())} (Brasília). Se você está vendo isto com o app fechado, está tudo certo.`, url: '/notifications', tag: 'test', symbols: [] });
  if (log.sent === 0) return fail(`Nenhuma entrega: ${log.errors.join('; ') || 'sem inscrições'}`, 409, { log });
  return json({ ok: true, log });
}
