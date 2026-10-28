import { vapidPublicKey, pushConfigured } from '@/lib/notifications/push';
import { json, fail } from '@/lib/http';
export async function GET() {
  if (!pushConfigured()) return fail('VAPID não configurado no servidor (npm run vapid).', 503);
  return json({ publicKey: vapidPublicKey() });
}
