/* 新莊區道務檢視｜每日資料更新 20260929｜逐筆處理 */

const TDU_POLL_MS = 5000;
let tduPollTimer = null;
let tduStatusRunning = false;
let tduMutationRunning = false;
let tduCanUpdate = false;
let tduCurrentActive = false;
let tduStatusKnown = false;
let tduManualUnconfirmed = false;
let tduHistoryRunning = false;
let tduHistoryHasSnapshot = false;
let tduSyncRunning = false;
let tduSyncHasSnapshot = false;
let tduIssuesRunning = false;
let tduIssueForceNext = false;
let tduIssuesHasSnapshot = false;
let tduIssuePage = 0;
let tduIssueFilter = 'open';
let tduIssueCursors = [''];
let tduIssueNextCursor = '';
let tduIssueHasMore = false;
let tduIssueTotal = 0;
let tduIssueChangeVersion = 0;
let tduIssueItems = new Map();
const tduIssueBusy = new Set();
const tduIssueUnconfirmed = new Set();
const tduIssueMessages = new Map();
const tduIssueCards = new Map();
const tduIssueDrafts = new Map();
const TDU_READ_OPTIONS = { timeoutMs: 15000, maxAttempts: 1 };
const TDU_BACKGROUND_OPTIONS = { timeoutMs: 30000, maxAttempts: 1 };


document.addEventListener('DOMContentLoaded', function () {
  const user = requireLogin();
  if (!user) return;

  bindTduButtons_();
  checkTduPermissionAndLoad_();
});


function bindTduButtons_() {
  const homeBtn = document.getElementById('tduHomeBtn');
  const logoutBtn = document.getElementById('tduLogoutBtn');
  const refreshBtn = document.getElementById('tduRefreshBtn');
  const syncRefreshBtn = document.getElementById('tduSyncRefreshBtn');
  const manualBtn = document.getElementById('tduManualBtn');
  const closeBtn = document.getElementById('tduDetailCloseBtn');
  const modal = document.getElementById('tduDetailModal');

  if (homeBtn) {
    homeBtn.addEventListener('click', function () {
      location.href = 'home.html';
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', function () {
      logout();
    });
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', function () {
      loadTduAll_(true);
    });
  }

  if (syncRefreshBtn) {
    syncRefreshBtn.addEventListener('click', loadTduSyncOverview_);
  }

  const issuesRefresh = document.getElementById('tduIssuesRefreshBtn');
  const issuesFilter = document.getElementById('tduIssueFilter');
  const previous = document.getElementById('tduIssuePreviousBtn');
  const next = document.getElementById('tduIssueNextBtn');
  if (issuesRefresh) issuesRefresh.addEventListener('click', function () { loadTduIssues_(true); });
  if (issuesFilter) issuesFilter.addEventListener('change', function () { changeTduIssueFilter_(issuesFilter.value); });
  if (previous) previous.addEventListener('click', function () { changeTduIssuePage_(-1); });
  if (next) next.addEventListener('click', function () { changeTduIssuePage_(1); });

  if (manualBtn) {
    manualBtn.addEventListener('click', runTduManualUpdate_);
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', closeTduDetail_);
  }

  if (modal) {
    modal.addEventListener('click', function (event) {
      if (event.target && event.target.getAttribute('data-tdu-close') === 'true') {
        closeTduDetail_();
      }
    });
  }
}


async function checkTduPermissionAndLoad_() {
  setTduActionMessage_('', false);
  refreshTduManualButton_();
  // 此端點本身受伺服器權限檢查保護，避免先做一次獨立權限查詢。
  await loadTduAll_(false);
}


async function loadTduAll_(showMessage) {
  const loaded = await readTduStatus_();
  if (loaded) {
    if (showMessage && !tduManualUnconfirmed) setTduActionMessage_('目前狀態已更新，其他資料各自重新讀取中。', false);
    refreshTduBackground_();
  }
}


async function loadTduStatusOnly_() {
  if (!tduCanUpdate) return;
  const loaded = await readTduStatus_();
  if (loaded && !tduCurrentActive) refreshTduBackground_();
}

async function readTduStatus_() {
  if (tduStatusRunning) return false;
  tduStatusRunning = true;
  const refresh = document.getElementById('tduRefreshBtn');
  if (refresh) refresh.disabled = true;
  try {
    const result = await callApi({ action: 'taoDailyUpdateGetStatus' }, TDU_READ_OPTIONS);
    if (!result || !result.success) {
      if (result && /DENIED|FORBIDDEN|AUTH_REQUIRED/.test(String(result.code || ''))) {
        tduCanUpdate = false; tduStatusKnown = false; stopTduPolling_();
        renderTduPermissionDenied_();
      } else {
        throw new Error(result && result.message || '目前狀態尚未取得');
      }
      return false;
    }
    tduCanUpdate = true;
    tduStatusKnown = true;
    tduManualUnconfirmed = false;
    renderTduStatus_(result);
    updateTduPolling_(tduCurrentActive);
    return true;
  } catch (error) {
    if (tduStatusKnown) setTduActionMessage_('狀態重新讀取未完成；保留前次快照，請稍後重新整理。', true);
    else renderTduLoadError_('目前狀態尚未取得，請按重新整理。');
    return false;
  } finally {
    tduStatusRunning = false;
    if (refresh) refresh.disabled = false;
    refreshTduManualButton_();
  }
}

function refreshTduBackground_() {
  loadTduHistoryOnly_();
  loadTduSyncOverview_();
  loadTduIssues_();
}


