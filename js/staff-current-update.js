/* 手動一按更新：先檢查來源，再送一次寫入；未確認的寫入不重送。 */
'use strict';
const sucState = { canUpdate: false, busy: false, unknown: false, resultGeneration: 0 };
const SUC_READ_OPTIONS = { timeoutMs: 30000, maxAttempts: 1 };
const SUC_WRITE_OPTIONS = { timeoutMs: 60000, maxAttempts: 1, retryOnTransport: false };
const SUC_TOTAL_KEYS = ['lecturers', 'activeAltarMasters', 'activeViceAltarMasters'];
document.addEventListener('DOMContentLoaded', sucInit_);

function sucElement_(id) { return document.getElementById(id); }
function sucYear_() { return Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Taipei', year: 'numeric' }).format(new Date())); }
function sucMessage_(text, state) {
  const area = sucElement_('sucMessage');
  area.textContent = text;
  area.setAttribute('data-state', state || 'normal');
}
function sucSetButton_(label) {
  const button = sucElement_('sucUpdateBtn');
  button.disabled = !sucState.canUpdate || sucState.busy || sucState.unknown;
  if (label || !sucState.busy) button.textContent = label || '更新人數';
  button.setAttribute('aria-busy', sucState.busy ? 'true' : 'false');
}
function sucValidTotals_(totals) {
  return totals && SUC_TOTAL_KEYS.every(function (key) { return Number.isSafeInteger(totals[key]) && totals[key] >= 0; });
}
function sucValidSummary_(result) {
  return result && Number.isInteger(result.year) && result.year >= 2000 && Number.isSafeInteger(result.templeCount) && result.templeCount > 0 &&
    (result.year !== 2026 || result.templeCount === 69) &&
    sucValidTotals_(result.totals) && sucValidTotals_(result.otherTotals) && sucValidTotals_(result.reportTotals) &&
    SUC_TOTAL_KEYS.every(function (key) { return result.totals[key] + result.otherTotals[key] === result.reportTotals[key]; });
}
function sucVerified_(result) {
  return result && result.success === true && result.verified === true && sucValidSummary_(result) &&
    typeof result.updatedAt === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(result.updatedAt);
}
function sucMatchesPreview_(result, preview) {
  return result.year === preview.year && result.templeCount === preview.templeCount &&
    ['totals', 'otherTotals', 'reportTotals'].every(function (group) {
      return SUC_TOTAL_KEYS.every(function (key) { return result[group][key] === preview[group][key]; });
    });
}
function sucText_(tag, text, className) {
  const element = document.createElement(tag);
  element.textContent = String(text);
  if (className) element.className = className;
  return element;
}
function sucRender_(result) {
  const content = document.createElement('div');
  content.appendChild(sucText_('p', (result.year !== sucYear_() ? result.year + ' 年｜' : '') + '最後更新：' + result.updatedAt, 'suc-updated-at'));
  const table = document.createElement('table'); table.className = 'suc-totals';
  const head = document.createElement('thead'), headings = document.createElement('tr');
  ['範圍', '講師', '壇主', '副壇主'].forEach(function (label) {
    const th = sucText_('th', label); th.setAttribute('scope', 'col'); headings.appendChild(th);
  });
  head.appendChild(headings); table.appendChild(head);
  const body = document.createElement('tbody');
  [['公壇', result.totals], ['其他', result.otherTotals], ['總計', result.reportTotals]].forEach(function (entry, index) {
    const row = document.createElement('tr'), label = sucText_('th', entry[0]); label.setAttribute('scope', 'row');
    if (index === 0) label.appendChild(sucText_('span', result.templeCount + ' 壇', 'suc-temple-count'));
    row.appendChild(label);
    SUC_TOTAL_KEYS.forEach(function (key) { row.appendChild(sucText_('td', entry[1][key].toLocaleString('zh-TW'))); });
    body.appendChild(row);
  });
  table.appendChild(body); content.appendChild(table); sucElement_('sucResult').replaceChildren(content);
}
function sucFailureMessage_(result) {
  const messages = {
    BUSY: '其他更新正在執行，請稍後再試。',
    PREVIEW_INVALID: '來源檢查已失效，請再按一次「更新人數」。',
    PREVIEW_EXPIRED: '來源檢查已失效，請再按一次「更新人數」。',
    PREVIEW_ACCOUNT_MISMATCH: '登入帳號已變更，請重開此頁。',
    SHEET_CHANGED: '人數資料剛有變動，請再按一次「更新人數」。',
    SOURCE_CHANGED: '來源人數剛有變動，請再按一次「更新人數」。',
    SOURCE_LOGIN: '來源登入失效，未更新人數；請管理者確認來源登入。',
    SOURCE_HTTP: '無法讀取來源，未更新人數；請稍後再試。',
    SOURCE_YEAR: '來源年度不符，未更新人數。',
    SOURCE_SCOPE: '來源資料不完整，未更新人數。',
    SOURCE_HEADERS: '來源缺少人數欄位，未更新人數。',
    SOURCE_ROWS: '來源佛堂資料不完整，未更新人數。',
    SOURCE_DUPLICATE: '來源有重複佛堂，未更新人數。',
    SOURCE_NUMBER: '來源人數格式不正確，未更新人數。',
    SOURCE_TOTAL: '來源合計不一致，未更新人數。',
    SHEET_SCHEMA: '人數工作表欄位不符，請管理者檢查。',
    SHEET_DATA: '人數工作表有重複或不明資料，請管理者檢查。',
    AUTH_REQUIRED: '請重新登入後更新。',
    PERMISSION_DENIED: '目前帳號沒有更新權限。'
  };
  if (result && result.dataWrites === 1 && result.restored === true) return '更新未完成，舊資料已還原。';
  if (result && (result.code === 'ROLLBACK_FAILED' || (result.dataWrites === 1 && result.restored !== true))) return '舊資料還原尚未確認，請管理者檢查人數工作表。';
  return messages[result && result.code] || '更新未完成，舊資料保留；請稍後再試。';
}
async function sucInit_() {
  if (!requireLogin()) return;
  sucElement_('sucYear').textContent = sucYear_() + ' 年';
  sucElement_('sucUpdateBtn').addEventListener('click', sucUpdate_);
  sucSetButton_();
  try {
    const result = await callApi({ action: 'getMyPermissions' }, SUC_READ_OPTIONS);
    if (!result || result.success !== true || !result.permissions || result.permissions.updateTaoReport !== true) {
      sucMessage_(result && result.success === true ? '目前帳號沒有更新權限。' : '無法確認更新權限，請重開此頁。', 'error');
      return;
    }
    sucState.canUpdate = true; sucSetButton_();
    await sucLoadStatus_();
  } catch (error) {
    sucMessage_('無法確認更新權限，請重開此頁。', 'error');
  } finally { sucSetButton_(); }
}
async function sucLoadStatus_() {
  const generation = sucState.resultGeneration;
  sucMessage_('', 'normal');
  try {
    const result = await callApi({ action: 'taoStaffCurrentGetStatus' }, SUC_READ_OPTIONS);
    if (generation !== sucState.resultGeneration) return;
    if (!result || result.success !== true || (result.lastUpdate && !sucVerified_(result.lastUpdate))) throw new Error('STATUS_UNVERIFIED');
    if (result.lastUpdate) sucRender_(result.lastUpdate);
    if (result.lastFailure) {
      if (result.lastFailure.code === 'ROLLBACK_FAILED' || (result.lastFailure.dataWrites === 1 && result.lastFailure.restored !== true)) sucState.unknown = true;
      sucMessage_(sucFailureMessage_(result.lastFailure), 'error');
    }
    else sucMessage_(result.lastUpdate ? '' : '尚無更新紀錄。', 'normal');
  } catch (error) {
    if (generation === sucState.resultGeneration) sucMessage_('暫時無法讀取上次更新時間，仍可按「更新人數」。', 'error');
  }
}
async function sucUpdate_() {
  if (!sucState.canUpdate || sucState.busy || sucState.unknown) return;
  const year = sucYear_();
  sucState.busy = true; sucState.resultGeneration += 1;
  sucElement_('sucYear').textContent = year + ' 年';
  sucSetButton_('檢查來源…'); sucMessage_('', 'normal');
  let writeStarted = false;
  try {
    const preview = await callApi({ action: 'taoStaffCurrentPreview', year: year }, SUC_READ_OPTIONS);
    if (!preview || preview.success !== true) { sucMessage_(sucFailureMessage_(preview), 'error'); return; }
    if (!sucValidSummary_(preview) || preview.year !== year || year !== sucYear_() || typeof preview.previewId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(preview.previewId)) {
      sucMessage_('來源資料尚未確認，未更新人數；請稍後再試。', 'error'); return;
    }
    sucSetButton_('更新中…'); writeStarted = true;
    const result = await callApi({ action: 'taoStaffCurrentUpdate', year: year, previewId: preview.previewId }, SUC_WRITE_OPTIONS);
    if (sucVerified_(result) && sucMatchesPreview_(result, preview)) {
      sucRender_(result); sucMessage_('更新完成。', 'success');
    } else if (result && result.success === false && (result.dataWrites === 0 || (result.dataWrites === 1 && result.restored === true))) {
      sucMessage_(sucFailureMessage_(result), 'error');
    } else {
      sucState.unknown = true;
      sucMessage_('更新結果尚未確認，請稍後重開此頁核對，勿重複送出。', 'error');
    }
  } catch (error) {
    if (writeStarted) {
      sucState.unknown = true;
      sucMessage_('更新結果尚未確認，請稍後重開此頁核對，勿重複送出。', 'error');
    } else sucMessage_('無法讀取來源，未更新人數；請稍後再試。', 'error');
  } finally { sucState.busy = false; sucSetButton_(); }
}
