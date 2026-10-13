/** Orquestra: regra -> deduplicação -> envio push -> histórico. */
import 'server-only';
import { kv } from '../kv';
import { sendToAll } from './push';
import { addNotification } from './history';
import type { PushMessage } from './rules';

/** Envia uma vez por chave de deduplicação (TTL padrão 3 dias). Retorna false se já enviado. */
export async function notifyOnce(key: string, msg: PushMessage, ttlSec = 3 * 24 * 3600): Promise<boolean> {
  if (!(await kv().setnx(key, '1', ttlSec))) return false;
  const log = await sendToAll(msg);
  await addNotification({ kind: msg.kind, title: msg.title, body: msg.body, url: msg.url, symbols: msg.symbols, delivered: log.sent, eventId: msg.eventId });
  return true;
}

export async function notifyNow(msg: PushMessage) {
  const log = await sendToAll(msg);
  await addNotification({ kind: msg.kind, title: msg.title, body: msg.body, url: msg.url, symbols: msg.symbols, delivered: log.sent, eventId: msg.eventId });
  return log;
}