async function loadTduHistoryOnly_() {
  if (!tduCanUpdate || tduHistoryRunning) return;
  tduHistoryRunning = true;
  try {
    const result = await callApi({ action: 'taoDailyUpdateGetHistory', limit: 15 }, TDU_BACKGROUND_OPTIONS);
    if (!result || !result.success) throw new Error('讀取未完成');
    renderTduHistory_(result);
    tduHistoryHasSnapshot = true;
  } catch (error) {
    const area = document.getElementById('tduHistoryList');
    if (area && !tduHistoryHasSnapshot) area.replaceChildren(makeTduEmpty_('更新紀錄尚未取得，請按上方重新整理。'));
    const note = document.getElementById('tduHistoryMessage');
    if (note) note.textContent = tduHistoryHasSnapshot ? '重新讀取未完成，以下保留前次更新紀錄。' : '';
  } finally { tduHistoryRunning = false; }
}


async function loadTduSyncOverview_() {
  const area = document.getElementById('tduSyncOverview');
  if (!area || !tduCanUpdate || tduSyncRunning) return;
  tduSyncRunning = true;
  const refresh = document.getElementById('tduSyncRefreshBtn');
  if (refresh) refresh.disabled = true;
  if (!tduSyncHasSnapshot) area.replaceChildren(makeTduEmpty_('讀取同步總覽中…'));
  try {
    const result = await callApi({ action: 'getSyncOverview' }, TDU_BACKGROUND_OPTIONS);
    if (!result || !result.success || !result.pipeline) throw new Error('同步總覽尚未取得');
    renderTduSyncOverview_(result);
    const note = document.getElementById('tduSyncMessage');
    if (note) note.textContent = '';
  } catch (error) {
    if (!tduSyncHasSnapshot) area.replaceChildren(makeTduEmpty_('同步總覽尚未取得，請重新整理；這不代表更新作業失敗。'));
    const note = document.getElementById('tduSyncMessage');
    if (note) note.textContent = tduSyncHasSnapshot ? '重新讀取未完成，以下保留前次同步快照。' : '';
  } finally { tduSyncRunning = false; if (refresh) refresh.disabled = false; }
}

function renderTduSyncOverview_(result) {
  const area = document.getElementById('tduSyncOverview');
  if (!area) return;
  area.replaceChildren();

  if (!result || !result.success) {
    area.appendChild(makeTduEmpty_('同步總覽讀取失敗。'));
    return;
  }

  if (!result.pipeline) {
    area.appendChild(makeTduEmpty_('同步總覽未取得，不能判定同步結果。'));
    return;
  }
  tduSyncHasSnapshot = true;
  const pipeline = result.pipeline;
  const title = document.getElementById('tduSyncTitle');
  if (title) title.textContent = pipeline.summaryLabel || '本輪每日更新摘要';
  const queue = pipeline.queue || {};
  const steps = pipeline.steps || {};
  const summary = document.createElement('div');
  summary.className = 'tdu-sync-grid';
  summary.appendChild(makeTduSummaryStat_('待確認', numberText_(queue.review || 0), Number(queue.review || 0) > 0 ? 'review' : ''));
  summary.appendChild(makeTduSummaryStat_('待同步', numberText_(queue.pending || 0), Number(queue.pending || 0) > 0 ? 'review' : ''));
  summary.appendChild(makeTduSummaryStat_('失敗', numberText_(queue.failed || 0), Number(queue.failed || 0) > 0 ? 'failed' : ''));
  summary.appendChild(makeTduSummaryStat_('已完成', numberText_(queue.done || 0)));
  area.appendChild(summary);
  if (result.recovery && result.recovery.status && result.recovery.status !== 'IDLE') {
    const recovery = result.recovery;
    const labels = { SCHEDULED: '等待續跑', RUNNING: '覆核中', RETRYING: '等待重試', FAILED: '覆核中斷，需檢查', NEEDS_RETRY: '仍有資料待重試／待確認', COMPLETED: '本輪覆核完成' };
    const recoveryLine = document.createElement('p');
    recoveryLine.className = 'tdu-sync-foot';
    recoveryLine.textContent = '安全覆核：' + (labels[recovery.status] || '狀態待確認') +
      '｜已檢查 ' + numberText_(recovery.checked) + '｜已同步 ' + numberText_(recovery.synced) +
      '｜累積重試次數 ' + numberText_(recovery.retry);
    area.appendChild(recoveryLine);
  }

  const stepsList = document.createElement('div');
  stepsList.className = 'tdu-sync-steps';
  [['master', '主檔'], ['detail', '年度明細'], ['annual', '年度報表']].forEach(function(item) {
    const step = steps[item[0]] || {};
    const row = document.createElement('div');
    row.className = 'tdu-sync-step';
    const name = document.createElement('span');
    name.textContent = item[1];
    const state = document.createElement('strong');
    state.className = step.okForNext === true ? 'is-verified' : 'is-unverified';
    state.textContent = step.okForNext === true ? '已同步' : (pipeline.busy ? '處理中' : '待確認');
    row.appendChild(name);
    row.appendChild(state);
    if (step.reason) {
      const reason = document.createElement('p'); reason.className = 'tdu-step-reason'; reason.textContent = step.reason; row.appendChild(reason);
    }
    stepsList.appendChild(row);
  });
  area.appendChild(stepsList);

  const foot = document.createElement('div');
  foot.className = 'tdu-sync-foot';
  foot.textContent = '區間同步快照：' + (result.generatedAt || '--') + (pipeline.busy ? '｜同步作業執行中。' : '');
  area.appendChild(foot);

  const warnings = Array.isArray(result.warnings) ? result.warnings : [];
  warnings.forEach(function(message) {
    const warning = document.createElement('div');
    warning.className = 'tdu-sync-warning';
    warning.textContent = message;
    area.appendChild(warning);
  });
}


