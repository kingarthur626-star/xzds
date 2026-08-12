/* =========================
程式名稱：api.js
版本：v0.3.2R2
功能說明：
1. 以 JSONP 呼叫 Google Apps Script Web App。
2. 保留既有 callApi(payload, options) 相容性。
3. 讀取型 API 遇到 timeout / network / JSONP callback 缺失時，自動重試 1 次。
4. 寫入型 API 不自動重送，避免重複寫入或重複排程。
5. AUTH_REQUIRED 對安全讀取先再確認 1 次，只有連續確認失效才清除 Session 並回登入頁。
6. 提供 warmUpApiTransport()，登入前先以公開 test API 暖機，降低第一筆請求失敗。
7. 每次 JSONP 都使用全新 callback 與 cache-buster，避免舊 callback / 中介快取干擾。
========================= */

const XZDS_API_BUILD = 'v0.3.2R2';
const XZDS_API_DEFAULT_TIMEOUT_MS = 12000;
const XZDS_API_DEFAULT_RETRY_TIMEOUT_MS = 15000;
const XZDS_API_RETRY_DELAY_MS = 250;
const XZDS_API_TRANSPORT_OK_KEY = 'XZDS_API_TRANSPORT_OK_AT';
const XZDS_API_TRANSPORT_OK_TTL_MS = 120000;

const XZDS_API_PUBLIC_ACTIONS = [
  'test',
  'getCaptcha',
  'login',
  'getTemples',
  'register',
  'registerAccount',
  'resetPassword'
];

/*
 * 只有「重送不會造成正式資料重複寫入」的 action 才能放在這裡。
 * login 可能建立新的 Session，但重送只會留下未使用的舊 Session，
 * 不會修改正式業務資料；配合登入前 warm-up 可大幅降低實際重送機率。
 */
const XZDS_API_RETRYABLE_ACTIONS = [
  'test',
  'getCaptcha',
  'login',
  'getTemples',
  'getAllTemples',
  'getMyPermissions',
  'getTaoReportLastUpdate',
  'getAnnualStats',
  'getRecentDutyStats',
  'getDutyActivityList',
  'getDutyActivityAdminData',
  'getMobileShareReport',
  'taoMemberSearch',
  'taoMemberGetDetail',
  'taoDailyUpdateGetStatus',
  'taoDailyUpdateGetHistory',
  'taoDailyUpdateGetDetail',
  'taoMobileGetStatus',
  'adminGetAccounts'
];

/*
 * 純讀取型 API 預設允許最多 3 次傳輸嘗試。
 * 依 2026/08/12 實機診斷：最輕量 test API 在桌機與 iPhone 都會偶發
 * JSONP/ContentService 回傳遺失；單次重試仍不足以支撐一次需要多筆讀取的頁面。
 * login 仍維持最多 2 次，避免產生過多未使用 Session。
 */
const XZDS_API_THREE_ATTEMPT_ACTIONS = [
  'test',
  'getCaptcha',
  'getTemples',
  'getAllTemples',
  'getMyPermissions',
  'getTaoReportLastUpdate',
  'getAnnualStats',
  'getRecentDutyStats',
  'getDutyActivityList',
  'getDutyActivityAdminData',
  'getMobileShareReport',
  'taoMemberSearch',
  'taoMemberGetDetail',
  'taoDailyUpdateGetStatus',
  'taoDailyUpdateGetHistory',
  'taoDailyUpdateGetDetail',
  'taoMobileGetStatus',
  'adminGetAccounts'
];

let xzdsApiWarmupPromise_ = null;

function callApi(payload, options) {
  const basePayload = addTokenToPayload(payload || {});
  const normalizedOptions = normalizeApiOptions_(basePayload, options || {});

  return callApiWithRetry_(basePayload, normalizedOptions);
}

