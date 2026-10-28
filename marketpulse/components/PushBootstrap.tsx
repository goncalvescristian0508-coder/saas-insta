'use client';
/** Registra o service worker e re-sincroniza a inscrição push existente com o servidor. */
import { useEffect } from 'react';

export function PushBootstrap() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).then(async (reg) => {
      if (!('pushManager' in reg)) return;
      const sub = await reg.pushManager.getSubscription().catch(() => null);
      if (!sub) return;
      const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      if (!json.endpoint || !json.keys?.p256dh) return;
      await fetch('/api/push/subscribe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(json) }).catch(() => {});
    }).catch(() => {});
  }, []);
  return null;
}
