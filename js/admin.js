let adminAccounts = [];

document.addEventListener('DOMContentLoaded', function () {
  if (!requireLogin()) return;
  bindAdminEvents_();
  checkAdminPermissionAndLoad_();
});

function bindAdminEvents_() {
  document.getElementById('backBtn').addEventListener('click', () => { location.href = 'home.html'; });
  document.getElementById('logoutBtn').addEventListener('click', () => { logout(); });
  document.getElementById('reloadAccountsBtn').addEventListener('click', loadAdminAccounts_);
  document.getElementById('reloadAuditBtn').addEventListener('click', loadAdminAudit_);
  document.getElementById('adminSearchInput').addEventListener('input', renderAdminAccounts_);
  document.getElementById('createAccountForm').addEventListener('submit', createAccount_);
}

async function checkAdminPermissionAndLoad_() {
  try {
    const result = await callApi({ action: 'getMyPermissions' });
    if (!result.success || !(result.permissions || {}).adminPanel) {
      showAdminMessage_('您沒有系統後台權限。', 'error');
      setTimeout(() => { location.href = 'home.html'; }, 900);
      return;
    }
    await Promise.all([loadAdminAccounts_(), loadAdminAudit_()]);
  } catch (error) {
    showAdminMessage_('權限確認失敗，請重新登入。', 'error');
  }
}

async function createAccount_(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('[type="submit"]');
  const initialPassword = form.initialPassword.value;
  if (!confirm('確認建立此帳號？初始密碼只會安全寫入後端。')) return;
  button.disabled = true;
  try {
    const result = await callApi({
      action: 'adminCreateAccount', temple: form.temple.value, name: form.name.value,
      account: form.account.value, role: form.role.value, initialPassword: initialPassword
    });
    if (!result.success) throw new Error(result.message || '建立失敗');
    form.reset();
    showAdminMessage_('帳號已建立；請安全通知本人初始密碼。', 'success');
    await Promise.all([loadAdminAccounts_(), loadAdminAudit_()]);
  } catch (error) {
    showAdminMessage_(error.message || '建立失敗，請稍後再試', 'error');
  } finally {
    form.initialPassword.value = '';
    button.disabled = false;
  }
}

async function loadAdminAccounts_() {
  const list = document.getElementById('adminAccountList');
  list.innerHTML = '<div class="small-text">讀取帳號中...</div>';
  try {
    const result = await callApi({ action: 'adminGetAccounts' });
    if (!result.success) throw new Error(result.message || '讀取帳號失敗');
    adminAccounts = result.accounts || [];
    renderAdminAccounts_();
  } catch (error) {
    list.innerHTML = '<div class="small-text">帳號讀取失敗</div>';
    showAdminMessage_(error.message || '系統連線失敗', 'error');
  }
}

function renderAdminAccounts_() {
  const list = document.getElementById('adminAccountList');
  const keyword = normalizeAdminText_(document.getElementById('adminSearchInput').value).toLowerCase();
  const visible = adminAccounts.filter((item) => !keyword || [item.temple, item.name, item.account, item.role, item.status].join(' ').toLowerCase().includes(keyword));
  document.getElementById('adminStatsText').textContent = '共 ' + adminAccounts.length + ' 筆帳號，目前顯示 ' + visible.length + ' 筆';
  list.innerHTML = visible.length ? visible.map(createAccountCard_).join('') : '<div class="small-text">沒有符合條件的帳號</div>';
  list.querySelectorAll('.admin-save-btn[data-action]').forEach((button) => button.addEventListener('click', handleCardAction_));
}

