import { removeSubscription } from '@/lib/notifications/push';
import { json, fail, readJson } from '@/lib/http';
export async function POST(req: Request) {
  const b = await readJson<{ endpoint?: string }>(req);
  if (!b?.endpoint) return fail('endpoint ausente');
  await removeSubscription(b.endpoint);
  return json({ ok: true });
}
