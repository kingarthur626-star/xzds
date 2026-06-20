/* =========================
程式名稱：login.js
功能說明：
登入頁專用程式。
主要功能：

一開始隱藏驗證碼
使用者先以帳號與密碼登入
後端判斷登入失敗達 3 次後，才要求顯示驗證碼
驗證碼顯示後才載入驗證碼圖片
驗證碼載入中時，只在圖片位置顯示「產生中」
登入成功後保存使用者資料與 token

注意：
這支程式需要搭配 Auth.gs 的 requireCaptcha 回傳值。
後端回傳 requireCaptcha: true 時，前端才會顯示驗證碼。
========================= */

let currentCaptchaId = '';
let isCaptchaReady = false;
let isCaptchaRequired = false;

/* =========================
程式區塊：頁面初始化
功能說明：
頁面載入後：

綁定登入表單
綁定更新驗證碼按鈕
顯示申請成功或重設密碼成功訊息
一開始先隱藏驗證碼
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

hideCaptchaArea();
});

/* =========================
函式名稱：handleLogin
功能說明：
處理登入表單送出。
一開始只送帳號與密碼。
如果後端回傳 requireCaptcha: true，
才顯示驗證碼並載入驗證碼圖片。
========================= */
async function handleLogin(event) {
event.preventDefault();

clearMessage('loginMessage');

const account = document.getElementById('loginAccount').value.trim();
const password = document.getElementById('loginPassword').value.trim();
const captchaInputEl = document.getElementById('captchaInput');
const captchaInput = captchaInputEl ? captchaInputEl.value.trim() : '';

if (!account || !password) {
showMessage('loginMessage', 'error', '請輸入帳號與密碼');
return;
}

if (isCaptchaRequired) {
if (!isCaptchaReady || !currentCaptchaId) {
showMessage('loginMessage', 'error', '驗證碼尚未載入完成，請稍候');
return;
}

if (!captchaInput) {
  showMessage('loginMessage', 'error', '請輸入驗證碼');
  return;
}

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

  if (result.requireCaptcha) {
    showCaptchaArea();
    loadCaptcha();
  } else {
    hideCaptchaArea();
  }

  return;
}

hideCaptchaArea();
saveCurrentUser(result.user, result.token);
location.href = 'home.html';

} catch (err) {
showMessage('loginMessage', 'error', err.message || '系統連線失敗，請稍後再試');

if (isCaptchaRequired) {
  loadCaptcha();
}

}
}

/* =========================
函式名稱：loadCaptcha
功能說明：
從後端取得新的驗證碼。
只有在需要驗證碼時才會呼叫。
驗證碼圖片尚未回來前，圖片位置先顯示「產生中」。
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
refreshCaptchaBtn.textContent = '更新驗證碼';
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
函式名稱：showCaptchaArea
功能說明：
顯示驗證碼區。
當後端回傳 requireCaptcha: true 時使用。
========================= */
function showCaptchaArea() {
const captchaGroup = getCaptchaGroup();

isCaptchaRequired = true;

if (captchaGroup) {
captchaGroup.style.display = '';
}
}

/* =========================
函式名稱：hideCaptchaArea
功能說明：
隱藏驗證碼區，並清空目前驗證碼狀態。
一般登入狀態下使用。
========================= */
function hideCaptchaArea() {
const captchaGroup = getCaptchaGroup();
const captchaInput = document.getElementById('captchaInput');

isCaptchaRequired = false;
isCaptchaReady = false;
currentCaptchaId = '';

if (captchaInput) {
captchaInput.value = '';
}

if (captchaGroup) {
captchaGroup.style.display = 'none';
}
}

/* =========================
函式名稱：getCaptchaGroup
功能說明：
取得整個驗證碼欄位區塊。
如果 index.html 有 id="captchaGroup"，優先使用。
若沒有，則用 captchaInput 往上找 form-group。
========================= */
function getCaptchaGroup() {
const captchaGroup = document.getElementById('captchaGroup');

if (captchaGroup) {
return captchaGroup;
}

const captchaInput = document.getElementById('captchaInput');

if (!captchaInput) {
return null;
}

return captchaInput.closest('.form-group');
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
使用 Canvas 產生一張 PNG 佔位圖。
內容可以是「產生中」或「載入失敗」。
使用 PNG 比 SVG 更穩，避免部分手機 PWA 顯示破圖。
========================= */
function createCaptchaPlaceholderDataUri(text) {
const safeText = String(text || '產生中');

const canvas = document.createElement('canvas');
canvas.width = 150;
canvas.height = 48;

const ctx = canvas.getContext('2d');

if (!ctx) {
return '';
}

ctx.fillStyle = '#f8fafc';
ctx.fillRect(0, 0, 150, 48);

ctx.strokeStyle = '#d7dde6';
ctx.lineWidth = 2;
roundRect(ctx, 1, 1, 148, 46, 10);
ctx.stroke();

ctx.fillStyle = '#94a3b8';
ctx.font = 'bold 15px Arial, sans-serif';
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';
ctx.fillText(safeText, 75, 24);

return canvas.toDataURL('image/png');
}

/* =========================
函式名稱：roundRect
功能說明：
Canvas 用的圓角矩形繪製工具。
========================= */
function roundRect(ctx, x, y, width, height, radius) {
ctx.beginPath();
ctx.moveTo(x + radius, y);
ctx.lineTo(x + width - radius, y);
ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
ctx.lineTo(x + width, y + height - radius);
ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
ctx.lineTo(x + radius, y + height);
ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
ctx.lineTo(x, y + radius);
ctx.quadraticCurveTo(x, y, x + radius, y);
ctx.closePath();
}