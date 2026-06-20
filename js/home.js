/* =========================
程式名稱：home.js
功能說明：
首頁專用程式。
主要功能：

檢查登入狀態
顯示登入者壇名
綁定首頁功能按鈕
依照權限顯示「更新報表」與「系統後台」
只有 admin 顯示「最後更新時間」
user 不顯示「最後更新時間」
========================= */

document.addEventListener('DOMContentLoaded', function () {
const user = requireLogin();

if (!user) return;

initHomePage(user);
});

/* =========================
函式名稱：initHomePage
功能說明：
初始化首頁畫面。
顯示壇名、控制最後更新時間、綁定按鈕、讀取權限。
========================= */
function initHomePage(user) {
const templeEl = document.getElementById('homeTempleName');

if (templeEl) {
templeEl.textContent = user.temple || '未取得壇名';
}

applyLastUpdateDisplay_(user);

bindHomeButtons();
loadHomePermissions(user);

if (isAdminUser_(user)) {
loadTaoReportLastUpdate();
}
}

/* =========================
函式名稱：isAdminUser_
功能說明：
判斷目前登入者是否為 admin。
角色來源為 Auth.gs 登入成功後回傳的 user.role。
========================= */
function isAdminUser_(user) {
const role = String(user && user.role ? user.role : 'user')
.trim()
.toLowerCase();

return role === 'admin';
}

/* =========================
函式名稱：applyLastUpdateDisplay_
功能說明：
控制首頁「最後更新」文字是否顯示。
admin：顯示
user：隱藏
========================= */
function applyLastUpdateDisplay_(user) {
const area = document.getElementById('lastUpdateText');

if (!area) return;

if (isAdminUser_(user)) {
area.style.display = '';
} else {
area.textContent = '';
area.style.display = 'none';
}
}

/* =========================
函式名稱：bindHomeButtons
功能說明：
綁定首頁各功能按鈕。
========================= */
function bindHomeButtons() {
const btnAnnual = document.getElementById('btnAnnual');
const btnHistory = document.getElementById('btnHistory');
const btnUpdate = document.getElementById('btnUpdate');
const btnLogout = document.getElementById('btnLogout');

if (btnAnnual) {
btnAnnual.addEventListener('click', function () {
location.href = 'annual.html';
});
}

if (btnHistory) {
btnHistory.addEventListener('click', function () {
location.href = 'history.html';
});
}

if (btnUpdate) {
btnUpdate.addEventListener('click', updateTaoReport);
}

if (btnLogout) {
btnLogout.addEventListener('click', function () {
localStorage.removeItem(HOME_PERMISSION_CACHE_KEY);
logout();
});
}
}

const HOME_PERMISSION_CACHE_KEY = 'XZDS_HOME_PERMISSIONS';
const HOME_PERMISSION_CACHE_SECONDS = 600; // 10分鐘

/* =========================
函式名稱：loadHomePermissions
功能說明：
讀取首頁權限。
用來控制「更新報表」與「系統後台」是否顯示。
========================= */
async function loadHomePermissions(user) {
const btnUpdate = document.getElementById('btnUpdate');
const btnMore = document.getElementById('btnMore');

// 預設先隱藏，避免沒權限的人看到
applyHomePermissions_({
updateTaoReport: false,
adminPanel: false
});

// 先讀本機暫存權限，讓回首頁時不用等 2 秒
const cached = getCachedHomePermissions_(user);

if (cached) {
applyHomePermissions_(cached);
}

try {
const result = await callApi({
action: 'getMyPermissions'
});

if (!result.success) {
  if (!cached) {
    applyHomePermissions_({
      updateTaoReport: false,
      adminPanel: false
    });
  }
  return;
}

const permissions = result.permissions || {};

setCachedHomePermissions_(user, permissions);
applyHomePermissions_(permissions);

} catch (err) {
// 如果後端暫時讀不到，但本機有暫存，就先維持暫存畫面
if (!cached) {
applyHomePermissions_({
updateTaoReport: false,
adminPanel: false
});
}
}
}

/* =========================
函式名稱：applyHomePermissions_
功能說明：
依照後端回傳權限，控制首頁按鈕顯示。
========================= */
function applyHomePermissions_(permissions) {
const btnUpdate = document.getElementById('btnUpdate');
const btnMore = document.getElementById('btnMore');

if (btnUpdate) {
btnUpdate.style.display = permissions.updateTaoReport ? 'flex' : 'none';
}

if (btnMore) {
if (permissions.adminPanel) {
btnMore.style.display = 'flex';
btnMore.classList.remove('disabled');

  btnMore.innerHTML = `
    <span class="home-menu-main">系統後台</span>
    <span class="home-menu-sub">權限管理</span>
  `;

  btnMore.onclick = function () {
    location.href = 'admin.html';
  };

} else {
  btnMore.style.display = 'none';
}

}
}