async function loadTduIssues_(force) {
  if (!tduCanUpdate) return false;
  if (tduIssuesRunning) { if (force === true) tduIssueForceNext = true; return false; }
  const forceRead = force === true;
  tduIssueForceNext = false;
  tduIssuesRunning = true;
  const area = document.getElementById('tduIssueList');
  if (!tduIssuesHasSnapshot && area) area.replaceChildren(makeTduEmpty_('讀取待處理資料中…'));
  if (tduIssuesHasSnapshot) setTduIssueListMessage_('正在重新讀取，以下暫時保留前次清單。');
  const requestedVersion = tduIssueChangeVersion;
  let needsRefresh = false;
  updateTduIssueNavigation_();
  try {
    const result = await callApi({ action: 'taoDailyIssueList', cursor: tduIssueCursors[tduIssuePage] || '', limit: 20, status: tduIssueFilter, force: forceRead }, TDU_BACKGROUND_OPTIONS);
    if (!result || !result.success) throw new Error(result && result.message || '資料尚未取得');
    if (requestedVersion !== tduIssueChangeVersion) { needsRefresh = true; return false; }
    renderTduIssues_(result, forceRead && result.cached !== true);
    setTduIssueListMessage_('');
    return true;
  } catch (error) {
    if (!tduIssuesHasSnapshot && area) area.replaceChildren(makeTduEmpty_('待處理資料尚未取得，請重新整理。'));
    setTduIssueListMessage_(tduIssuesHasSnapshot ? '重新讀取未完成，保留前次清單；請稍後重新整理。' : '');
    return false;
  } finally {
    tduIssuesRunning = false;
    updateTduIssueNavigation_();
    if (needsRefresh || tduIssueForceNext) window.setTimeout(function () { loadTduIssues_(true); }, 0);
  }
}

function renderTduIssues_(result, verifiedFresh) {
  if (!result || !result.success) return;
  const issues = Array.isArray(result.issues) ? result.issues : [];
  tduIssueItems = new Map(issues.map(function (item) { return [String(item.issueId), item]; }));
  tduIssueTotal = Number(result.total || 0);
  tduIssueHasMore = !!result.hasMore;
  tduIssueNextCursor = result.nextCursor || '';
  tduIssuesHasSnapshot = true;
  issues.forEach(function (item) {
    const id = String(item.issueId);
    if (verifiedFresh === true && tduIssueUnconfirmed.has(id) && !tduIssueBusy.has(id)) {
      tduIssueUnconfirmed.delete(id);
      tduIssueMessages.set(id, '已重新取得這筆的目前狀態；請依下方結果決定是否操作。');
    }
  });
  renderTduIssueItems_();
  updateTduIssueNavigation_();
}

function renderTduIssueItems_() {
  const list = document.getElementById('tduIssueList');
  if (!list) return;
  list.replaceChildren();
  tduIssueCards.clear();
  if (!tduIssueItems.size) list.appendChild(makeTduEmpty_(tduIssueFilter === 'closed' ? '目前沒有已處理資料。' : '目前沒有待處理資料。'));
  tduIssueItems.forEach(function (item) {
    const card = makeTduIssueCard_(item);
    tduIssueCards.set(String(item.issueId), card);
    list.appendChild(card);
  });
}

function updateTduIssueCard_(issueId) {
  const existing = tduIssueCards.get(issueId);
  const item = tduIssueItems.get(issueId);
  if (!existing || !item) return;
  const replacement = makeTduIssueCard_(item);
  existing.replaceWith(replacement);
  tduIssueCards.set(issueId, replacement);
}

function makeTduIssueCard_(issue) {
  const id = String(issue.issueId);
  const busy = tduIssueBusy.has(id);
  const unconfirmed = tduIssueUnconfirmed.has(id);
  const closed = ['resolved', 'closed'].includes(String(issue.status));
  const labels = { pending: '等待更新', auto_retry: '待重試', manual_review: '待確認', resolved: '已更新', closed: '已結案' };
  const card = makeTduIssueItem_([issue.name || '未列姓名', issue.memberId || ''].filter(Boolean).join('　'), issue.reason || issue.lastError || '等待確認來源資料。', labels[issue.status] || '待確認');
  card.className += ' tdu-work-item';
  card.setAttribute('aria-busy', busy ? 'true' : 'false');
  const meta = document.createElement('div');
  meta.className = 'tdu-issue-meta';
  meta.textContent = '重試次數：' + numberText_(issue.attemptCount == null ? issue.attempts : issue.attemptCount) +
    (issue.updatedAt ? '　更新時間：' + issue.updatedAt : '') +
    (issue.eventCount ? '　相關事件：' + numberText_(issue.eventCount) + ' 筆' : '');
  card.appendChild(meta);
  const sourceDetails = [issue.sourceFunction, issue.operation, issue.mutationTime].filter(function (value) { return typeof value === 'string' && value.trim(); });
  if (sourceDetails.length) {
    const source = document.createElement('div'); source.className = 'tdu-issue-meta';
    source.textContent = '來源異動：' + sourceDetails.join('｜'); card.appendChild(source);
  }
  if (closed) {
    const resolution = document.createElement('div');
    resolution.className = 'tdu-issue-meta';
    resolution.textContent = (issue.status === 'closed' ? '結案原因：' : '處理結果：') + (issue.resolutionReason || '已處理') + (issue.resolvedAt ? '　' + issue.resolvedAt : '');
    card.appendChild(resolution);
  }
  const feedback = document.createElement('div');
  feedback.className = 'tdu-issue-feedback';
  feedback.setAttribute('role', 'status');
  feedback.setAttribute('aria-live', 'polite');
  feedback.textContent = busy ? '正在處理這筆，其他資料仍可操作。' : (tduIssueMessages.get(id) || '');
  card.appendChild(feedback);

  if (!closed) {
    const buttons = document.createElement('div');
    buttons.className = 'tdu-issue-actions';
    const retry = document.createElement('button');
    retry.type = 'button'; retry.className = 'tdu-row-primary'; retry.textContent = '重試';
    retry.disabled = busy || unconfirmed || issue.canRetry !== true;
    retry.addEventListener('click', function () { runTduIssueAction_(id, 'retry'); });
    const close = document.createElement('button');
    close.type = 'button'; close.className = 'tdu-row-secondary'; close.textContent = '確認結案';
    close.disabled = busy || unconfirmed || issue.canClose !== true;
    close.addEventListener('click', function () {
      const draft = tduIssueDrafts.get(id) || { choice: '', note: '' };
      draft.open = !draft.open; tduIssueDrafts.set(id, draft); updateTduIssueCard_(id);
    });
    buttons.appendChild(retry); buttons.appendChild(close); card.appendChild(buttons);
    if (unconfirmed) {
      const refresh = document.createElement('button');
      refresh.type = 'button'; refresh.className = 'tdu-text-btn'; refresh.textContent = '重新確認這筆狀態';
      refresh.addEventListener('click', function () { loadTduIssues_(true); });
      card.appendChild(refresh);
    }
    const draft = tduIssueDrafts.get(id);
    if (draft && draft.open) card.appendChild(makeTduIssueCloseForm_(issue, draft, busy || unconfirmed));
  }
  return card;
}

