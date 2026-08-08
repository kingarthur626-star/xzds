/* =========================
程式名稱：api.js
版本：v0.3.0R2F2
功能說明：
1. 以 JSONP 呼叫 Google Apps Script Web App。
2. 保留既有 callApi(payload) 相容性。
3. 可由個別頁面傳入 timeoutMs，避免長時間背景排程被固定15秒誤判失敗。
4. 逾時錯誤附帶 code=API_TIMEOUT，供前端區分「回應較慢」與「真正執行失敗」。
========================= */

function callApi(payload, options) {
  payload = addTokenToPayload(payload || {});
  options = options || {};

  const requestedTimeout = Number(options.timeoutMs || 15000);
  const timeoutMs = Math.max(5000, Math.min(120000, requestedTimeout));

  return new Promise(function(resolve, reject) {
    const callbackName =
      'jsonpCallback_' +
      Date.now() +
      '_' +
      Math.floor(Math.random() * 100000);

    payload.callback = callbackName;

    const params = new URLSearchParams();

    Object.keys(payload).forEach(function(key) {
      if (payload[key] !== undefined && payload[key] !== null) {
        params.append(key, payload[key]);
      }
    });

    const script = document.createElement('script');
    script.src = GAS_URL + '?' + params.toString();

    const timer = setTimeout(function() {
      cleanup();

      const error = new Error(
        options.timeoutMessage || '系統回應較慢，請稍後再確認狀態'
      );
      error.code = 'API_TIMEOUT';
      error.isTimeout = true;
      error.timeoutMs = timeoutMs;
      reject(error);
    }, timeoutMs);

    window[callbackName] = function(result) {
      cleanup();

      if (result && result.code === 'AUTH_REQUIRED') {
        sessionStorage.removeItem('currentUser');
        alert(result.message || '登入逾時，請重新登入');
        location.href = 'index.html';
        return;
      }

      resolve(result);
    };

    script.onerror = function() {
      cleanup();

      const error = new Error('系統連線失敗，請稍後再試');
      error.code = 'API_NETWORK_ERROR';
      reject(error);
    };

    function cleanup() {
      clearTimeout(timer);

      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }

      try {
        delete window[callbackName];
      } catch (err) {
        window[callbackName] = undefined;
      }
    }

    document.body.appendChild(script);
  });
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

function addTokenToPayload(payload) {
  payload = Object.assign({}, payload);

  const publicActions = [
    'test',
    'getCaptcha',
    'login',
    'getTemples',
    'registerAccount',
    'resetPassword'
  ];

  if (publicActions.indexOf(payload.action) !== -1) {
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
