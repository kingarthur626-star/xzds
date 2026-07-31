/* =========================
   Program: pwa.js
   Update: 2026-08-01 V5
   Purpose:
   1. Register Service Worker without HTTP cache.
   2. Check for updates immediately.
   3. Activate the new worker automatically.
   4. Reload once after the new worker takes control.
========================= */

const XZDS_PWA_VERSION = '20260801-5';

window.addEventListener('load', function() {
  registerServiceWorker();
});

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  try {
    const registration = await navigator.serviceWorker.register(
      './sw.js?v=' + encodeURIComponent(XZDS_PWA_VERSION),
      {
        scope: './',
        updateViaCache: 'none'
      }
    );

    listenForControllerChange();
    listenForServiceWorkerUpdate_(registration);

    if (registration.waiting) {
      activateWaitingWorker_(registration);
    }

    try {
      await registration.update();
    } catch (updateError) {
      console.log('PWA update check failed:', updateError);
    }
  } catch (error) {
    console.log('PWA registration failed:', error);
  }
}

function listenForServiceWorkerUpdate_(registration) {
  registration.addEventListener('updatefound', function() {
    const newWorker = registration.installing;
    if (!newWorker) return;

    newWorker.addEventListener('statechange', function() {
      if (newWorker.state === 'installed') {
        activateWaitingWorker_(registration);
      }
    });
  });
}

function activateWaitingWorker_(registration) {
  if (!registration.waiting) return;

  registration.waiting.postMessage({
    type: 'SKIP_WAITING'
  });
}

function listenForControllerChange() {
  let refreshing = false;

  navigator.serviceWorker.addEventListener('controllerchange', function() {
    if (refreshing) return;

    refreshing = true;
    window.location.reload();
  });
}
