/* =========================
程式名稱：admin.js
功能說明：
系統後台帳號管理頁專用程式。

主要用途：
1. 檢查登入狀態
2. 確認目前使用者是否有系統後台權限
3. 讀取帳號名單
4. 顯示帳號角色與啟用狀態
5. 提供 admin 修改帳號角色與啟用狀態

注意事項：
1. 前端只負責畫面與操作。
2. 真正權限檢查必須由 Apps Script 後端再次驗證。
3. 本頁需要後端 action：
   - adminGetAccounts
   - adminUpdateAccount
========================= */

let adminAccounts = [];
let currentAdminUser = null;

document.addEventListener('DOMContentLoaded', function () {
  const user = requireLogin();

  if (!user) return;

  currentAdminUser = user;

  bindAdminButtons();
  checkAdminPermissionAndLoad_();
});

/* =========================
函式名稱：bindAdminButtons
功能說明：
綁定後台頁面的返回、登出、重新整理與搜尋功能。
========================= */
function bindAdminButtons() {
  const backBtn = document.getElementById('backBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const reloadBtn = document.getElementById('reloadAccountsBtn');
  const searchInput = document.getElementById('adminSearchInput');
  const btnDutyActivityAdmin = document.getElementById('btnDutyActivityAdmin');
  const btnTaoMobileUpdate = document.getElementById('btnTaoMobileUpdate');

  if (btnDutyActivityAdmin) {
    btnDutyActivityAdmin.addEventListener('click', function () {
      location.href = 'duty-activity-admin.html';
    });
  }

  if (btnTaoMobileUpdate) {
    btnTaoMobileUpdate.addEventListener('click', function () {
      location.href = 'tao-mobile-update.html';
    });
  }

  if (backBtn) {
    backBtn.addEventListener('click', function () {
      location.href = 'home.html';
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', function () {
      logout();
    });
  }

  if (reloadBtn) {
    reloadBtn.addEventListener('click', function () {
      loadAdminAccounts_();
    });
  }

  if (searchInput) {
    searchInput.addEventListener('input', function () {
      renderAdminAccounts_();
    });
  }
}

/* =========================
函式名稱：checkAdminPermissionAndLoad_
功能說明：
先呼叫 getMyPermissions 確認是否具有系統後台權限。
若沒有 adminPanel 權限，返回首頁。
========================= */
async function checkAdminPermissionAndLoad_() {
  showAdminMessage_('', '');

  try {
    const result = await callApi({
      action: 'getMyPermissions'
    });

    const permissions = result.permissions || {};

    if (!result.success || !permissions.adminPanel) {
      showAdminMessage_('您沒有系統後台權限。', 'error');

      setTimeout(function () {
        location.href = 'home.html';
      }, 900);

      return;
    }

    const mobileUpdateBtn = document.getElementById('btnTaoMobileUpdate');

    if (mobileUpdateBtn) {
      mobileUpdateBtn.hidden = !permissions.updateTaoReport;
    }

    loadAdminAccounts_();

  } catch (err) {
    showAdminMessage_('權限確認失敗，請重新登入。', 'error');
  }
}

/* =========================
函式名稱：loadAdminAccounts_
功能說明：
從後端讀取帳號清單。
========================= */
async function loadAdminAccounts_() {
  const listEl = document.getElementById('adminAccountList');
  const statsEl = document.getElementById('adminStatsText');
  const reloadBtn = document.getElementById('reloadAccountsBtn');

  showAdminMessage_('', '');

  if (listEl) {
    listEl.innerHTML = '<div class="small-text">讀取帳號中...</div>';
  }

  if (statsEl) {
    statsEl.textContent = '讀取中...';
  }

  if (reloadBtn) {
    reloadBtn.disabled = true;
  }

  try {
    const result = await callApi({
      action: 'adminGetAccounts'
    });

    if (!result.success) {
      throw new Error(result.message || '讀取帳號失敗');
    }

    adminAccounts = result.accounts || [];

    renderAdminAccounts_();

  } catch (err) {
    if (listEl) {
      listEl.innerHTML = '<div class="small-text">讀取失敗</div>';
    }

    if (statsEl) {
      statsEl.textContent = '帳號讀取失敗';
    }

    showAdminMessage_(err.message || '系統連線失敗，請稍後再試', 'error');

  } finally {
    if (reloadBtn) {
      reloadBtn.disabled = false;
    }
  }
}

/* =========================
函式名稱：renderAdminAccounts_
功能說明：
依照搜尋文字，將帳號資料渲染到畫面上。
========================= */
function renderAdminAccounts_() {
  const listEl = document.getElementById('adminAccountList');
  const statsEl = document.getElementById('adminStatsText');
  const searchInput = document.getElementById('adminSearchInput');

  if (!listEl) return;

  const keyword = normalizeAdminText_(searchInput ? searchInput.value : '').toLowerCase();

  const filtered = adminAccounts.filter(function (item) {
    if (!keyword) return true;

    const text = [
      item.id,
      item.temple,
      item.name,
      item.account,
      item.role,
      item.status,
      item.createdAt,
      item.lastLoginAt
    ].join(' ').toLowerCase();

    return text.indexOf(keyword) !== -1;
  });

  if (statsEl) {
    statsEl.textContent =
      '共 ' + adminAccounts.length + ' 筆帳號，目前顯示 ' + filtered.length + ' 筆';
  }

  if (filtered.length === 0) {
    listEl.innerHTML = '<div class="small-text">沒有符合條件的帳號</div>';
    return;
  }

  const htmlParts = [];

  for (let i = 0; i < filtered.length; i++) {
    htmlParts.push(createAdminAccountCardHtml_(filtered[i]));
  }

  listEl.innerHTML = htmlParts.join('');

  bindAccountCardButtons_();
}

/* =========================
函式名稱：createAdminAccountCardHtml_
功能說明：
產生單一帳號卡片 HTML。
========================= */
function createAdminAccountCardHtml_(item) {
  const id = escapeAdminHtml_(item.id || '');
  const temple = escapeAdminHtml_(item.temple || '');
  const name = escapeAdminHtml_(item.name || '');
  const account = escapeAdminHtml_(item.account || '');
  const createdAt = escapeAdminHtml_(item.createdAt || '');
  const lastLoginAt = escapeAdminHtml_(item.lastLoginAt || '');

  const role = normalizeAdminText_(item.role || 'user');
  const status = normalizeAdminText_(item.status || '啟用');

  const userSelected = role === 'user' ? 'selected' : '';
  const adminSelected = role === 'admin' ? 'selected' : '';

  const enabledSelected = status === '啟用' ? 'selected' : '';
  const disabledSelected = status === '停用' ? 'selected' : '';

  return '' +
    '<div class="admin-account-card" data-account="' + account + '">' +
      '<div class="admin-account-head">' +
        '<div>' +
          '<div class="admin-account-title">' + temple + '｜' + name + '</div>' +
          '<div class="admin-account-sub">' + account + '</div>' +
        '</div>' +
        '<div class="admin-account-id">#' + id + '</div>' +
      '</div>' +

      '<div class="admin-account-grid">' +
        '<div class="admin-field">' +
          '<label>角色</label>' +
          '<select class="admin-role-select">' +
            '<option value="user" ' + userSelected + '>user｜一般帳號</option>' +
            '<option value="admin" ' + adminSelected + '>admin｜管理帳號</option>' +
          '</select>' +
        '</div>' +

        '<div class="admin-field">' +
          '<label>狀態</label>' +
          '<select class="admin-status-select">' +
            '<option value="啟用" ' + enabledSelected + '>啟用</option>' +
            '<option value="停用" ' + disabledSelected + '>停用</option>' +
          '</select>' +
        '</div>' +
      '</div>' +

      '<div class="admin-account-meta">' +
        '<div>建立：' + (createdAt || '—') + '</div>' +
        '<div>最後登入：' + (lastLoginAt || '—') + '</div>' +
      '</div>' +

      '<button class="admin-save-btn" type="button">儲存變更</button>' +
    '</div>';
}

/* =========================
函式名稱：bindAccountCardButtons_
功能說明：
綁定每張帳號卡片的儲存按鈕。
========================= */
function bindAccountCardButtons_() {
  const cards = document.querySelectorAll('.admin-account-card');

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    const saveBtn = card.querySelector('.admin-save-btn');

    if (!saveBtn) continue;

    saveBtn.addEventListener('click', function () {
      updateOneAccount_(card);
    });
  }
}

