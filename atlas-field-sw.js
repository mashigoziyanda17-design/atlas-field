/* ============================================================
   ATLAS FIELD — SERVICE WORKER
   Enables PWA installation and basic offline support
   File: atlas-field-sw.js
   Place this file in the SAME directory as atlas-field.html
   ============================================================ */

const CACHE_NAME    = 'atlas-field-v1';
const RUNTIME_CACHE = 'atlas-field-runtime-v1';

// Assets to cache on install (app shell)
const PRECACHE_ASSETS = [
  '/atlas-field.html',
  'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Inter:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap',
  'https://cdn.jsdelivr.net/npm/appwrite@17/dist/iife/sdk.js',
];

// ── Install: cache the app shell ─────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(PRECACHE_ASSETS).catch(err => {
        // Non-fatal: external resources may not cache in all environments
        console.warn('[ATLAS Field SW] Precache partial failure:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// ── Activate: clean up old caches ────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames =>
      Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME && name !== RUNTIME_CACHE)
          .map(name => caches.delete(name))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch strategy ────────────────────────────────────────────────
// Appwrite API calls: Network only (live data must be fresh)
// App shell & fonts: Cache first, fall back to network
// Everything else: Network first, fall back to cache
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Never intercept Appwrite API calls — always go to network
  if (url.hostname.includes('appwrite.io')) {
    return; // Let browser handle directly
  }

  // App shell: cache first
  if (url.pathname.endsWith('atlas-field.html') || url.pathname === '/') {
    event.respondWith(
      caches.match(event.request).then(cached => {
        const networkFetch = fetch(event.request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        });
        return cached || networkFetch;
      })
    );
    return;
  }

  // Static assets (fonts, CDN): cache first
  if (
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com') ||
    url.hostname.includes('cdn.jsdelivr.net')
  ) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(RUNTIME_CACHE).then(cache => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Default: network first, cache fallback
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok && event.request.method === 'GET') {
          const clone = response.clone();
          caches.open(RUNTIME_CACHE).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

// ── Push notifications ────────────────────────────────────────────
self.addEventListener('push', event => {
  if (!event.data) return;

  let data = {};
  try { data = event.data.json(); } catch(e) { data = { title: 'ATLAS Field', body: event.data.text() }; }

  const options = {
    body:    data.body  || 'You have a new notification.',
    icon:    data.icon  || '/atlas-field-icon-192.png',
    badge:   data.badge || '/atlas-field-badge-72.png',
    tag:     data.tag   || 'atlas-field-notif',
    data:    data.url   || '/',
    actions: data.actions || [],
    vibrate: [100, 50, 100],
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'ATLAS Field', options)
  );
});

// ── Notification click ────────────────────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data || '/atlas-field.html';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes('atlas-field') && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

console.log('[ATLAS Field SW] Service worker active ✓');