/* =========================
函式名稱：getCachedHomePermissions_
功能說明：
讀取首頁權限暫存。
========================= */
function getCachedHomePermissions_(user) {
const userKey = getHomePermissionUserKey_(user);

if (!userKey) return null;

try {
const raw = localStorage.getItem(HOME_PERMISSION_CACHE_KEY);

if (!raw) return null;

const cache = JSON.parse(raw);

if (!cache || cache.userKey !== userKey) {
  return null;
}

const now = Date.now();
const ageSeconds = (now - cache.savedAt) / 1000;

if (ageSeconds > HOME_PERMISSION_CACHE_SECONDS) {
  return null;
}

return cache.permissions || null;

} catch (err) {
return null;
}
}

/* =========================
函式名稱：setCachedHomePermissions_
功能說明：
儲存首頁權限暫存。
========================= */
function setCachedHomePermissions_(user, permissions) {
const userKey = getHomePermissionUserKey_(user);

if (!userKey) return;

const cache = {
userKey: userKey,
savedAt: Date.now(),
permissions: permissions || {}
};

localStorage.setItem(HOME_PERMISSION_CACHE_KEY, JSON.stringify(cache));
}

/* =========================
函式名稱：getHomePermissionUserKey_
功能說明：
取得首頁權限暫存使用的使用者 key。
========================= */
function getHomePermissionUserKey_(user) {
if (!user) return '';

return String(
user.account ||
user.username ||
user.loginAccount ||
''
).trim();
}

/* =========================
函式名稱：loadTaoReportLastUpdate
功能說明：
讀取即時道務報表最後更新時間。
注意：
這個函式只會在 admin 登入時執行。
========================= */
async function loadTaoReportLastUpdate() {
const area = document.getElementById('lastUpdateText');

if (!area) return;

const cachedLastUpdate = localStorage.getItem('taoReportLastUpdate');

if (cachedLastUpdate) {
area.textContent = '最後更新：' + cachedLastUpdate;
} else {
area.textContent = '最後更新：讀取中...';
}

try {
const result = await callApi({
action: 'getTaoReportLastUpdate'
});

if (result.success && result.lastUpdate) {
  area.textContent = '最後更新：' + result.lastUpdate;
  localStorage.setItem('taoReportLastUpdate', result.lastUpdate);
} else {
  if (!cachedLastUpdate) {
    area.textContent = '最後更新：尚未更新';
  }
}

} catch (err) {
if (!cachedLastUpdate) {
area.textContent = '最後更新：讀取失敗';
}
}
}

/* =========================
函式名稱：updateTaoReport
功能說明：
更新即時道務報表。
通常只有 admin 或有權限者可以看到此按鈕。
========================= */
async function updateTaoReport() {
const ok = confirm('是否更新即時道務報表？');

if (!ok) return;

const btn = document.getElementById('btnUpdate');

setUpdateButtonLoading(btn, true);

try {
const result = await callApi({
action: 'updateTaoReport01Stored'
});

if (result.success) {
  if (result.updatedAt) {
    localStorage.setItem('taoReportLastUpdate', result.updatedAt);

    const area = document.getElementById('lastUpdateText');
    if (area) {
      area.textContent = '最後更新：' + result.updatedAt;
    }
  }

  alert(
    '更新完成\n\n' +
    '求道筆數：' + result.qiudaoRows + '\n' +
    '法會筆數：' + result.fahuiRows + '\n' +
    '更新時間：' + result.updatedAt
  );

  loadTaoReportLastUpdate();

} else {
  alert(result.message || '更新失敗');
}

} catch (err) {
alert(err.message || '系統連線失敗，請稍後再試');

} finally {
setUpdateButtonLoading(btn, false);
}
}

/* =========================
函式名稱：setUpdateButtonLoading
功能說明：
控制更新報表按鈕的載入狀態。
========================= */
function setUpdateButtonLoading(btn, isLoading) {
if (!btn) return;

btn.disabled = isLoading;

if (isLoading) {
btn.classList.add('disabled');
btn.innerHTML = <span class="home-menu-main">更新中</span> <span class="home-menu-sub">請稍候...</span> ;
} else {
btn.classList.remove('disabled');
btn.innerHTML = <span class="home-menu-main">更新報表</span> <span class="home-menu-sub">即時同步</span> ;
}
}