/**
 * AI Daily — Service Worker
 * Enables PWA install + handles incoming Share Target requests
 * Network-first strategy for code assets to prevent stale cache lockups
 */
const CACHE = 'ai-daily-v10';
const ASSETS = [
  '/wise-ai-daily/',
  '/wise-ai-daily/index.html',
  '/wise-ai-daily/app.js',
  '/wise-ai-daily/styles.css',
  '/wise-ai-daily/manifest.json',
  '/wise-ai-daily/icons/icon-192.png',
  '/wise-ai-daily/icons/icon-512.png',
];

// Install: cache core assets and activate immediately
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

// Activate: delete ALL old caches immediately and claim clients
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: Network-first for code assets, cache fallback when offline
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // ── Handle Share Target GET requests ─────────────────────────
  if (url.pathname === '/wise-ai-daily/share') {
    e.respondWith((async () => {
      const sharedUrl   = url.searchParams.get('url')   || '';
      const sharedText  = url.searchParams.get('text')  || '';
      const sharedTitle = url.searchParams.get('title') || '';
      const extracted = sharedUrl || sharedText.match(/https?:\/\/[^\s]+/)?.[0] || '';

      const clients = await self.clients.matchAll({ type: 'window' });
      for (const client of clients) {
        client.postMessage({ type: 'SHARE_RECEIVED', url: extracted, title: sharedTitle });
      }

      const response = await fetch('/wise-ai-daily/index.html').catch(() => null);
      if (response) return response;
      const cache = await caches.open(CACHE);
      return cache.match('/wise-ai-daily/index.html');
    })());
    return;
  }

  // Network-first for app code assets so updates deploy immediately
  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(e.request)
        .then(response => {
          if (response && response.status === 200 && e.request.method === 'GET') {
            const clone = response.clone();
            caches.open(CACHE).then(cache => cache.put(e.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }
});

// Message from page: skip waiting
self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});
