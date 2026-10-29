// Service worker for PWA installability with Network-First caching
// This ensures that when code updates are pushed, users always get the freshest version.

const CACHE = 'riva-v2';
const PRECACHE = ['/manifest.json', '/icon-192.png', '/icon-512.png'];

// Install: precache offline branding assets and skip waiting immediately
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE).catch(() => undefined))
  );
});

// Activate: clean up old cache versions immediately and claim all clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Allow clients to trigger immediate update activation
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Never intercept cross-origin traffic (YouTube streams, artwork proxy, lyrics APIs)
  if (url.origin !== self.location.origin) return;

  // API calls: Network only (never cache API calls in service worker)
  if (url.pathname.startsWith('/api/')) return;

  // HTML page navigations: Network-first, fallback to cache
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match('/manifest.json')))
    );
    return;
  }

  // Next.js hashed static assets (/ _next/static/...):
  // Since Next.js uses unique content hashes in filenames (e.g. app-abc123.js),
  // stale-while-revalidate / cache-first with network fallback is safe.
  // BUT for root or unhashed assets (icons, manifest), use Network-First so updates reflect immediately.
  const isHashedAsset = url.pathname.startsWith('/_next/static/');

  if (isHashedAsset) {
    event.respondWith(
      caches.match(req).then((hit) => {
        if (hit) return hit;
        return fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        });
      })
    );
    return;
  }

  // All other same-origin requests (manifest, images, etc.):
  // Network-First strategy to ensure updates reflect immediately without hard refresh
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req))
  );
});
