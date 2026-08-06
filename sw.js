/* =========================
   Program: sw.js
   Update: 2026-08-06 Mobile Share v1.0.0R6
   Purpose:
   1. Keep HTML, CSS and JavaScript fresh by using network first.
   2. Keep a local fallback for temporary offline use.
   3. Never cache external Apps Script API requests.
   4. Activate a new version immediately and remove old XZDS caches.
========================= */
const CACHE_PREFIX = 'xzds-pwa-cache-';
const CACHE_NAME = CACHE_PREFIX + '20260806-mobile-share-100r6';
const STATIC_ASSETS = [
  './',
  './index.html',
  './home.html',
  './annual.html',
  './history.html',
  './mobile-share.html',
  './tao-mobile-update.html',
  './duty-activity-list.html',
  './duty-activity-admin.html',
  './manifest.json',
  './css/style.css',
  './css/mobile-share.css',
  './js/config.js',
  './js/api.js',
  './js/common.js',
  './js/home.js',
  './js/annual.js',
  './js/history.js',
  './js/mobile-share.js',
  './js/tao-mobile-update.js',
  './js/duty-activity-list.js',
  './js/duty-activity-admin.js',
  './js/duty-activity-admin-r19.js',
  './js/pwa.js'
];
self.addEventListener('install', function(event) {
  event.waitUntil(
    precacheAvailableAssets_().then(function() {
      return self.skipWaiting();
    })
  );
});
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(cacheName) {
          if (
            cacheName.indexOf(CACHE_PREFIX) === 0 &&
            cacheName !== CACHE_NAME
          ) {
            return caches.delete(cacheName);
          }
          return Promise.resolve(false);
        })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});
self.addEventListener('fetch', function(event) {
  const request = event.request;
  if (request.method !== 'GET') return;
  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== self.location.origin) return;

  if (isFreshnessCriticalRequest_(request, requestUrl)) {
    event.respondWith(networkFirst_(request));
    return;
  }

  event.respondWith(cacheFirst_(request));
});
self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
function isFreshnessCriticalRequest_(request, requestUrl) {
  if (request.mode === 'navigate') return true;
  const path = requestUrl.pathname.toLowerCase();
  return (
    path.endsWith('.html') ||
    path.endsWith('.css') ||
    path.endsWith('.js') ||
    path.endsWith('.json')
  );
}
function networkFirst_(request) {
  return caches.open(CACHE_NAME).then(function(cache) {
    return fetch(request, { cache: 'no-store' }).then(function(response) {
      if (response && response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    }).catch(function() {
      return cache.match(request, { ignoreSearch: true }).then(function(cached) {
        if (cached) return cached;
        if (request.mode === 'navigate') {
          return cache.match('./index.html', { ignoreSearch: true });
        }
        return Response.error();
      });
    });
  });
}
function cacheFirst_(request) {
  return caches.open(CACHE_NAME).then(function(cache) {
    return cache.match(request, { ignoreSearch: true }).then(function(cached) {
      if (cached) return cached;
      return fetch(request).then(function(response) {
        if (response && response.ok) {
          cache.put(request, response.clone());
        }
        return response;
      });
    });
  });
}
async function precacheAvailableAssets_() {
  const cache = await caches.open(CACHE_NAME);
  await Promise.all(
    STATIC_ASSETS.map(async function(asset) {
      try {
        const response = await fetch(asset, { cache: 'no-store' });
        if (response && response.ok) {
          await cache.put(asset, response.clone());
        }
      } catch (error) {
        // A single missing asset must not block Service Worker installation.
      }
    })
  );
}
