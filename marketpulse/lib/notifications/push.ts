/**
 * Notification Service: inscrições Web Push (persistidas no KV), envio com VAPID,
 * limpeza de inscrições expiradas e registro de tentativas/erros.
 */
import 'server-only';
import webpush from 'web-push';
import { config } from '../config';
import { kv } from '../kv';
import { logger, errMsg } from '../logger';
import type { PushMessage } from './rules';

const log = logger('push');
const SUBS_KEY = 'push:subscriptions';   // hash endpointHash -> subscription
const LOG_KEY = 'push:log';               // lista das últimas tentativas

export interface StoredSubscription { endpoint: string; keys: { p256dh: string; auth: string }; userAgent?: string; createdAt: string; lastSuccessAt?: string; failures: number }
export interface SendLog { at: string; title: string; kind: string; sent: number; failed: number; removed: number; errors: string[] }

function hash(s: string) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h.toString(36); }

let vapidReady = false;
function ensureVapid() {
  if (vapidReady) return true;
  if (!config.push.publicKey || !config.push.privateKey) return false;
  webpush.setVapidDetails(config.push.subject, config.push.publicKey, config.push.privateKey);
  vapidReady = true;
  return true;
}

export function pushConfigured() { return Boolean(config.push.publicKey && config.push.privateKey); }
export function vapidPublicKey() { return config.push.publicKey; }

export async function listSubscriptions(): Promise<StoredSubscription[]> {
  return Object.values(await kv().hgetall<StoredSubscription>(SUBS_KEY));
}

export async function saveSubscription(sub: { endpoint: string; keys: { p256dh: string; auth: string } }, userAgent?: string): Promise<void> {
  if (!sub.endpoint.startsWith('https://')) throw new Error('endpoint inválido');
  const existing = (await kv().hgetall<StoredSubscription>(SUBS_KEY))[hash(sub.endpoint)];
  await kv().hset<StoredSubscription>(SUBS_KEY, hash(sub.endpoint), { endpoint: sub.endpoint, keys: sub.keys, userAgent: userAgent?.slice(0, 200), createdAt: existing?.createdAt ?? new Date().toISOString(), lastSuccessAt: existing?.lastSuccessAt, failures: 0 });
}

export async function removeSubscription(endpoint: string): Promise<void> {
  await kv().hdel(SUBS_KEY, hash(endpoint));
}

export async function getSendLog(limit = 30): Promise<SendLog[]> { return kv().lrange<SendLog>(LOG_KEY, 0, limit - 1); }

/** Envia para todas as inscrições; remove as expiradas (404/410) ou inválidas (403 após rotação de chave). */
export async function sendToAll(msg: PushMessage): Promise<SendLog> {
  const entry: SendLog = { at: new Date().toISOString(), title: msg.title, kind: msg.kind, sent: 0, failed: 0, removed: 0, errors: [] };
  if (!ensureVapid()) { entry.errors.push('VAPID não configurado'); await kv().lpush(LOG_KEY, entry, 100); return entry; }
  const subs = await listSubscriptions();
  if (subs.length === 0) { entry.errors.push('nenhuma inscrição'); await kv().lpush(LOG_KEY, entry, 100); return entry; }
  const payload = JSON.stringify({ title: msg.title, body: msg.body, url: msg.url ?? '/', tag: msg.tag, kind: msg.kind, at: entry.at });
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, payload, { TTL: 60 * 60, urgency: 'high' });
      entry.sent++;
      await kv().hset<StoredSubscription>(SUBS_KEY, hash(s.endpoint), { ...s, lastSuccessAt: new Date().toISOString(), failures: 0 });
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      entry.failed++;
      entry.errors.push(`${status ?? '?'}: ${errMsg(e).slice(0, 120)}`);
      if (status === 404 || status === 410 || status === 403) {
        await removeSubscription(s.endpoint); entry.removed++;
        log.warn('inscrição removida', { status, endpoint: s.endpoint.slice(0, 60) });
      } else {
        const failures = (s.failures ?? 0) + 1;
        if (failures >= 10) { await removeSubscription(s.endpoint); entry.removed++; }
        else await kv().hset<StoredSubscription>(SUBS_KEY, hash(s.endpoint), { ...s, failures });
      }
    }
  }));
  await kv().lpush(LOG_KEY, entry, 100);
  log.info('push enviado', { kind: msg.kind, sent: entry.sent, failed: entry.failed, removed: entry.removed });
  return entry;
}
