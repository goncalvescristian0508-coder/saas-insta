import { listNotifications, markRead, unreadCount } from '@/lib/notifications/history';
import type { AlertKind } from '@/lib/notifications/rules';
import { json, fail, readJson } from '@/lib/http';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const items = await listNotifications({ symbol: url.searchParams.get('symbol')?.toUpperCase() || undefined, kind: (url.searchParams.get('kind') as AlertKind) || undefined, unreadOnly: url.searchParams.get('unread') === '1', limit: 150 });
  return json({ items, unread: await unreadCount() });
}

export async function POST(req: Request) {
  const b = await readJson<{ ids?: string[] | 'all' }>(req);
  if (!b?.ids) return fail('ids ausente');
  const changed = await markRead(b.ids);
  return json({ ok: true, changed, unread: await unreadCount() });
}
