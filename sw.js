/* =========================
   Program: sw.js
   Update: 2026-08-12 API Transport Stability v1.0.0R1
   Goals:
   1. Keep one canonical cache entry per path (ignore query-version duplication).
   2. Network-first for HTML/CSS/JS/JSON, with canonical cache fallback.
   3. Never substitute index.html for another page when a navigation fetch fails.
   4. Avoid apparent "logged out" jumps caused by offline/cache fallback.
========================= */
const CACHE_PREFIX = 'xzds-pwa-cache-';
const CACHE_NAME = CACHE_PREFIX + '20260812-api-transport-stability-100r1';

const STATIC_ASSETS = [
  './',
  './index.html',
  './home.html',
  './annual.html',
  './history.html',
  './mobile-share.html',
  './mobile-share-summary.html',
  './daily-data-update.html',
  './member-search.html',
  './duty-activity-list.html',
  './duty-activity-admin.html',
  './admin.html',
  './register.html',
  './forgot.html',
  './tao-mobile-update.html',
  './tao-mobile-update-oneclick.html',
  './api-diagnostic.html',
  './manifest.json',
  './css/style.css',
  './css/home-member-search.css',
  './css/mobile-share.css',
  './css/mobile-share-summary.css',
  './css/daily-data-update.css',
  './css/member-search.css',
  './js/config.js',
  './js/api.js',
  './js/common.js',
  './js/login.js',
  './js/register.js',
  './js/forgot.js',
  './js/home.js',
  './js/annual.js',
  './js/history.js',
  './js/mobile-share.js',
  './js/mobile-share-summary.js',
  './js/daily-data-update.js',
  './js/member-search.js',
  './js/qr-local.js',
  './js/duty-activity-list.js',
  './js/duty-activity-admin.js',
  './js/duty-activity-admin-r19.js',
  './js/admin.js',
  './js/tao-mobile-update.js',
  './js/tao-mobile-update-oneclick.js',
  './js/pwa.js',
  './images/login-top-logo.png',
  './icons/icon-192.png',
  './icons/icon-512.png'
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
          if (cacheName.indexOf(CACHE_PREFIX) === 0 && cacheName !== CACHE_NAME) {
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
    event.respondWith(networkFirst_(request, requestUrl));
    return;
  }

  event.respondWith(cacheFirst_(request, requestUrl));
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

function networkFirst_(request, requestUrl) {
  return caches.open(CACHE_NAME).then(function(cache) {
    const cacheKey = canonicalCacheKey_(requestUrl);

    return fetch(request, { cache: 'no-store' }).then(function(response) {
      if (response && response.ok) {
        cache.put(cacheKey, response.clone());
      }
      return response;
    }).catch(function() {
      return cache.match(cacheKey).then(function(cached) {
        if (cached) return cached;
        return offlineFallback_(request, requestUrl, cache);
      });
    });
  });
}

function cacheFirst_(request, requestUrl) {
  return caches.open(CACHE_NAME).then(function(cache) {
    const cacheKey = canonicalCacheKey_(requestUrl);

    return cache.match(cacheKey).then(function(cached) {
      if (cached) return cached;

      return fetch(request).then(function(response) {
        if (response && response.ok) {
          cache.put(cacheKey, response.clone());
        }
        return response;
      });
    });
  });
}

function canonicalCacheKey_(requestUrl) {
  const url = new URL(requestUrl.toString());
  url.search = '';
  url.hash = '';
  return url.toString();
}

function offlineFallback_(request, requestUrl, cache) {
  if (request.mode !== 'navigate') {
    return Response.error();
  }

  const path = requestUrl.pathname.toLowerCase();
  const isLoginNavigation =
    path.endsWith('/') ||
    path.endsWith('/index.html');

  if (isLoginNavigation) {
    return cache.match(canonicalCacheKey_(new URL('./index.html', self.location.href)))
      .then(function(cachedIndex) {
        return cachedIndex || buildOfflinePage_();
      });
  }

  // 重要：其他功能頁載入失敗時，不可偷換成 index.html，否則看起來像被登出。
  return buildOfflinePage_();
}

function buildOfflinePage_() {
  const html = [
    '<!doctype html>',
    '<html lang="zh-Hant">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">',
    '<title>連線暫時不穩定</title>',
    '<style>',
    'body{margin:0;background:#f5f7fb;color:#174869;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans TC",sans-serif}',
    '.box{max-width:520px;margin:18vh auto 0;padding:28px}',
    '.card{background:#fff;border:1px solid #dbe5ef;border-radius:20px;padding:24px;box-shadow:0 8px 28px rgba(20,60,95,.08)}',
    'h1{font-size:24px;margin:0 0 12px}p{line-height:1.7;color:#667f95}',
    'button{border:0;border-radius:12px;background:#2f80ed;color:#fff;font-size:18px;font-weight:700;padding:12px 20px}',
    '</style>',
    '</head>',
    '<body><div class="box"><div class="card">',
    '<h1>連線暫時不穩定</h1>',
    '<p>目前無法載入這個頁面。登入狀態沒有被清除，請稍後重新整理。</p>',
    '<button onclick="location.reload()">重新整理</button>',
    '</div></div></body></html>'
  ].join('');

  return new Response(html, {
    status: 503,
    statusText: 'Offline',
    headers: {
      'Content-Type': 'text/html; charset=UTF-8',
      'Cache-Control': 'no-store'
    }
  });
}

async function precacheAvailableAssets_() {
  const cache = await caches.open(CACHE_NAME);

  await Promise.all(
    STATIC_ASSETS.map(async function(asset) {
      try {
        const response = await fetch(asset, { cache: 'no-store' });
        if (!response || !response.ok) return;

        const url = new URL(asset, self.location.href);
        await cache.put(canonicalCacheKey_(url), response.clone());
      } catch (error) {
        // 單一資源不存在或網路暫時失敗時，不阻擋新 Service Worker 啟用。
      }
    })
  );
}