/* =========================
函式名稱：updateOneAccount_
功能說明：
將單一帳號的角色與啟用狀態送到後端更新。
========================= */
async function updateOneAccount_(card) {
  const account = normalizeAdminText_(card.getAttribute('data-account'));
  const roleSelect = card.querySelector('.admin-role-select');
  const statusSelect = card.querySelector('.admin-status-select');
  const saveBtn = card.querySelector('.admin-save-btn');

  const role = roleSelect ? roleSelect.value : 'user';
  const status = statusSelect ? statusSelect.value : '啟用';

  if (!account) {
    showAdminMessage_('找不到帳號資料，無法更新。', 'error');
    return;
  }

const ok = confirm(
'確認更新此帳號？' +
' 帳號：' + account +
'；角色：' + role +
'；狀態：' + status
);

  if (!ok) return;

  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = '儲存中...';
  }

  try {
    const result = await callApi({
      action: 'adminUpdateAccount',
      account: account,
      role: role,
      status: status
    });

    if (!result.success) {
      throw new Error(result.message || '更新失敗');
    }

    showAdminMessage_('帳號已更新：' + account, 'success');

    loadAdminAccounts_();

  } catch (err) {
    showAdminMessage_(err.message || '更新失敗，請稍後再試', 'error');

  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = '儲存變更';
    }
  }
}

/* =========================
函式名稱：showAdminMessage_
功能說明：
顯示後台頁面的成功或錯誤訊息。
========================= */
function showAdminMessage_(text, type) {
  const el = document.getElementById('adminMessage');

  if (!el) return;

  el.textContent = text || '';
  el.className = 'message';

  if (!text) {
    el.style.display = 'none';
    return;
  }

  el.classList.add(type === 'success' ? 'success' : 'error');
  el.style.display = 'block';
}

/* =========================
函式名稱：normalizeAdminText_
功能說明：
統一文字清理，避免空白或全形空白影響判斷。
========================= */
function normalizeAdminText_(value) {
  return String(value || '')
    .replace(/\u3000/g, ' ')
    .trim();
}

/* =========================
函式名稱：escapeAdminHtml_
功能說明：
避免資料內容影響 HTML 結構。
========================= */
function escapeAdminHtml_(value) {
  return normalizeAdminText_(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
