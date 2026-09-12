/**
 * AI Daily — Service Worker
 * Enables PWA install + handles incoming Share Target requests
 */
const CACHE = 'ai-daily-v1';
const ASSETS = [
  '/wise-ai-daily/',
  '/wise-ai-daily/index.html',
  '/wise-ai-daily/app.js',
  '/wise-ai-daily/styles.css',
  '/wise-ai-daily/manifest.json',
  '/wise-ai-daily/icons/icon-192.png',
  '/wise-ai-daily/icons/icon-512.png',
];

// Install: cache core assets
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

// Activate: clear old caches
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

// Fetch: serve from cache, fall back to network
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // ── Handle Share Target GET requests ─────────────────────────
  // When user taps "AI Daily" in iPhone share sheet, iOS opens:
  // /wise-ai-daily/share?url=https://...&title=...&text=...
  if (url.pathname === '/wise-ai-daily/share') {
    e.respondWith((async () => {
      const sharedUrl   = url.searchParams.get('url')   || '';
      const sharedText  = url.searchParams.get('text')  || '';
      const sharedTitle = url.searchParams.get('title') || '';
      // Extract URL from text if not in url param (some apps put it in text)
      const extracted = sharedUrl || sharedText.match(/https?:\/\/[^\s]+/)?.[0] || '';

      // Store the shared URL for the app to pick up
      const clients = await self.clients.matchAll({ type: 'window' });
      for (const client of clients) {
        client.postMessage({ type: 'SHARE_RECEIVED', url: extracted, title: sharedTitle });
      }

      // Redirect to main app — it will read the pending share
      const cache = await caches.open(CACHE);
      const cached = await cache.match('/wise-ai-daily/index.html');
      // Pass shared URL as hash so the page can read it
      const response = await fetch('/wise-ai-daily/index.html');
      return response || cached;
    })());
    return;
  }

  // Cache-first for local assets, network-first for API calls
  if (url.origin === self.location.origin) {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
  }
});

// Message from page: cache updated assets
self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});