function makeTduIssueCloseForm_(issue, draft, disabled) {
  const id = String(issue.issueId);
  const form = document.createElement('form'); form.className = 'tdu-close-form';
  const label = document.createElement('label'); label.textContent = '結案原因';
  const choice = document.createElement('select'); choice.disabled = disabled; choice.required = true;
  [['', '請選擇已確認的原因'], ['missing', '已確認來源不存在'], ['other', '其他原因（請填備註）']].forEach(function (entry) {
    const option = document.createElement('option'); option.value = entry[0]; option.textContent = entry[1]; choice.appendChild(option);
  });
  choice.value = draft.choice || ''; label.appendChild(choice); form.appendChild(label);
  const noteLabel = document.createElement('label'); noteLabel.textContent = '備註（其他原因必填）';
  const note = document.createElement('textarea'); note.rows = 2; note.maxLength = 450; note.value = draft.note || ''; note.disabled = disabled;
  noteLabel.appendChild(note); form.appendChild(noteLabel);
  choice.addEventListener('change', function () { draft.choice = choice.value; note.required = choice.value === 'other'; });
  note.addEventListener('input', function () { draft.note = note.value; });
  note.required = choice.value === 'other';
  const help = document.createElement('p'); help.className = 'tdu-help';
  help.textContent = '結案會保留處理紀錄，並停止重試這筆事件；不會刪除正式主檔。'; form.appendChild(help);
  const submit = document.createElement('button'); submit.type = 'submit'; submit.className = 'tdu-row-primary'; submit.textContent = '確認結案'; submit.disabled = disabled;
  form.appendChild(submit);
  form.addEventListener('submit', function (event) {
    event.preventDefault();
    const reason = tduCloseReason_(choice.value, note.value);
    if (!reason) { tduIssueMessages.set(id, '請選擇結案原因；選擇其他原因時請填寫備註。'); updateTduIssueCard_(id); return; }
    runTduIssueAction_(id, 'close', reason, choice.value === 'missing' ? 'source_missing' : 'manual_confirmed');
  });
  return form;
}

function tduCloseReason_(choice, note) {
  const text = String(note || '').trim().slice(0, 450);
  if (choice === 'missing') return '已確認來源不存在' + (text ? '：' + text : '');
  return choice === 'other' ? text : '';
}

async function runTduIssueAction_(issueId, action, reason, reasonCode) {
  const id = String(issueId);
  const item = tduIssueItems.get(id);
  if (!tduCanUpdate || !item || tduIssueBusy.has(id) || tduIssueUnconfirmed.has(id)) return;
  if (action === 'retry' && item.canRetry !== true) return;
  if (action === 'close' && (item.canClose !== true || !String(reason || '').trim())) return;
  if (!['retry', 'close'].includes(action)) return;
  tduIssueBusy.add(id); tduIssueChangeVersion++; tduIssueMessages.delete(id); updateTduIssueCard_(id);
  let refreshAfter = false;
  let completed = false;
  try {
    const payload = { action: action === 'retry' ? 'taoDailyIssueRetry' : 'taoDailyIssueClose', issueId: id, revision: item.revision };
    if (action === 'close') { payload.reason = reason; payload.reasonCode = reasonCode || 'manual_confirmed'; }
    const result = await callApi(payload, { timeoutMs: 60000, maxAttempts: 1, retryOnTransport: false });
    if (!result || !result.success) {
      const code = String(result && result.code || '');
      tduIssueMessages.set(id, result && result.message || '目前無法處理，這筆仍保留在清單。');
      if (['CONFLICT', 'NOT_FOUND', 'BUSY', 'WRITE_FAILED'].includes(code)) { tduIssueUnconfirmed.add(id); refreshAfter = true; }
    } else if (!result.issue || !['resolved', 'unresolved', 'closed'].includes(result.outcome)) {
      tduIssueUnconfirmed.add(id);
      tduIssueMessages.set(id, '處理回應未確認，原資料仍保留；請先重新確認這筆狀態。');
    } else {
      if (tduIssueItems.has(id)) tduIssueItems.set(id, result.issue);
      tduIssueMessages.set(id, result.message || (result.outcome === 'unresolved' ? '已重試，仍有原因待處理，這筆資料繼續保留。' : result.outcome === 'closed' ? '已結案，處理紀錄已保留。' : '這筆已更新完成。'));
      if (result.outcome !== 'unresolved') tduIssueDrafts.delete(id);
      completed = true;
    }
  } catch (error) {
    tduIssueUnconfirmed.add(id);
    tduIssueMessages.set(id, '處理回應未確認，可能仍在執行；原資料保留，請先重新確認這筆狀態。');
  } finally {
    tduIssueBusy.delete(id); tduIssueChangeVersion++; updateTduIssueCard_(id);
    if (refreshAfter) {
      setTduIssueListMessage_('這筆狀態已有變動，正在重新確認清單。');
      loadTduIssues_(true);
    }
    if (completed) window.setTimeout(function () { loadTduIssues_(true); }, 1200);
  }
}