function createAccountCard_(item) {
  const account = escapeAdminHtml_(item.account);
  const selected = (value) => item.status === value ? ' selected' : '';
  return '<article class="admin-account-card" data-account="' + account + '">' +
    '<div class="admin-account-head"><div><div class="admin-account-title">' + escapeAdminHtml_(item.temple) + '｜' + escapeAdminHtml_(item.name) + '</div><div class="admin-account-sub">' + account + '</div></div><div class="admin-account-id">#' + escapeAdminHtml_(item.id) + '</div></div>' +
    '<div class="admin-maintenance-grid"><label>壇名<input class="admin-temple-input" value="' + escapeAdminHtml_(item.temple) + '" /></label><label>姓名<input class="admin-name-input" value="' + escapeAdminHtml_(item.name) + '" /></label><label>角色<select class="admin-role-select"><option value="user"' + (item.role === 'user' ? ' selected' : '') + '>user｜一般帳號</option><option value="admin"' + (item.role === 'admin' ? ' selected' : '') + '>admin｜管理帳號</option></select></label>' +
    '<label>狀態<select class="admin-status-select"><option value="啟用"' + selected('啟用') + '>啟用</option><option value="停用"' + selected('停用') + '>停用</option><option value="封存"' + selected('封存') + '>封存</option></select></label></div>' +
    '<div class="admin-account-meta"><div>建立：' + escapeAdminHtml_(item.createdAt || '—') + '</div><div>最後登入：' + escapeAdminHtml_(item.lastLoginAt || '—') + '</div></div>' +
    '<div class="admin-card-actions"><button class="admin-save-btn" data-action="save" type="button">儲存狀態</button><button class="admin-small-btn" data-action="reset" type="button">重設密碼</button></div></article>';
}

async function handleCardAction_(event) {
  const button = event.currentTarget;
  const card = button.closest('.admin-account-card');
  const account = card.getAttribute('data-account');
  if (button.dataset.action === 'reset') return resetOnePassword_(account);
  const role = card.querySelector('.admin-role-select').value;
  const status = card.querySelector('.admin-status-select').value;
  const temple = card.querySelector('.admin-temple-input').value;
  const name = card.querySelector('.admin-name-input').value;
  if (!confirm('確認將 ' + account + ' 設為「' + role + '／' + status + '」？')) return;
  button.disabled = true;
  try {
    const profileResult = await callApi({ action: 'adminUpdateAccountProfile', account: account, temple: temple, name: name });
    if (!profileResult.success) throw new Error(profileResult.message || '基本資料儲存失敗');
    const result = await callApi({ action: 'adminSetAccountStatus', account: account, role: role, status: status });
    if (!result.success) throw new Error(result.message || '儲存失敗');
    showAdminMessage_('帳號狀態已更新。', 'success');
    await Promise.all([loadAdminAccounts_(), loadAdminAudit_()]);
  } catch (error) { showAdminMessage_(error.message || '儲存失敗', 'error'); }
  finally { button.disabled = false; }
}

async function resetOnePassword_(account) {
  const initialPassword = prompt('請輸入新的一次性密碼（至少 8 碼，含英文大寫、小寫與數字）：');
  if (!initialPassword) return;
  try {
    const result = await callApi({ action: 'adminResetAccountPassword', account: account, initialPassword: initialPassword });
    if (!result.success) throw new Error(result.message || '重設失敗');
    showAdminMessage_('密碼已重設；請安全通知本人。', 'success');
    await loadAdminAudit_();
  } catch (error) { showAdminMessage_(error.message || '重設失敗', 'error'); }
}

async function loadAdminAudit_() {
  const target = document.getElementById('adminAuditList');
  try {
    const result = await callApi({ action: 'adminGetAuditLog' });
    if (!result.success) throw new Error(result.message || '讀取維護紀錄失敗');
    const records = result.records || [];
    target.innerHTML = records.length ? records.map((item) => '<div class="admin-audit-row"><strong>' + escapeAdminHtml_(item.action) + '</strong><span>' + escapeAdminHtml_(item.target) + '｜' + escapeAdminHtml_(item.result) + '</span><small>' + escapeAdminHtml_(item.time) + '｜' + escapeAdminHtml_(item.detail) + '</small></div>').join('') : '<div class="small-text">尚無維護紀錄</div>';
  } catch (error) { target.innerHTML = '<div class="small-text">維護紀錄讀取失敗</div>'; }
}

function showAdminMessage_(text, type) { const el = document.getElementById('adminMessage'); el.textContent = text || ''; el.className = 'message ' + (type || ''); el.style.display = text ? 'block' : 'none'; }
function normalizeAdminText_(value) { return String(value || '').replace(/\u3000/g, ' ').trim(); }
function escapeAdminHtml_(value) { return normalizeAdminText_(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
