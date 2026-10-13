'use client';
/**
 * Preferências no LocalStorage (restauradas automaticamente) + sincronização com o servidor.
 * Implementado como "external store" para evitar setState em efeitos e problemas de hidratação.
 */
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { DEFAULT_PREFS, sanitizePrefs, type Preferences } from '../prefs/types';

const KEY = 'mp:prefs';
type Snap = { prefs: Preferences; ready: boolean; syncing: boolean; syncError: string | null };
const SERVER_SNAP: Snap = { prefs: DEFAULT_PREFS, ready: false, syncing: false, syncError: null };
let snap: Snap | null = null;
const listeners = new Set<() => void>();

function loadLocal(): Preferences {
  try { const raw = localStorage.getItem(KEY); return raw ? sanitizePrefs(JSON.parse(raw)) : DEFAULT_PREFS; } catch { return DEFAULT_PREFS; }
}
function persist(p: Preferences) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* ignore */ } }
function emit() { for (const l of listeners) l(); }
function update(patch: Partial<Snap>) { snap = { ...(snap ?? SERVER_SNAP), ...patch }; emit(); }
function getSnapshot(): Snap {
  if (!snap) { const prefs = loadLocal(); snap = { prefs, ready: true, syncing: false, syncError: null }; applyTheme(prefs.theme); }
  return snap;
}
function subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }

export function applyTheme(theme: Preferences['theme']) {
  if (typeof document === 'undefined') return;
  const t = theme === 'system' ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : theme;
  document.documentElement.setAttribute('data-theme', t);
}

let serverChecked = false;
/** Compara com o servidor uma vez por sessão: adota a versão mais nova e envia a local se for mais recente. */
async function reconcileWithServer() {
  if (serverChecked) return; serverChecked = true;
  try {
    const r = await fetch('/api/prefs', { cache: 'no-store' });
    if (!r.ok) return;
    const j = await r.json();
    if (!j?.prefs) return;
    const server = sanitizePrefs(j.prefs);
    const local = getSnapshot().prefs;
    if (new Date(server.updatedAt).getTime() > new Date(local.updatedAt).getTime()) { persist(server); applyTheme(server.theme); update({ prefs: server }); }
    else if (local.updatedAt !== server.updatedAt) await fetch('/api/prefs', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(local) });
  } catch { /* offline: fica com o local */ }
}

export function usePrefs() {
  const s = useSyncExternalStore(subscribe, getSnapshot, () => SERVER_SNAP);
  useEffect(() => { void reconcileWithServer(); }, []);
  const save = useCallback(async (patch: Partial<Preferences>) => {
    const next = sanitizePrefs({ ...getSnapshot().prefs, ...patch, updatedAt: new Date().toISOString() });
    persist(next); applyTheme(next.theme);
    update({ prefs: next, syncing: true, syncError: null });
    try {
      const res = await fetch('/api/prefs', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(next) });
      update({ syncing: false, syncError: res.ok ? null : 'Falha ao sincronizar com o servidor (os alertas usam a versão do servidor).' });
    } catch { update({ syncing: false, syncError: 'Sem conexão: preferências salvas localmente; sincronizarão depois.' }); }
    return next;
  }, []);
  return { prefs: s.prefs, ready: s.ready, save, syncing: s.syncing, syncError: s.syncError };
}