function setTduIssueListMessage_(message) {
  const element = document.getElementById('tduIssueListMessage');
  if (element) element.textContent = message || '';
}

function updateTduIssueNavigation_() {
  const previous = document.getElementById('tduIssuePreviousBtn');
  const next = document.getElementById('tduIssueNextBtn');
  const refresh = document.getElementById('tduIssuesRefreshBtn');
  const filter = document.getElementById('tduIssueFilter');
  const page = document.getElementById('tduIssuePage');
  if (previous) previous.disabled = tduIssuesRunning || tduIssuePage === 0;
  if (next) next.disabled = tduIssuesRunning || !tduIssueHasMore || !tduIssueNextCursor;
  if (refresh) refresh.disabled = tduIssuesRunning;
  if (filter) filter.disabled = tduIssuesRunning;
  if (page) page.textContent = tduIssuesHasSnapshot ? '第 ' + (tduIssuePage + 1) + ' 頁｜共 ' + numberText_(tduIssueTotal) + ' 筆' : '讀取中';
}

async function changeTduIssuePage_(direction) {
  if (tduIssuesRunning || (direction < 0 && tduIssuePage === 0) || (direction > 0 && (!tduIssueHasMore || !tduIssueNextCursor))) return;
  const oldPage = tduIssuePage;
  if (direction > 0) { tduIssuePage++; tduIssueCursors[tduIssuePage] = tduIssueNextCursor; }
  else tduIssuePage--;
  if (!await loadTduIssues_()) { tduIssuePage = oldPage; updateTduIssueNavigation_(); }
}

async function changeTduIssueFilter_(filter) {
  if (tduIssuesRunning) return;
  const previous = { filter: tduIssueFilter, page: tduIssuePage, cursors: tduIssueCursors };
  tduIssueFilter = filter === 'closed' ? 'closed' : 'open'; tduIssuePage = 0; tduIssueCursors = [''];
  if (!await loadTduIssues_()) {
    tduIssueFilter = previous.filter; tduIssuePage = previous.page; tduIssueCursors = previous.cursors;
    const select = document.getElementById('tduIssueFilter'); if (select) select.value = tduIssueFilter;
    updateTduIssueNavigation_();
  }
}

async function runTduManualUpdate_() {
  if (!tduCanUpdate || tduMutationRunning || tduCurrentActive || tduManualUnconfirmed) return;
  tduMutationRunning = true;
  refreshTduManualButton_();
  setTduActionMessage_('正在排入手動更新…', false);

  try {
    const result = await callApi({ action: 'taoDailyUpdateRunManual' }, { timeoutMs: 30000, maxAttempts: 1, retryOnTransport: false });

    if (!result || !result.success) {
      setTduActionMessage_(result && result.message || '目前未接受手動更新，請重新讀取狀態。', true);
      return;
    }

    tduCurrentActive = true;
    setTduActionMessage_('手動更新已排入背景執行，頁面可關閉。', false);
    updateTduPolling_(true);
  } catch (error) {
    tduManualUnconfirmed = true;
    setTduActionMessage_('排程回應未確認，可能仍在處理。請先重新整理狀態，再決定是否操作。', true);
  } finally {
    tduMutationRunning = false;
    refreshTduManualButton_();
    window.setTimeout(function () {
      loadTduStatusOnly_();
    }, 1200);
  }
}


function renderTduStatus_(result) {
  const badge = document.getElementById('tduStatusBadge');
  const source = document.getElementById('tduStatusSource');
  const message = document.getElementById('tduStatusMessage');
  const time = document.getElementById('tduStatusTime');
  const btn = document.getElementById('tduManualBtn');

  if (!result || !result.success) {
    if (badge) {
      badge.textContent = '讀取失敗';
      setTduStatusClass_(badge, 'FAILED');
    }
    if (message) message.textContent = '目前無法讀取更新狀態。';
    if (btn) btn.disabled = true;
    return;
  }

  const current = result.current || {};
  const status = String(current.status || 'IDLE').toUpperCase();
  tduCurrentActive = !!current.active;

  if (badge) {
    badge.textContent = current.stale || current.recoveryNeeded ? '需重新確認' : tduStatusLabel_(status);
    setTduStatusClass_(badge, current.stale || current.recoveryNeeded ? 'COMPLETED_WITH_REVIEW' : status);
  }

  if (source) source.textContent = current.sourceLabel || '';

  if (message) {
    message.textContent = tduFriendlyCurrentMessage_(current) + (result.staleManual ? ' 另有較早的手動更新未確認完成，待處理資料仍保留。' : '');
  }

  if (time) {
    const t = current.completedAt || current.updatedAt || current.startedAt || '';
    time.textContent = t ? '時間：' + t : '';
  }

  refreshTduManualButton_();
}

