/* 資料更新中心：預檢與正式更新分開，寫入只送一次。 */
'use strict';
const ducState = { canUpdate: false, staffBusy: false, statusBusy: false, reportBusy: false, reportReadBusy: false, staffNeedsStatus: false, reportNeedsRead: false, preview: null };
const DUC_READ_OPTIONS = { timeoutMs: 30000, maxAttempts: 1 };
const DUC_WRITE_OPTIONS = { timeoutMs: 60000, maxAttempts: 1, retryOnTransport: false };
document.addEventListener('DOMContentLoaded', ducInit_);

function ducElement_(id) { return document.getElementById(id); }
function ducMessage_(id, text, error) {
  const area = ducElement_(id);
  if (!area) return;
  area.textContent = text;
  area.setAttribute('data-state', error ? 'error' : 'normal');
}
function ducYear_() { return Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Taipei', year: 'numeric' }).format(new Date())); }
function ducSetButtons_() {
  const allowed = ducState.canUpdate;
  const writeBusy = ducState.staffBusy || ducState.reportBusy;
  const states = {
    ducStaffPreviewBtn: !allowed || writeBusy || ducState.staffNeedsStatus || ducState.statusBusy,
    ducStaffUpdateBtn: !allowed || writeBusy || ducState.statusBusy || !ducState.preview,
    ducStaffRefreshBtn: !allowed || writeBusy || ducState.statusBusy,
    ducDailyBtn: !allowed,
    ducReportBtn: !allowed || writeBusy || ducState.reportNeedsRead || ducState.reportReadBusy,
    ducReportRefreshBtn: !allowed || writeBusy || ducState.reportReadBusy
  };
  Object.keys(states).forEach(function (id) { const button = ducElement_(id); if (button) button.disabled = states[id]; });
}
async function ducInit_() {
  if (!requireLogin()) return;
  ducElement_('ducStaffYear').textContent = ducYear_() + ' 年';
  [['ducStaffPreviewBtn', ducPreviewStaff_], ['ducStaffUpdateBtn', ducUpdateStaff_], ['ducStaffRefreshBtn', ducLoadStaffStatus_],
    ['ducReportBtn', ducSyncReport_], ['ducReportRefreshBtn', ducLoadReportStatus_]].forEach(function (entry) {
      const button = ducElement_(entry[0]); if (button) button.addEventListener('click', entry[1]);
    });
  ducElement_('ducDailyBtn').addEventListener('click', function () { if (ducState.canUpdate) location.href = 'daily-data-update.html'; });
  ducSetButtons_();
  try {
    const result = await callApi({ action: 'getMyPermissions' }, DUC_READ_OPTIONS);
    if (!result || result.success !== true || !result.permissions || result.permissions.updateTaoReport !== true) {
      ducMessage_('ducPermissionMessage', result && result.success === true ? '目前帳號沒有資料更新權限。' : '更新權限尚未取得，請重新整理頁面。', true);
      return;
    }
    ducState.canUpdate = true;
    ducMessage_('ducPermissionMessage', '', false);
    ducSetButtons_();
    await Promise.all([ducLoadStaffStatus_(), ducLoadReportStatus_()]);
  } catch (error) {
    ducMessage_('ducPermissionMessage', '更新權限讀取失敗，請重新整理頁面。', true);
  } finally { ducSetButtons_(); }
}
function ducValidTotals_(totals) {
  return totals && ['lecturers', 'activeAltarMasters', 'activeViceAltarMasters'].every(function (key) {
    return Number.isSafeInteger(totals[key]) && totals[key] >= 0;
  });
}
function ducValidSummary_(result) {
  return result && Number.isInteger(result.year) && result.year >= 2000 && Number.isSafeInteger(result.templeCount) && result.templeCount > 0 &&
    ducValidTotals_(result.totals) && ducValidTotals_(result.otherTotals) && ducValidTotals_(result.reportTotals);
}
function ducSourceText_(sources) {
  if (typeof sources === 'string') return sources;
  if (Array.isArray(sources)) return sources.map(function (source) { return typeof source === 'string' ? source : String(source && (source.label || source.name) || ''); }).filter(Boolean).join('、');
  if (sources && typeof sources === 'object') return Object.keys(sources).map(function (key) { const source = sources[key]; return typeof source === 'string' ? source : String(source && (source.label || source.name) || ''); }).filter(Boolean).join('、');
  return '';
}
function ducTextNode_(tag, text, className) {
  const element = document.createElement(tag); element.textContent = String(text);
  if (className) element.className = className;
  return element;
}
function ducRenderStaffSummary_(id, result, preview) {
  const area = ducElement_(id), content = document.createElement('div');
  content.appendChild(ducTextNode_('h3', preview ? '預檢結果' : '最近成功更新'));
  content.appendChild(ducTextNode_('p', result.year + ' 年｜' + result.templeCount + ' 壇', 'duc-summary-meta'));
  if (result.updatedAt) content.appendChild(ducTextNode_('p', '更新時間：' + result.updatedAt + '（台灣時間）', 'duc-summary-meta'));
  const sources = ducSourceText_(result.sources || result.source);
  if (sources) content.appendChild(ducTextNode_('p', '來源：' + sources, 'duc-summary-meta'));
  const wrap = document.createElement('div'); wrap.className = 'duc-table-wrap';
  const table = document.createElement('table'), head = document.createElement('thead'), headings = document.createElement('tr');
  table.className = 'duc-totals-table';
  ['範圍', '講師', '在職壇主', '在職副壇主'].forEach(function (label) { const th = ducTextNode_('th', label); th.setAttribute('scope', 'col'); headings.appendChild(th); });
  head.appendChild(headings); table.appendChild(head);
  const body = document.createElement('tbody');
  [['公壇小計', result.totals], ['其他', result.otherTotals], ['報表總計', result.reportTotals]].forEach(function (entry) {
    const row = document.createElement('tr'), label = ducTextNode_('th', entry[0]); label.setAttribute('scope', 'row'); row.appendChild(label);
    ['lecturers', 'activeAltarMasters', 'activeViceAltarMasters'].forEach(function (key) { row.appendChild(ducTextNode_('td', entry[1][key].toLocaleString('zh-TW'))); });
    body.appendChild(row);
  });
  table.appendChild(body); wrap.appendChild(table); content.appendChild(wrap); area.replaceChildren(content);
}
async function ducLoadStaffStatus_() {
  if (!ducState.canUpdate || ducState.statusBusy || ducState.staffBusy || ducState.reportBusy) return;
  ducState.statusBusy = true; ducSetButtons_();
  ducMessage_('ducStaffMessage', '正在讀取最新狀態…', false);
  try {
    const result = await callApi({ action: 'taoStaffCurrentGetStatus' }, DUC_READ_OPTIONS);
    if (!result || result.success !== true) throw new Error('STATUS_UNAVAILABLE');
    const last = result.lastUpdate;
    if (last && (last.verified !== true || !ducValidSummary_(last) || !last.updatedAt)) throw new Error('STATUS_UNVERIFIED');
    if (last) ducRenderStaffSummary_('ducStaffResult', last, false);
    ducState.staffNeedsStatus = false;
    if (result.lastFailure) {
      ducMessage_('ducStaffMessage', '最近一次更新未完成。' + String(result.lastFailure.message || '請先預檢並核對來源。'), true);
    } else {
      ducMessage_('ducStaffMessage', last ? '已讀取最近確認結果。' : '目前尚無成功更新紀錄，可先預檢來源。', false);
    }
  } catch (error) {
    ducMessage_('ducStaffMessage', '最新狀態讀取失敗，已保留上次顯示結果；請稍後再讀取。', true);
  } finally { ducState.statusBusy = false; ducSetButtons_(); }
}
async function ducPreviewStaff_() {
  if (!ducState.canUpdate || ducState.staffBusy || ducState.reportBusy || ducState.statusBusy || ducState.staffNeedsStatus) return;
  ducState.preview = null; ducState.staffBusy = true; ducSetButtons_();
  ducMessage_('ducStaffMessage', '正在預檢來源，尚未寫入資料…', false);
  const year = ducYear_();
  try {
    const result = await callApi({ action: 'taoStaffCurrentPreview', year: year }, DUC_READ_OPTIONS);
    if (!result || result.success !== true) {
      ducMessage_('ducStaffMessage', result && result.message || '預檢未完成，請重新讀取狀態。', true); return;
    }
    if (!ducValidSummary_(result) || result.year !== year || typeof result.previewId !== 'string' || !result.previewId.trim()) {
      ducMessage_('ducStaffMessage', '預檢結果尚未確認，暫時不能更新。請重新預檢。', true); return;
    }
    ducRenderStaffSummary_('ducStaffPreview', result, true);
    ducState.preview = { year: result.year, previewId: result.previewId };
    ducMessage_('ducStaffMessage', '預檢完成，尚未寫入；確認人數後可按「更新人數」。', false);
  } catch (error) {
    ducMessage_('ducStaffMessage', '預檢讀取失敗，尚未寫入資料；請稍後重新預檢。', true);
  } finally { ducState.staffBusy = false; ducSetButtons_(); }
}
async function ducUpdateStaff_() {
  if (!ducState.canUpdate || ducState.staffBusy || ducState.reportBusy || ducState.statusBusy || !ducState.preview) return;
  const preview = ducState.preview;
  if (preview.year !== ducYear_()) { ducState.preview = null; ducMessage_('ducStaffMessage', '年度已變更，請重新預檢。', true); ducSetButtons_(); return; }
  if (!confirm('是否更新 ' + preview.year + ' 年在職壇主、副壇主及講師人數？')) return;
  ducState.preview = null; ducState.staffBusy = true; ducSetButtons_();
  ducMessage_('ducStaffMessage', '正在更新人數並確認結果，請勿重複操作…', false);
  try {
    const result = await callApi({ action: 'taoStaffCurrentUpdate', year: preview.year, previewId: preview.previewId }, DUC_WRITE_OPTIONS);
    if (result && result.success === true && result.verified === true && ducValidSummary_(result) && result.year === preview.year && result.updatedAt) {
      ducRenderStaffSummary_('ducStaffResult', result, false);
      ducElement_('ducStaffPreview').replaceChildren();
      ducMessage_('ducStaffMessage', '更新完成，已確認各壇人數與三項合計。', false);
    } else {
      ducState.staffNeedsStatus = true;
      ducMessage_('ducStaffMessage', '更新結果尚未確認。' + String(result && result.message || '請先讀取最新狀態，確認後再重新預檢。'), true);
    }
  } catch (error) {
    ducState.staffNeedsStatus = true;
    ducMessage_('ducStaffMessage', '更新回應未確認，可能仍在處理。請先讀取最新狀態，勿重複送出。', true);
  } finally { ducState.staffBusy = false; ducSetButtons_(); }
}
async function ducLoadReportStatus_() {
  if (!ducState.canUpdate || ducState.reportReadBusy || ducState.staffBusy || ducState.reportBusy) return;
  ducState.reportReadBusy = true; ducSetButtons_();
  try {
    const result = await callApi({ action: 'getTaoReportLastUpdate' }, DUC_READ_OPTIONS);
    if (!result || result.success !== true) throw new Error('STATUS_UNAVAILABLE');
    ducElement_('ducReportResult').replaceChildren(ducTextNode_('p', result.lastUpdate ? '最後同步：' + result.lastUpdate + '（台灣時間）' : '目前尚無報表同步紀錄。', 'duc-summary-meta'));
    ducState.reportNeedsRead = false;
    ducMessage_('ducReportMessage', '已讀取報表最後同步時間。', false);
  } catch (error) {
    ducMessage_('ducReportMessage', '同步時間讀取失敗，已保留上次顯示結果；請稍後再讀取。', true);
  } finally { ducState.reportReadBusy = false; ducSetButtons_(); }
}
async function ducSyncReport_() {
  if (!ducState.canUpdate || ducState.staffBusy || ducState.reportBusy || ducState.reportNeedsRead || ducState.reportReadBusy) return;
  if (!confirm('是否更新即時道務報表？')) return;
  ducState.reportBusy = true; ducSetButtons_();
  ducMessage_('ducReportMessage', '正在同步求道與法會報表，請保持此畫面等待…', false);
  try {
    const result = await callApi({ action: 'updateTaoReport01Stored' }, { timeoutMs: 60000, maxAttempts: 1, retryOnTransport: false, timeoutMessage: '報表仍在同步中，請保持此畫面等待完成' });
    if (result && result.success === true && result.updatedAt && Number.isSafeInteger(result.qiudaoRows) && result.qiudaoRows >= 0 && Number.isSafeInteger(result.fahuiRows) && result.fahuiRows >= 0) {
      const content = document.createElement('div');
      content.appendChild(ducTextNode_('p', '求道筆數：' + result.qiudaoRows.toLocaleString('zh-TW')));
      content.appendChild(ducTextNode_('p', '法會筆數：' + result.fahuiRows.toLocaleString('zh-TW')));
      content.appendChild(ducTextNode_('p', '更新時間：' + result.updatedAt + '（台灣時間）', 'duc-summary-meta'));
      ducElement_('ducReportResult').replaceChildren(content);
      ducMessage_('ducReportMessage', '報表同步完成。', false);
    } else {
      ducState.reportNeedsRead = true;
      ducMessage_('ducReportMessage', '報表同步結果尚未確認。' + String(result && result.message || '請先讀取最後同步時間並核對結果。'), true);
    }
  } catch (error) {
    ducState.reportNeedsRead = true;
    ducMessage_('ducReportMessage', '同步回應未確認，可能仍在處理。請先讀取最後同步時間，勿重複送出。', true);
  } finally { ducState.reportBusy = false; ducSetButtons_(); }
}
