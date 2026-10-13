import { featureStatus } from '@/lib/config';
import { kv } from '@/lib/kv';
import { getLastTick } from '@/lib/jobs/tick';
import { listSubscriptions } from '@/lib/notifications/push';
import { json } from '@/lib/http';

export async function GET() {
  const [tick, subs] = await Promise.all([getLastTick(), listSubscriptions()]);
  return json({ features: featureStatus(), storage: kv().kind, lastTick: tick, subscriptions: subs.length, now: new Date().toISOString() });
}