function refreshTduManualButton_() {
  const btn = document.getElementById('tduManualBtn');
  if (!btn) return;
  btn.disabled = !tduCanUpdate || tduMutationRunning || tduCurrentActive || tduManualUnconfirmed;
  btn.textContent = tduMutationRunning ? '排程中…' : tduManualUnconfirmed ? '請先重新確認狀態' : tduCurrentActive ? '更新執行中…' : '手動更新資料';
}

function renderTduHistory_(result) {
  const list = document.getElementById('tduHistoryList');
  if (!list) return;

  list.replaceChildren();

  if (!result || !result.success) {
    list.appendChild(makeTduEmpty_('更新紀錄讀取失敗。'));
    return;
  }
  const historyMessage = document.getElementById('tduHistoryMessage');
  if (historyMessage) historyMessage.textContent = '';

  const records = Array.isArray(result.records) ? result.records : [];
  if (!records.length) {
    list.appendChild(makeTduEmpty_('目前尚無更新紀錄。'));
    return;
  }

  records.forEach(function (record) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'tdu-history-item';

    const top = document.createElement('div');
    top.className = 'tdu-record-top';

    const left = document.createElement('div');
    left.className = 'tdu-record-left';

    const chip = document.createElement('span');
    chip.className = 'tdu-source-chip';
    chip.textContent = record.sourceLabel || '更新';

    const time = document.createElement('span');
    time.className = 'tdu-record-time';
    time.textContent = record.executedAt || '--';

    left.appendChild(chip);
    left.appendChild(time);

    const resultStatus = String(record.result || '').toUpperCase();
    const reviewCount = Number(record.review || 0);
    const failedCount = Number(record.failed || 0);
    const resultBadge = document.createElement('span');
    resultBadge.className = 'tdu-record-result';
    resultBadge.textContent = failedCount > 0
      ? '失敗 ' + failedCount
      : (reviewCount > 0 ? '待確認 ' + reviewCount :
        (resultStatus === 'COMPLETED_WITH_REVIEW' ? '待重試／待確認' :
          (['SUCCESS', 'COMPLETED'].includes(resultStatus) ? '完成' : '狀態待確認')));
    setTduStatusClass_(resultBadge, failedCount > 0 ? 'FAILED' : (reviewCount > 0 ? 'COMPLETED_WITH_REVIEW' : resultStatus));

    top.appendChild(left);
    top.appendChild(resultBadge);

    const counts = document.createElement('div');
    counts.className = 'tdu-record-counts';
    appendTduTextSpan_(counts, '新增 ' + numberText_(record.inserted));
    appendTduTextSpan_(counts, '更新 ' + numberText_(record.updated));

    const note = document.createElement('div');
    note.className = 'tdu-record-note';
    if (failedCount > 0) {
      note.textContent = '有 ' + failedCount + ' 筆失敗，請點開查看。';
      item.classList.add('has-problem');
    } else if (reviewCount > 0) {
      note.textContent = '有 ' + reviewCount + ' 筆需要確認，請點開查看。';
      item.classList.add('has-review');
    } else if (!['SUCCESS', 'COMPLETED'].includes(resultStatus)) {
      note.textContent = '仍有資料待重試或需確認，請到「待處理資料」逐筆處理。';
      item.classList.add('has-review');
    } else {
      note.textContent = '更新正常，無需處理。';
    }

    item.appendChild(top);
    item.appendChild(counts);
    item.appendChild(note);

    item.addEventListener('click', function () {
      openTduDetail_(record);
    });

    list.appendChild(item);
  });
}

async function openTduDetail_(record) {
  const modal = document.getElementById('tduDetailModal');
  const body = document.getElementById('tduDetailBody');
  const sub = document.getElementById('tduDetailSub');

  if (!modal || !body) return;

  modal.hidden = false;
  document.body.classList.add('tdu-modal-open');
  body.replaceChildren(makeTduEmpty_('讀取詳細資料中…'));
  if (sub) sub.textContent = (record.sourceLabel || '') + '　' + (record.executedAt || '');

  try {
    const result = await callApi({
      action: 'taoDailyUpdateGetDetail',
      rowNumber: record.rowNumber,
      runId: record.runId || ''
    }, TDU_BACKGROUND_OPTIONS);

    renderTduDetail_(result);
  } catch (error) {
    body.replaceChildren(makeTduEmpty_(error && error.message ? error.message : '詳細資料讀取失敗。'));
  }
}


function closeTduDetail_() {
  const modal = document.getElementById('tduDetailModal');
  if (modal) modal.hidden = true;
  document.body.classList.remove('tdu-modal-open');
}


