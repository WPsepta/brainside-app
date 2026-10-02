/* ═══════════════════════════════════════════════════════════════
   Brain Side — Service Worker (v4)
   Cache app shell biar bisa offline & installable sebagai PWA
   ═══════════════════════════════════════════════════════════════ */

const CACHE_NAME = 'brain-side-v8';

/* File yang di-cache saat install (app shell) */
const PRECACHE_URLS = [
  './',
  './index.html',
  './chat.html',
  './profile.html',
  './login.html',
  './files.html',
  './images.html',
  './glass.css',
  './theme.js',
  './ai-models.js',
  './chat-render.js',
  './firebase-config.js',
  './manifest.json'
];

/* ⭐ Install — cache app shell */
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await Promise.all(
        PRECACHE_URLS.map(async (url) => {
          try {
            await cache.add(new Request(url, { cache: 'reload' }));
          } catch (e) {
            console.warn('[SW] Gagal cache:', url, e);
          }
        })
      );
      await self.skipWaiting();
    })()
  );
});

/* ⭐ Activate — hapus cache versi lama */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      );
      await self.clients.claim();
    })()
  );
});

/* ⭐ Fetch — strategi:
   - HTML: network-first (fallback ke cache)
   - Asset: cache-first (update di background)
   - Firebase/CDN: skip (biar browser handle sendiri)
   - Pakai { ignoreSearch: true } biar request dengan ?v=22 tetap match cache. */
self.addEventListener('fetch', (event) => {
  const req = event.request;

  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Skip cross-origin (Firebase, CDN, dll)
  if (url.origin !== self.location.origin) {
    return;
  }

  // Skip request ke Firestore/Firebase auth
  if (url.hostname.includes('firebase') || url.hostname.includes('googleapis')) {
    return;
  }

  // Network-first untuk HTML
  if (req.headers.get('accept')?.includes('text/html') || url.pathname.endsWith('.html') || url.pathname === '/') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(CACHE_NAME);
          cache.put(req, fresh.clone()).catch(() => {});
          return fresh;
        } catch (e) {
          const cached = await caches.match(req, { ignoreSearch: true });
          if (cached) return cached;
          const fallback = await caches.match('./chat.html', { ignoreSearch: true });
          if (fallback) return fallback;
          return new Response('Offline', { status: 503, statusText: 'Offline' });
        }
      })()
    );
    return;
  }

  // Cache-first untuk asset (CSS, JS, gambar)
  event.respondWith(
    (async () => {
      const cached = await caches.match(req, { ignoreSearch: true });
      if (cached) {
        fetch(req).then((fresh) => {
          if (fresh && fresh.status === 200) {
            caches.open(CACHE_NAME).then((c) => c.put(req, fresh)).catch(() => {});
          }
        }).catch(() => {});
        return cached;
      }
      try {
        const fresh = await fetch(req);
        if (fresh && fresh.status === 200) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(req, fresh.clone()).catch(() => {});
        }
        return fresh;
      } catch (e) {
        return new Response('', { status: 503, statusText: 'Offline' });
      }
    })()
  );
});

/* ⭐ Message handler — manual update & clear cache */
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (data.type === 'CLEAR_CACHE') {
    caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))));
  }
});