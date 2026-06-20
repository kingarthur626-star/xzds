/* =========================
   程式名稱：sw.js
   功能說明：
   PWA 的 Service Worker。
   主要功能：
   1. 快取前端靜態檔案，讓畫面載入更穩定
   2. 不快取 Apps Script API
   3. 不快取登入資料、道務資料、權限資料
   4. 支援系統改版後提示使用者重新整理
========================= */


/* =========================
   快取版本設定
   功能說明：
   每次 PWA 有重大更新時，請修改 CACHE_NAME。
   修改後，舊快取會被清除，使用者重新開啟後會載入新版。
========================= */
const CACHE_NAME = 'xzds-pwa-cache-20260620-035';


/* =========================
   前端靜態檔案清單
   功能說明：
   這裡只放 GitHub Pages 前端檔案。
   不要放 Apps Script Web App URL。
   不要放任何 API 資料網址。
========================= */
const STATIC_ASSETS = [
  './',
  './index.html',
  './register.html',
  './forgot.html',
  './home.html',
  './annual.html',
  './history.html',
  './admin.html',
  './manifest.json',

  './css/style.css',

  './images/login-top-logo.png',

  './js/config.js',
  './js/api.js',
  './js/common.js',
  './js/login.js',
  './js/register.js',
  './js/forgot.js',
  './js/home.js',
  './js/annual.js',
  './js/history.js',
  './js/admin.js',
  './js/pwa.js'
];


/* =========================
   安裝 Service Worker
   功能說明：
   第一次安裝 PWA 時，先把前端靜態檔案存進快取。
========================= */
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(STATIC_ASSETS);
    })
  );
});


/* =========================
   啟用 Service Worker
   功能說明：
   1. 啟用新版 Service Worker
   2. 清除舊版本快取
========================= */
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(cacheName) {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});


/* =========================
   攔截網路請求
   功能說明：
   只處理 GitHub Pages 自己的前端檔案。
   Apps Script API 是不同網域，不會被這裡快取。
========================= */
self.addEventListener('fetch', function(event) {
  const request = event.request;

  // 只處理 GET 請求
  if (request.method !== 'GET') {
    return;
  }

  const requestUrl = new URL(request.url);

  // 不快取外部網域，例如 Apps Script API
  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  // 頁面導覽使用 network first，盡量取得最新版 HTML
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  // 其他前端靜態檔案使用 cache first
  event.respondWith(cacheFirst(request));
});


/* =========================
   函式名稱：networkFirst
   功能說明：
   優先讀取網路最新版。
   如果網路失敗，才讀取快取。
========================= */
function networkFirst(request) {
  return caches.open(CACHE_NAME).then(function(cache) {
    return fetch(request).then(function(response) {
      if (response && response.ok) {
        cache.put(request, response.clone());
      }

      return response;
    }).catch(function() {
      return caches.match(request).then(function(cachedResponse) {
        return cachedResponse || caches.match('./index.html');
      });
    });
  });
}


/* =========================
   函式名稱：cacheFirst
   功能說明：
   優先讀取快取。
   如果快取沒有，才從網路取得。
   適合 CSS、JS、manifest 等前端檔案。
========================= */
function cacheFirst(request) {
  return caches.match(request).then(function(cachedResponse) {
    if (cachedResponse) {
      return cachedResponse;
    }

    return fetch(request).then(function(response) {
      if (!response || !response.ok) {
        return response;
      }

      const responseClone = response.clone();

      caches.open(CACHE_NAME).then(function(cache) {
        cache.put(request, responseClone);
      });

      return response;
    });
  });
}


/* =========================
   接收前端訊息
   功能說明：
   當前端偵測到新版時，使用者按下更新，
   前端會傳送 SKIP_WAITING，讓新版 Service Worker 立即啟用。
========================= */
self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});