async function callApiWithRetry_(basePayload, options) {
  const action = String(basePayload.action || '').trim();
  let lastError = null;

  for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
    const attemptTimeoutMs = attempt === 1
      ? options.timeoutMs
      : options.retryTimeoutMs;

    try {
      const result = await callApiOnce_(basePayload, {
        timeoutMs: attemptTimeoutMs,
        timeoutMessage: options.timeoutMessage,
        attempt: attempt
      });

      markApiTransportOk_();

      if (result && result.code === 'AUTH_REQUIRED') {
        if (options.noAuthRedirect) {
          return result;
        }

        if (
          attempt < options.maxAttempts &&
          isApiRetryableAction_(action)
        ) {
          notifyApiRetry_({
            action: action,
            attempt: attempt,
            nextAttempt: attempt + 1,
            reason: 'AUTH_REQUIRED'
          }, options);
          await delayApiRetry_(XZDS_API_RETRY_DELAY_MS);
          continue;
        }

        const authError = new Error(result.message || '登入逾時，請重新登入');
        authError.code = 'AUTH_REQUIRED';
        authError.result = result;
        handleApiAuthRequired_(result);
        throw authError;
      }

      return result;

    } catch (error) {
      lastError = error;

      if (
        attempt < options.maxAttempts &&
        isRetryableApiTransportError_(error)
      ) {
        notifyApiRetry_({
          action: action,
          attempt: attempt,
          nextAttempt: attempt + 1,
          reason: String(error.code || 'API_TRANSPORT_ERROR')
        }, options);
        await delayApiRetry_(XZDS_API_RETRY_DELAY_MS);
        continue;
      }

      if (error && typeof error === 'object') {
        error.attempts = attempt;
      }
      throw error;
    }
  }

  throw lastError || new Error('API 呼叫失敗');
}

function callApiOnce_(basePayload, options) {
  return new Promise(function(resolve, reject) {
    const callbackName =
      'jsonpCallback_' +
      Date.now() +
      '_' +
      Math.floor(Math.random() * 1000000) +
      '_' +
      Number(options.attempt || 1);

    const payload = Object.assign({}, basePayload, {
      callback: callbackName,
      _xzdsAttempt: String(options.attempt || 1),
      _xzdsTs: String(Date.now())
    });

    const params = new URLSearchParams();

    Object.keys(payload).forEach(function(key) {
      if (payload[key] !== undefined && payload[key] !== null) {
        params.append(key, payload[key]);
      }
    });

    const script = document.createElement('script');
    script.async = true;
    script.charset = 'UTF-8';
    script.src = GAS_URL + '?' + params.toString();

    let settled = false;

    const timer = setTimeout(function() {
      const error = new Error(
        options.timeoutMessage || '系統回應較慢，請稍後再確認狀態'
      );
      error.code = 'API_TIMEOUT';
      error.isTimeout = true;
      error.timeoutMs = options.timeoutMs;
      finishReject_(error);
    }, options.timeoutMs);

    window[callbackName] = function(result) {
      finishResolve_(result);
    };

    script.onerror = function() {
      const error = new Error('系統連線失敗，請稍後再試');
      error.code = 'API_NETWORK_ERROR';
      finishReject_(error);
    };

    /*
     * script 已載入但沒有執行 JSONP callback，通常代表：
     * 1. Web App 回到非 JSONP 內容；
     * 2. redirect / 中介層回傳異常；
     * 3. callback 名稱未被正確帶回。
     */
    script.onload = function() {
      setTimeout(function() {
        if (settled) return;
        const error = new Error('系統回傳格式異常，正在重新確認');
        error.code = 'API_JSONP_NO_CALLBACK';
        finishReject_(error);
      }, 0);
    };

    function finishResolve_(result) {
      if (settled) return;
      settled = true;
      cleanup_();
      resolve(result);
    }

    function finishReject_(error) {
      if (settled) return;
      settled = true;
      cleanup_();
      reject(error);
    }

    function cleanup_() {
      clearTimeout(timer);
      script.onload = null;
      script.onerror = null;

      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }

      try {
        delete window[callbackName];
      } catch (err) {
        window[callbackName] = undefined;
      }
    }

    const parent = document.head || document.body || document.documentElement;

    if (!parent) {
      const error = new Error('頁面尚未完成載入，請稍後再試');
      error.code = 'API_DOCUMENT_NOT_READY';
      finishReject_(error);
      return;
    }

    parent.appendChild(script);
  });
}

function normalizeApiOptions_(payload, options) {
  const requestedTimeout = Number(options.timeoutMs || XZDS_API_DEFAULT_TIMEOUT_MS);
  const timeoutMs = clampApiTimeout_(requestedTimeout);

  const requestedRetryTimeout = Number(
    options.retryTimeoutMs ||
    Math.max(timeoutMs, XZDS_API_DEFAULT_RETRY_TIMEOUT_MS)
  );
  const retryTimeoutMs = clampApiTimeout_(requestedRetryTimeout);

  const action = String(payload.action || '').trim();
  const retryAllowedByAction = isApiRetryableAction_(action);
  const retryAllowedByTimeout = timeoutMs <= 20000;
  const retryEnabled =
    options.retryOnTransport !== false &&
    retryAllowedByAction &&
    retryAllowedByTimeout;

  let maxAttempts;
  if (Number.isFinite(Number(options.maxAttempts))) {
    maxAttempts = Math.max(1, Math.min(4, Number(options.maxAttempts)));
  } else if (retryEnabled) {
    maxAttempts = XZDS_API_THREE_ATTEMPT_ACTIONS.indexOf(action) !== -1 ? 3 : 2;
  } else {
    maxAttempts = 1;
  }

  // 不在安全重試白名單的 action，即使誤傳 maxAttempts，也強制只送 1 次。
  if (!retryAllowedByAction) {
    maxAttempts = 1;
  }

  return {
    timeoutMs: timeoutMs,
    retryTimeoutMs: retryTimeoutMs,
    maxAttempts: maxAttempts,
    timeoutMessage: options.timeoutMessage || '',
    noAuthRedirect: options.noAuthRedirect === true,
    onRetry: typeof options.onRetry === 'function' ? options.onRetry : null
  };
}

