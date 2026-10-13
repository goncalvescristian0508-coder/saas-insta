/** Central de notificações: histórico persistido (últimos 300), leitura e filtros. */
import 'server-only';
import { kv } from '../kv';
import type { AlertKind } from './rules';

export interface NotificationRecord { id: string; at: string; kind: AlertKind; title: string; body: string; url?: string; symbols: string[]; read: boolean; delivered: number; eventId?: string }

const KEY = 'notifications:history';
const MAX = 300;

export async function addNotification(n: Omit<NotificationRecord, 'id' | 'read' | 'at'> & { at?: string }): Promise<NotificationRecord> {
  const rec: NotificationRecord = { id: `n-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, at: n.at ?? new Date().toISOString(), read: false, ...n };
  await kv().lpush(KEY, rec, MAX);
  return rec;
}

export async function listNotifications(opts?: { symbol?: string; kind?: AlertKind; unreadOnly?: boolean; limit?: number }): Promise<NotificationRecord[]> {
  const all = await kv().lrange<NotificationRecord>(KEY, 0, MAX - 1);
  return all.filter((n) => (!opts?.symbol || n.symbols.includes(opts.symbol)) && (!opts?.kind || n.kind === opts.kind) && (!opts?.unreadOnly || !n.read)).slice(0, opts?.limit ?? 100);
}

export async function markRead(ids: string[] | 'all'): Promise<number> {
  const all = await kv().lrange<NotificationRecord>(KEY, 0, MAX - 1);
  let changed = 0;
  const updated = all.map((n) => { if (!n.read && (ids === 'all' || ids.includes(n.id))) { changed++; return { ...n, read: true }; } return n; });
  if (changed) await kv().lset(KEY, updated);
  return changed;
}

export async function unreadCount(): Promise<number> {
  return (await kv().lrange<NotificationRecord>(KEY, 0, MAX - 1)).filter((n) => !n.read).length;
}
