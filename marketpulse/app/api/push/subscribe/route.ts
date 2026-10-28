import { saveSubscription, pushConfigured } from '@/lib/notifications/push';
import { json, fail, readJson } from '@/lib/http';

type Body = { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
export async function POST(req: Request) {
  if (!pushConfigured()) return fail('VAPID não configurado.', 503);
  const b = await readJson<Body>(req);
  if (!b?.endpoint || !b.keys?.p256dh || !b.keys?.auth) return fail('inscrição inválida');
  try {
    await saveSubscription({ endpoint: b.endpoint, keys: { p256dh: b.keys.p256dh, auth: b.keys.auth } }, req.headers.get('user-agent') ?? undefined);
    return json({ ok: true });
  } catch (e) { return fail(e instanceof Error ? e.message : 'erro'); }
}