function clampApiTimeout_(value) {
  const number = Number(value || XZDS_API_DEFAULT_TIMEOUT_MS);
  return Math.max(5000, Math.min(120000, number));
}

function isApiRetryableAction_(action) {
  return XZDS_API_RETRYABLE_ACTIONS.indexOf(String(action || '').trim()) !== -1;
}

function isRetryableApiTransportError_(error) {
  if (!error) return false;

  return [
    'API_TIMEOUT',
    'API_NETWORK_ERROR',
    'API_JSONP_NO_CALLBACK'
  ].indexOf(String(error.code || '')) !== -1;
}

function isApiTimeoutError(error) {
  return Boolean(
    error &&
    (
      error.code === 'API_TIMEOUT' ||
      error.isTimeout === true
    )
  );
}

function isApiTransportError(error) {
  return isRetryableApiTransportError_(error);
}

function notifyApiRetry_(detail, options) {
  try {
    if (options.onRetry) {
      options.onRetry(detail);
    }
  } catch (ignore) {}

  try {
    if (typeof window.CustomEvent === 'function') {
      window.dispatchEvent(new CustomEvent('xzds:api-retry', {
        detail: detail
      }));
    }
  } catch (ignore) {}
}

function delayApiRetry_(ms) {
  return new Promise(function(resolve) {
    setTimeout(resolve, Math.max(0, Number(ms || 0)));
  });
}

function handleApiAuthRequired_(result) {
  sessionStorage.removeItem('currentUser');

  try {
    alert(result && result.message ? result.message : '登入逾時，請重新登入');
  } catch (ignore) {}

  try {
    location.href = 'index.html';
  } catch (ignore) {}
}

function markApiTransportOk_() {
  try {
    sessionStorage.setItem(XZDS_API_TRANSPORT_OK_KEY, String(Date.now()));
  } catch (ignore) {}
}

function isApiTransportRecentlyOk_() {
  try {
    const value = Number(sessionStorage.getItem(XZDS_API_TRANSPORT_OK_KEY) || 0);
    return value > 0 && (Date.now() - value) <= XZDS_API_TRANSPORT_OK_TTL_MS;
  } catch (ignore) {
    return false;
  }
}

/**
 * 登入前暖機：只呼叫公開 test API，不讀 Google Sheet、不需要 token。
 * 同一頁同時間只允許一個暖機 Promise，避免重複測試。
 */
function warmUpApiTransport(options) {
  options = options || {};

  if (!options.force && isApiTransportRecentlyOk_()) {
    return Promise.resolve({
      success: true,
      message: 'API transport ready',
      cached: true
    });
  }

  if (xzdsApiWarmupPromise_) {
    return xzdsApiWarmupPromise_;
  }

  xzdsApiWarmupPromise_ = callApi({
    action: 'test'
  }, {
    timeoutMs: Number(options.timeoutMs || 7000),
    retryTimeoutMs: Number(options.retryTimeoutMs || 10000),
    maxAttempts: 2,
    retryOnTransport: true,
    noAuthRedirect: true
  }).then(function(result) {
    if (!result || result.success === false) {
      const error = new Error(
        result && result.message
          ? result.message
          : '系統連線尚未穩定'
      );
      error.code = 'API_WARMUP_FAILED';
      throw error;
    }

    markApiTransportOk_();
    return result;
  }).finally(function() {
    xzdsApiWarmupPromise_ = null;
  });

  return xzdsApiWarmupPromise_;
}

function addTokenToPayload(payload) {
  payload = Object.assign({}, payload);

  if (XZDS_API_PUBLIC_ACTIONS.indexOf(payload.action) !== -1) {
    return payload;
  }

  const raw = sessionStorage.getItem('currentUser');

  if (!raw) {
    return payload;
  }

  try {
    const user = JSON.parse(raw);

    if (user && user.token) {
      payload.token = user.token;
    }
  } catch (err) {
    sessionStorage.removeItem('currentUser');
  }

  return payload;
}
