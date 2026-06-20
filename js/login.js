/* =========================
程式名稱：login.js
功能說明：
登入頁專用程式。
主要功能：

載入驗證碼
顯示驗證碼載入中的佔位圖
處理登入表單送出
登入成功後保存使用者資料與 token
登入失敗時重新產生驗證碼

注意：
這一版主要改善「驗證碼圖片較慢出現」時的畫面體驗。
因為 Apps Script API 可能有冷啟動時間，
驗證碼不一定能瞬間回來，所以先顯示「產生中」。
========================= */

let currentCaptchaId = '';
let isCaptchaReady = false;

/* =========================
程式區塊：頁面初始化
功能說明：
頁面載入後：

綁定登入表單
綁定更新驗證碼按鈕
顯示申請成功或重設密碼成功訊息
立即載入驗證碼
========================= */
document.addEventListener('DOMContentLoaded', function() {
const loginForm = document.getElementById('loginForm');

if (loginForm) {
loginForm.addEventListener('submit', handleLogin);
}

const refreshCaptchaBtn = document.getElementById('refreshCaptchaBtn');

if (refreshCaptchaBtn) {
refreshCaptchaBtn.addEventListener('click', loadCaptcha);
}

const params = new URLSearchParams(location.search);

if (params.get('register') === 'success') {
showMessage('loginMessage', 'success', '帳號申請成功，請登入');
}

if (params.get('reset') === 'success') {
showMessage('loginMessage', 'success', '密碼已更新，請重新登入');
}

showCaptchaPlaceholder('產生中');
loadCaptcha();
});

/* =========================
函式名稱：loadCaptcha
功能說明：
從後端取得新的驗證碼。
在驗證碼尚未回來前，先顯示「產生中」，
避免畫面出現破圖或「驗證碼圖片」文字。
========================= */
async function loadCaptcha() {
const captchaInput = document.getElementById('captchaInput');
const refreshCaptchaBtn = document.getElementById('refreshCaptchaBtn');

currentCaptchaId = '';
isCaptchaReady = false;

if (captchaInput) {
captchaInput.value = '';
}

if (refreshCaptchaBtn) {
refreshCaptchaBtn.disabled = true;
refreshCaptchaBtn.textContent = '產生中';
}

showCaptchaPlaceholder('產生中');

try {
const result = await callApi({
action: 'getCaptcha'
});

if (!result.success) {
  showCaptchaPlaceholder('載入失敗');
  showMessage('loginMessage', 'error', result.message || '驗證碼載入失敗');
  return;
}

currentCaptchaId = result.captchaId || '';

await setCaptchaImage(result.imageData);

isCaptchaReady = true;

} catch (err) {
showCaptchaPlaceholder('載入失敗');
showMessage('loginMessage', 'error', err.message || '驗證碼載入失敗');

} finally {
if (refreshCaptchaBtn) {
refreshCaptchaBtn.disabled = false;
refreshCaptchaBtn.textContent = '更新驗證碼';
}
}
}

/* =========================
函式名稱：handleLogin
功能說明：
處理登入表單送出。
送出前會檢查：

帳號
密碼
驗證碼
驗證碼是否已載入完成
========================= */
async function handleLogin(event) {
event.preventDefault();

clearMessage('loginMessage');

const account = document.getElementById('loginAccount').value.trim();
const password = document.getElementById('loginPassword').value.trim();
const captchaInput = document.getElementById('captchaInput').value.trim();

if (!account || !password) {
showMessage('loginMessage', 'error', '請輸入帳號與密碼');
return;
}

if (!isCaptchaReady || !currentCaptchaId) {
showMessage('loginMessage', 'error', '驗證碼尚未載入完成，請稍候');
return;
}

if (!captchaInput) {
showMessage('loginMessage', 'error', '請輸入驗證碼');
return;
}

try {
const result = await callApi({
action: 'login',
account: account,
password: password,
captchaId: currentCaptchaId,
captchaInput: captchaInput
});

if (!result.success) {
  showMessage('loginMessage', 'error', result.message || '登入失敗');
  loadCaptcha();
  return;
}

saveCurrentUser(result.user, result.token);
location.href = 'home.html';

} catch (err) {
showMessage('loginMessage', 'error', err.message || '系統連線失敗，請稍後再試');
loadCaptcha();
}
}

/* =========================
函式名稱：setCaptchaImage
功能說明：
將後端回傳的驗證碼圖片放入畫面。
使用 Promise 等圖片載入完成後才顯示，
避免畫面短暫出現破圖。
========================= */
function setCaptchaImage(imageData) {
return new Promise(function(resolve) {
const captchaImage = document.getElementById('captchaImage');

if (!captchaImage || !imageData) {
  resolve();
  return;
}

captchaImage.onload = function() {
  resolve();
};

captchaImage.onerror = function() {
  showCaptchaPlaceholder('載入失敗');
  resolve();
};

captchaImage.alt = '驗證碼';
captchaImage.src = imageData;

});
}

/* =========================
函式名稱：showCaptchaPlaceholder
功能說明：
顯示驗證碼佔位圖片。
用來改善等待 Apps Script API 回應時，
畫面出現空白或破圖的問題。
========================= */
function showCaptchaPlaceholder(text) {
const captchaImage = document.getElementById('captchaImage');

if (!captchaImage) return;

captchaImage.alt = '';
captchaImage.src = createCaptchaPlaceholderDataUri(text || '產生中');
}

/* =========================
函式名稱：createCaptchaPlaceholderDataUri
功能說明：
產生一張 SVG 佔位圖。
內容可以是「產生中」或「載入失敗」。
========================= */
function createCaptchaPlaceholderDataUri(text) {
const safeText = String(text || '')
.replace(/&/g, '')
.replace(/</g, '')
.replace(/>/g, '')
.replace(/"/g, '');

const svg =
'' +
'' +
'' +
'' +
safeText +
'' +
'';

return 'data/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
}