function renderTduDetail_(result) {
  const body = document.getElementById('tduDetailBody');
  if (!body) return;
  body.replaceChildren();

  if (!result || !result.success) {
    body.appendChild(makeTduEmpty_('找不到詳細資料。'));
    return;
  }

  const s = result.summary || {};
  const reviews = Array.isArray(result.reviews) ? result.reviews : [];
  const autoRetries = Array.isArray(result.autoRetries) ? result.autoRetries : [];
  const events = Array.isArray(result.externalEvents) ? result.externalEvents : [];
  const failedEvents = events.filter(function (event) {
    return !!String(event.error || '').trim() &&
      String(event.masterAction || '').toUpperCase() !== 'REVIEW_NOT_FOUND';
  });
  const reviewCount = Number(s.review || reviews.length || 0);
  const failedCount = Number(s.failed || failedEvents.length || 0);

  const summarySection = makeTduSection_('更新結果');
  const simple = document.createElement('div');
  simple.className = 'tdu-simple-summary';
  simple.appendChild(makeTduSummaryStat_('新增', numberText_(s.inserted)));
  simple.appendChild(makeTduSummaryStat_('更新', numberText_(s.updated)));
  simple.appendChild(makeTduSummaryStat_('待確認', numberText_(reviewCount), reviewCount > 0 ? 'review' : ''));
  simple.appendChild(makeTduSummaryStat_('失敗', numberText_(failedCount), failedCount > 0 ? 'failed' : ''));
  summarySection.appendChild(simple);

  const resultLine = document.createElement('div');
  const incomplete = autoRetries.length > 0 || !['SUCCESS', 'COMPLETED'].includes(String(s.result || '').toUpperCase());
  resultLine.className = failedCount > 0 ? 'tdu-action-summary is-failed' : (reviewCount > 0 || incomplete ? 'tdu-action-summary is-review' : 'tdu-action-summary is-ok');
  if (failedCount > 0) {
    resultLine.textContent = '有資料更新失敗，請看下方「需要處理」。';
  } else if (reviewCount > 0) {
    resultLine.textContent = '更新已完成，有 ' + reviewCount + ' 筆需要人工確認。';
  } else if (incomplete) {
    resultLine.textContent = '仍有資料待重試或狀態待確認，請到「待處理資料」逐筆處理。';
  } else {
    resultLine.textContent = '更新正常完成，沒有需要處理的問題。';
  }
  summarySection.appendChild(resultLine);
  body.appendChild(summarySection);

  if (autoRetries.length) {
    const retrySection = makeTduSection_('待重試');
    autoRetries.forEach(function (item) {
      retrySection.appendChild(makeTduIssueItem_([item.name || '未列姓名', item.memberId || ''].filter(Boolean).join('　'), item.note || item.reason || '完整資料尚未同步成功。', '待重試'));
    });
    body.appendChild(retrySection);
  }

  if (reviews.length || failedEvents.length) {
    const issueSection = makeTduSection_('需要處理');

    reviews.forEach(function (review) {
      const reason = tduFriendlyReviewReason_(review);
      issueSection.appendChild(makeTduIssueItem_(
        [review.name || '未列姓名', review.memberId || ''].filter(Boolean).join('　'),
        reason,
        '待確認'
      ));
    });

    failedEvents.forEach(function (event) {
      issueSection.appendChild(makeTduIssueItem_(
        [event.name || '未列姓名', event.memberId || ''].filter(Boolean).join('　'),
        event.error || '資料更新失敗，請協助確認。',
        '失敗'
      ));
    });

    const help = document.createElement('div');
    help.className = 'tdu-help-box';
    help.textContent = '這裡保留當次紀錄；請關閉明細，到「待處理資料」查看目前結果、逐筆重試或確認結案。';
    issueSection.appendChild(help);
    body.appendChild(issueSection);
  }

  const tech = document.createElement('details');
  tech.className = 'tdu-tech-details';
  const techSummary = document.createElement('summary');
  techSummary.textContent = '技術資料（平常不用看）';
  tech.appendChild(techSummary);

  const kv = document.createElement('div');
  kv.className = 'tdu-kv-list tdu-tech-kv';
  addTduKv_(kv, '更新時間', s.executedAt || '--');
  addTduKv_(kv, '更新方式', s.sourceLabel || '--');
  addTduKv_(kv, '查詢期間', joinDateRange_(s.startDate, s.endDate));
  addTduKv_(kv, '同步年度', s.affectedYears || '無');
  addTduKv_(kv, '結果', tduStatusLabel_(String(s.result || '').toUpperCase()));
  if (s.runId) addTduKv_(kv, 'Run ID', s.runId);
  tech.appendChild(kv);
  body.appendChild(tech);
}

function makeTduSummaryStat_(label, value, state) {
  const item = document.createElement('div');
  item.className = 'tdu-summary-stat' + (state ? ' is-' + state : '');

  const number = document.createElement('strong');
  number.textContent = value == null ? '0' : String(value);
  const text = document.createElement('span');
  text.textContent = label;

  item.appendChild(number);
  item.appendChild(text);
  return item;
}


function makeTduIssueItem_(titleText, messageText, badgeText) {
  const item = document.createElement('div');
  item.className = 'tdu-issue-item';

  const head = document.createElement('div');
  head.className = 'tdu-issue-head';

  const title = document.createElement('div');
  title.className = 'tdu-detail-item-title';
  title.textContent = titleText || '--';

  const badge = document.createElement('span');
  badge.className = badgeText === '失敗' ? 'tdu-issue-badge is-failed' : 'tdu-issue-badge is-review';
  badge.textContent = badgeText || '待確認';

  head.appendChild(title);
  head.appendChild(badge);

  const meta = document.createElement('div');
  meta.className = 'tdu-detail-item-meta';
  meta.textContent = messageText || '請人工確認。';

  item.appendChild(head);
  item.appendChild(meta);
  return item;
}


function tduFriendlyReviewReason_(review) {
  const text = [review.reason, review.feature, review.operation].filter(Boolean).join(' ');
  if (/REVIEW_NOT_FOUND|目前0筆|查詢0筆|查無/i.test(text)) {
    return '外部 TaoMembers 已依道親編號查無此人；正式主檔沒有自動刪除，請人工確認是否確實已刪除或移出。';
  }
  return review.reason || '這筆資料需要人工確認。';
}


