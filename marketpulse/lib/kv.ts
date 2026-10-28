/**
 * Armazenamento persistente mínimo (Upstash Redis via REST).
 * Em desenvolvimento sem credenciais, usa memória (não persiste entre deploys/instâncias).
 */
import 'server-only';
import { Redis } from '@upstash/redis';
import { config } from './config';
import { logger } from './logger';

const log = logger('kv');

export interface KV {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSec?: number): Promise<void>;
  /** Define apenas se não existir. Retorna true se gravou. */
  setnx(key: string, value: string, ttlSec: number): Promise<boolean>;
  del(key: string): Promise<void>;
  incr(key: string, ttlSec?: number): Promise<number>;
  lpush<T>(key: string, value: T, maxLen?: number): Promise<void>;
  lrange<T>(key: string, start: number, stop: number): Promise<T[]>;
  lset<T>(key: string, items: T[]): Promise<void>;
  hgetall<T>(key: string): Promise<Record<string, T>>;
  hset<T>(key: string, field: string, value: T): Promise<void>;
  hdel(key: string, field: string): Promise<void>;
  kind: 'redis' | 'memory';
}

class MemoryKV implements KV {
  kind = 'memory' as const;
  private store = new Map<string, { v: unknown; exp?: number }>();
  private alive(key: string) {
    const e = this.store.get(key);
    if (!e) return undefined;
    if (e.exp && e.exp < Date.now()) { this.store.delete(key); return undefined; }
    return e;
  }
  async get<T>(key: string) { const e = this.alive(key); return (e?.v as T) ?? null; }
  async set<T>(key: string, value: T, ttlSec?: number) { this.store.set(key, { v: value, exp: ttlSec ? Date.now() + ttlSec * 1000 : undefined }); }
  async setnx(key: string, value: string, ttlSec: number) { if (this.alive(key)) return false; await this.set(key, value, ttlSec); return true; }
  async del(key: string) { this.store.delete(key); }
  async incr(key: string, ttlSec?: number) { const e = this.alive(key); const n = ((e?.v as number) ?? 0) + 1; this.store.set(key, { v: n, exp: e?.exp ?? (ttlSec ? Date.now() + ttlSec * 1000 : undefined) }); return n; }
  async lpush<T>(key: string, value: T, maxLen?: number) { const e = this.alive(key); const arr = [(value), ...((e?.v as T[]) ?? [])]; this.store.set(key, { v: maxLen ? arr.slice(0, maxLen) : arr }); }
  async lrange<T>(key: string, start: number, stop: number) { const arr = ((this.alive(key)?.v as T[]) ?? []); return arr.slice(start, stop === -1 ? undefined : stop + 1); }
  async lset<T>(key: string, items: T[]) { this.store.set(key, { v: items }); }
  async hgetall<T>(key: string) { return ((this.alive(key)?.v as Record<string, T>) ?? {}); }
  async hset<T>(key: string, field: string, value: T) { const h = { ...(await this.hgetall<T>(key)), [field]: value }; this.store.set(key, { v: h }); }
  async hdel(key: string, field: string) { const h = await this.hgetall(key); delete h[field]; this.store.set(key, { v: h }); }
}

class RedisKV implements KV {
  kind = 'redis' as const;
  constructor(private r: Redis) {}
  async get<T>(key: string) { return (await this.r.get<T>(key)) ?? null; }
  async set<T>(key: string, value: T, ttlSec?: number) { if (ttlSec) await this.r.set(key, value, { ex: ttlSec }); else await this.r.set(key, value); }
  async setnx(key: string, value: string, ttlSec: number) { const res = await this.r.set(key, value, { nx: true, ex: ttlSec }); return res === 'OK'; }
  async del(key: string) { await this.r.del(key); }
  async incr(key: string, ttlSec?: number) { const n = await this.r.incr(key); if (ttlSec && n === 1) await this.r.expire(key, ttlSec); return n; }
  async lpush<T>(key: string, value: T, maxLen?: number) { await this.r.lpush(key, value); if (maxLen) await this.r.ltrim(key, 0, maxLen - 1); }
  async lrange<T>(key: string, start: number, stop: number) { return (await this.r.lrange<T>(key, start, stop)) ?? []; }
  async lset<T>(key: string, items: T[]) { await this.r.del(key); if (items.length) await this.r.rpush(key, ...(items as unknown[])); }
  async hgetall<T>(key: string) { return ((await this.r.hgetall<Record<string, T>>(key)) ?? {}); }
  async hset<T>(key: string, field: string, value: T) { await this.r.hset(key, { [field]: value }); }
  async hdel(key: string, field: string) { await this.r.hdel(key, field); }
}

declare global {
  var __mpKv: KV | undefined;
}

export function kv(): KV {
  if (globalThis.__mpKv) return globalThis.__mpKv;
  if (config.kv.url && config.kv.token) {
    globalThis.__mpKv = new RedisKV(new Redis({ url: config.kv.url, token: config.kv.token }));
  } else {
    if (process.env.NODE_ENV === 'production') log.warn('Sem UPSTASH_REDIS_REST_URL/TOKEN: usando memória volátil. Configure Redis para produção.');
    globalThis.__mpKv = new MemoryKV();
  }
  return globalThis.__mpKv;
}

/** Cache simples com TTL + fallback "stale": retorna o valor antigo se o fetch falhar. */
export async function cached<T>(key: string, ttlSec: number, fetcher: () => Promise<T>, opts?: { staleTtlSec?: number }): Promise<{ data: T; fetchedAt: string; stale: boolean; error?: string }> {
  type Entry = { data: T; fetchedAt: string };
  const store = kv();
  const fresh = await store.get<Entry>(`cache:${key}`);
  if (fresh) return { ...fresh, stale: false };
  try {
    const data = await fetcher();
    const entry: Entry = { data, fetchedAt: new Date().toISOString() };
    await store.set(`cache:${key}`, entry, ttlSec);
    await store.set(`stale:${key}`, entry, opts?.staleTtlSec ?? 24 * 3600);
    return { ...entry, stale: false };
  } catch (e) {
    const old = await store.get<Entry>(`stale:${key}`);
    const message = e instanceof Error ? e.message : String(e);
    if (old) { log.warn('fetch falhou, servindo stale', { key, message }); return { ...old, stale: true, error: message }; }
    throw e;
  }
}
