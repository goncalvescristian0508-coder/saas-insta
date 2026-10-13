/* MarketPulse Service Worker — push, clique na notificação e shell offline mínimo. */
const CACHE = 'mp-shell-v1';
const OFFLINE_URL = '/offline';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll([OFFLINE_URL, '/icons/icon-192.png']).catch(() => {})));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// Navegações: rede primeiro; se offline, página de fallback. APIs nunca são cacheadas aqui.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || req.mode !== 'navigate') return;
  event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL).then((r) => r || new Response('Offline', { status: 503 }))));
});

self.addEventListener('push', (event) => {
  let data = { title: 'MarketPulse', body: '', url: '/' };
  try { if (event.data) data = { ...data, ...event.data.json() }; } catch { data.body = event.data ? event.data.text() : ''; }
  const options = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-96.png',
    tag: data.tag || undefined,
    renotify: Boolean(data.tag),
    data: { url: data.url || '/', kind: data.kind, at: data.at },
    timestamp: data.at ? Date.parse(data.at) : Date.now(),
  };
  event.waitUntil(self.registration.showNotification(data.title || 'MarketPulse', options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const client of list) {
      if (client.url.startsWith(self.location.origin) && 'focus' in client) { client.navigate(url); return client.focus(); }
    }
    return self.clients.openWindow(url);
  }));
});

// Alguns navegadores avisam quando a inscrição muda; tentamos re-sincronizar com o servidor.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil((async () => {
    try {
      const res = await fetch('/api/push/vapid-key');
      if (!res.ok) return;
      const { publicKey } = await res.json();
      const sub = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: publicKey });
      await fetch('/api/push/subscribe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(sub.toJSON()) });
    } catch { /* o app re-sincroniza na próxima abertura */ }
  })());
});
