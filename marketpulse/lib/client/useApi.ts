'use client';
/** Hook de dados simples: fetch + polling + estado de erro/stale. Sem dependências externas. */
import { useCallback, useEffect, useRef, useState } from 'react';

export interface ApiState<T> { data: T | null; error: string | null; loading: boolean; fetchedAt: number | null; refresh: () => Promise<void> }

interface Box<T> { url: string | null; data: T | null; error: string | null; fetchedAt: number | null }

export function useApi<T>(url: string | null, opts?: { intervalMs?: number; enabled?: boolean }): ApiState<T> {
  const [box, setBox] = useState<Box<T>>({ url: null, data: null, error: null, fetchedAt: null });
  const alive = useRef(true);
  const enabled = opts?.enabled !== false;

  const refresh = useCallback(async () => {
    if (!url) return;
    try {
      const res = await fetch(url, { cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (!alive.current) return;
      if (!res.ok) setBox((b) => ({ ...b, url, error: json?.error ?? `HTTP ${res.status}` }));
      else setBox({ url, data: json as T, error: null, fetchedAt: Date.now() });
    } catch (e) {
      if (alive.current) setBox((b) => ({ ...b, url, error: e instanceof Error ? e.message : 'falha de rede' }));
    }
  }, [url]);

  useEffect(() => {
    alive.current = true;
    if (!url || !enabled) return;
    void refresh();
    let timer: ReturnType<typeof setInterval> | undefined;
    if (opts?.intervalMs) timer = setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, opts.intervalMs);
    const onVis = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { alive.current = false; if (timer) clearInterval(timer); document.removeEventListener('visibilitychange', onVis); };
  }, [url, opts?.intervalMs, enabled, refresh]);

  // "loading" = ainda não recebemos resposta (dado ou erro) para a URL atual
  const loading = Boolean(url) && enabled && box.url !== url;
  return { data: box.data, error: box.url === url ? box.error : null, loading, fetchedAt: box.fetchedAt, refresh };
}

export async function postJson<T>(url: string, body?: unknown, method = 'POST'): Promise<{ ok: boolean; data: T | null; error?: string; status: number }> {
  try {
    const res = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok, data: res.ok ? (json as T) : null, error: res.ok ? undefined : (json?.error ?? `HTTP ${res.status}`), status: res.status };
  } catch (e) { return { ok: false, data: null, error: e instanceof Error ? e.message : 'falha de rede', status: 0 }; }
}
