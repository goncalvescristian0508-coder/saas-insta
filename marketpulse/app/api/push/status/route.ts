import { listSubscriptions, getSendLog, pushConfigured } from '@/lib/notifications/push';
import { json } from '@/lib/http';
export async function GET() {
  const [subs, log] = await Promise.all([listSubscriptions(), getSendLog(20)]);
  return json({ configured: pushConfigured(), subscriptions: subs.map((s) => ({ endpoint: s.endpoint.slice(0, 40) + '…', createdAt: s.createdAt, lastSuccessAt: s.lastSuccessAt, failures: s.failures, userAgent: s.userAgent })), log });
}
