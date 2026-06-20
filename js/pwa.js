/* =========================
   程式名稱：pwa.js
   功能說明：
   前端 PWA 控制程式。
   主要功能：
   1. 註冊 Service Worker
   2. 偵測系統是否有新版
   3. 有新版時顯示「重新整理」提示
   4. 使用者按下後重新載入新版
========================= */


/* =========================
   初始化 PWA
   功能說明：
   等頁面載入完成後，註冊 Service Worker。
========================= */
window.addEventListener('load', function() {
  registerServiceWorker();
});


/* =========================
   函式名稱：registerServiceWorker
   功能說明：
   註冊 sw.js，讓網站可以變成 PWA。
========================= */
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  navigator.serviceWorker.register('./sw.js').then(function(registration) {
    checkForServiceWorkerUpdate(registration);
  }).catch(function(error) {
    console.log('PWA 註冊失敗：', error);
  });

  listenForControllerChange();
}


/* =========================
   函式名稱：checkForServiceWorkerUpdate
   功能說明：
   檢查是否有新版 Service Worker。
   如果有新版，顯示更新提示。
========================= */
function checkForServiceWorkerUpdate(registration) {
  registration.addEventListener('updatefound', function() {
    const newWorker = registration.installing;

    if (!newWorker) {
      return;
    }

    newWorker.addEventListener('statechange', function() {
      if (
        newWorker.state === 'installed' &&
        navigator.serviceWorker.controller
      ) {
        showPwaUpdateBanner(registration);
      }
    });
  });
}


/* =========================
   函式名稱：showPwaUpdateBanner
   功能說明：
   顯示新版提示列。
   使用者點擊後，會啟用新版 Service Worker。
========================= */
function showPwaUpdateBanner(registration) {
  if (document.getElementById('pwaUpdateBanner')) {
    return;
  }

  const banner = document.createElement('div');
  banner.id = 'pwaUpdateBanner';
  banner.className = 'pwa-update-banner';

  banner.innerHTML = `
    <span>系統已有新版本</span>
    <button type="button" id="pwaUpdateBtn">重新整理</button>
  `;

  document.body.appendChild(banner);

  const updateBtn = document.getElementById('pwaUpdateBtn');

  if (updateBtn) {
    updateBtn.addEventListener('click', function() {
      if (registration.waiting) {
        registration.waiting.postMessage({
          type: 'SKIP_WAITING'
        });
      }
    });
  }
}


/* =========================
   函式名稱：listenForControllerChange
   功能說明：
   當新版 Service Worker 接管頁面後，自動重新載入頁面。
========================= */
function listenForControllerChange() {
  let refreshing = false;

  navigator.serviceWorker.addEventListener('controllerchange', function() {
    if (refreshing) {
      return;
    }

    refreshing = true;
    window.location.reload();
  });
}