function tduFriendlyCurrentMessage_(current) {
  const status = String(current.status || 'IDLE').toUpperCase();
  if (current.stale || current.recoveryNeeded || status === 'STALE') {
    return current.message || '上次更新未確認完成，可重新檢查；待處理資料仍保留。';
  }
  if (current.active) {
    return current.sourceLabel ? current.sourceLabel + '正在執行，完成後會自動更新紀錄。' : '資料更新正在執行。';
  }
  if (status === 'COMPLETED_WITH_REVIEW') {
    return '最近一次更新已完成，有資料需要人工確認；請到下方更新紀錄查看。';
  }
  if (status === 'FAILED' || status === 'ERROR') {
    return '最近一次更新失敗；請到下方更新紀錄查看問題。';
  }
  if (status === 'SUCCESS' || status === 'COMPLETED') {
    return '最近一次更新已正常完成，無需處理。';
  }
  if (status === 'IDLE') return '目前沒有資料更新作業。';
  return current.error || current.message || tduStatusDefaultMessage_(status);
}


function makeTduSection_(titleText) {
  const section = document.createElement('section');
  section.className = 'tdu-detail-section';
  const title = document.createElement('h3');
  title.textContent = titleText;
  section.appendChild(title);
  return section;
}


function makeTduDetailItem_(titleText, metaText) {
  const item = document.createElement('div');
  item.className = 'tdu-detail-item';

  const title = document.createElement('div');
  title.className = 'tdu-detail-item-title';
  title.textContent = titleText || '--';

  const meta = document.createElement('div');
  meta.className = 'tdu-detail-item-meta';
  meta.textContent = metaText || '';

  item.appendChild(title);
  item.appendChild(meta);
  return item;
}


function addTduKv_(parent, key, value) {
  const row = document.createElement('div');
  row.className = 'tdu-kv-row';

  const k = document.createElement('div');
  k.className = 'tdu-kv-key';
  k.textContent = key;

  const v = document.createElement('div');
  v.className = 'tdu-kv-value';
  v.textContent = value == null || value === '' ? '--' : String(value);

  row.appendChild(k);
  row.appendChild(v);
  parent.appendChild(row);
}


function makeTduEmpty_(text) {
  const el = document.createElement('div');
  el.className = 'tdu-empty';
  el.textContent = text || '';
  return el;
}


function appendTduTextSpan_(parent, text) {
  const span = document.createElement('span');
  span.textContent = text;
  parent.appendChild(span);
}


function renderTduPermissionDenied_() {
  const btn = document.getElementById('tduManualBtn');
  if (btn) btn.disabled = true;
  setTduActionMessage_('目前帳號沒有「每日資料更新」權限。', true);

  const badge = document.getElementById('tduStatusBadge');
  const message = document.getElementById('tduStatusMessage');
  if (badge) {
    badge.textContent = '無權限';
    setTduStatusClass_(badge, 'FAILED');
  }
  if (message) message.textContent = '請使用具 UPDATE_TAO_REPORT 權限的帳號。';
}


function renderTduLoadError_(text) {
  const badge = document.getElementById('tduStatusBadge');
  const message = document.getElementById('tduStatusMessage');
  if (badge) {
    badge.textContent = '讀取失敗';
    setTduStatusClass_(badge, 'FAILED');
  }
  if (message) message.textContent = text || '系統連線失敗。';
  setTduActionMessage_(text || '系統連線失敗。', true);
}


function setTduActionMessage_(text, isError) {
  const el = document.getElementById('tduActionMessage');
  if (!el) return;
  el.textContent = text || '';
  el.classList.toggle('is-error', !!isError);
}


function setTduManualButton_(btn, disabled, text) {
  if (!btn) return;
  btn.disabled = !!disabled;
  btn.textContent = text || '手動更新資料';
}


function updateTduPolling_(active) {
  if (!active) {
    stopTduPolling_();
    return;
  }
  if (tduPollTimer) return;

  tduPollTimer = window.setInterval(function () {
    loadTduStatusOnly_();
  }, TDU_POLL_MS);
}


function stopTduPolling_() {
  if (!tduPollTimer) return;
  window.clearInterval(tduPollTimer);
  tduPollTimer = null;
}


function setTduStatusClass_(el, status) {
  if (!el) return;
  el.classList.remove('is-success', 'is-running', 'is-review', 'is-failed');
  const s = String(status || '').toUpperCase();
  if (s === 'SUCCESS' || s === 'COMPLETED') el.classList.add('is-success');
  else if (s === 'RUNNING' || s === 'QUEUED' || s === 'WAITING') el.classList.add('is-running');
  else if (s === 'COMPLETED_WITH_REVIEW') el.classList.add('is-review');
  else if (s === 'FAILED' || s === 'ERROR') el.classList.add('is-failed');
}


function tduStatusLabel_(status) {
  const s = String(status || '').toUpperCase();
  if (s === 'SUCCESS') return '成功';
  if (s === 'COMPLETED') return '完成';
  if (s === 'COMPLETED_WITH_REVIEW') return '完成／待確認';
  if (s === 'RUNNING') return '更新中';
  if (s === 'QUEUED') return '已排程';
  if (s === 'WAITING') return '等待中';
  if (s === 'FAILED' || s === 'ERROR') return '失敗';
  if (s === 'IDLE' || !s) return '待命';
  if (s === 'STALE') return '需重新確認';
  return status || '待命';
}


function tduStatusDefaultMessage_(status) {
  const s = String(status || '').toUpperCase();
  if (s === 'IDLE') return '目前沒有資料更新作業。';
  if (s === 'SUCCESS' || s === 'COMPLETED') return '最近一次資料更新已完成。';
  if (s === 'RUNNING') return '資料更新正在執行。';
  return '';
}


function joinDateRange_(start, end) {
  if (start && end) return start + ' ～ ' + end;
  return start || end || '--';
}


function numberText_(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? String(n) : '0';
}
