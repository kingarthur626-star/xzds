/* =========================
程式名稱：tao-mobile-update-oneclick.js
版本：v0.3.0R2F1
功能說明：
手機道親資料更新「一鍵更新」獨立頁面前端。

安全原則：
1. 僅顯示後端允許的操作。
2. 實際權限、步驟順序與完成條件仍由 Apps Script 後端檢查。
3. 長時間作業只做背景排程，前端以狀態查詢追蹤。
4. 提供後端狀態機的一鍵到底；每一步仍須通過原安全閘門。
5. 暫時性錯誤由後端自動重試；不可恢復錯誤停止並顯示原因。
========================= */

const TAO_MOBILE_POLL_MS = 5000;


const TAO_MOBILE_ALL_ACTIONS = {
  start: 'taoMobileScheduleAll',
  resume: 'taoMobileResumeAll'
};

const TAO_MOBILE_BUTTON_TEXT = {
  audit: '執行完整稽核',
  master: '正式更新道親主檔',
  detail: '同步正式資料庫年度明細',
  annual: '檢查並更新年度統計'
};

let taoMobileStatus = null;
let taoMobilePollTimer = null;
let taoMobileRequestRunning = false;
let taoMobileDetailsOpen = false;

document.addEventListener('DOMContentLoaded', function () {
  const user = requireLogin();

  if (!user) return;

  bindTaoMobileButtons_();
  checkTaoMobilePermissionAndLoad_();
});

function bindTaoMobileButtons_() {
  const backBtn = document.getElementById('backHomeBtn');
  const refreshBtn = document.getElementById('refreshStatusBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const loadRangeBtn = document.getElementById('loadRangeBtn');
  const runAllBtn = document.getElementById('runAllBtn');
  const toggleDetailsBtn = document.getElementById('toggleDetailsBtn');

  if (backBtn) {
    backBtn.addEventListener('click', function () {
      location.href = 'home.html';
    });
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', function () {
      loadTaoMobileStatus_(true);
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', function () {
      logout();
    });
  }

  if (loadRangeBtn) {
    loadRangeBtn.addEventListener('click', function () {
      loadTaoMobileStatus_(true);
    });
  }

  if (runAllBtn) {
    runAllBtn.addEventListener('click', function () {
      scheduleTaoMobileAll_();
    });
  }

  if (toggleDetailsBtn) {
    toggleDetailsBtn.addEventListener('click', function () {
      taoMobileDetailsOpen = !taoMobileDetailsOpen;
      renderTaoMobileDetails_();
    });
  }
}

async function checkTaoMobilePermissionAndLoad_() {
  showTaoMobileMessage_('', '');

  try {
    const result = await callApi({
      action: 'getMyPermissions'
    });

    const permissions = result && result.permissions
      ? result.permissions
      : {};

    if (!result.success || !permissions.updateTaoReport) {
      showTaoMobileMessage_('您沒有道親資料更新權限。', 'error');

      setTimeout(function () {
        location.href = 'home.html';
      }, 1000);

      return;
    }

    await loadTaoMobileStatus_(false, true);

  } catch (error) {
    showTaoMobileMessage_(
      error && error.message
        ? error.message
        : '權限確認失敗，請重新登入。',
      'error'
    );
  }
}

async function loadTaoMobileStatus_(showLoading, useBackendRange) {
  if (taoMobileRequestRunning) return;

  const range = readTaoMobileRange_(!useBackendRange);

  if (!range && !useBackendRange) return;

  taoMobileRequestRunning = true;
  setTaoMobileControlsLoading_(true);

  if (showLoading) {
    showTaoMobileMessage_('正在讀取最新狀態...', 'success');
  }

  try {
    const payload = {
      action: 'taoMobileGetStatus'
    };

    if (range) {
      payload.startDate = range.startDate;
      payload.endDate = range.endDate;
    }

    const result = await callApi(payload);

    if (!result || !result.success) {
      throw new Error(
        result && result.message
          ? result.message
          : '讀取更新狀態失敗。'
      );
    }

    taoMobileStatus = result;
    applyBackendRangeToInputs_(result.range || result.controlRange || {});
    renderTaoMobileStatus_();

    if (showLoading) {
      showTaoMobileMessage_(taoMobileCurrentStateMessage_(), 'success');
    } else {
      showTaoMobileMessage_('', '');
    }

    updateTaoMobilePolling_();

  } catch (error) {
    showTaoMobileMessage_(
      error && error.message
        ? error.message
        : '系統連線失敗，請稍後再試。',
      'error'
    );

  } finally {
    taoMobileRequestRunning = false;
    setTaoMobileControlsLoading_(false);
  }
}

function readTaoMobileRange_(required) {
  const startInput = document.getElementById('startDateInput');
  const endInput = document.getElementById('endDateInput');

  const startDate = startInput ? String(startInput.value || '').trim() : '';
  const endDate = endInput ? String(endInput.value || '').trim() : '';

  if (!startDate || !endDate) {
    if (required) {
      showTaoMobileMessage_('請先輸入開始日期與結束日期。', 'error');
    }
    return null;
  }

  if (startDate > endDate) {
    showTaoMobileMessage_('開始日期不可晚於結束日期。', 'error');
    return null;
  }

  return {
    startDate: startDate,
    endDate: endDate
  };
}

function applyBackendRangeToInputs_(range) {
  const startInput = document.getElementById('startDateInput');
  const endInput = document.getElementById('endDateInput');

  if (startInput && range.startDate) {
    startInput.value = toHtmlDate_(range.startDate);
  }

  if (endInput && range.endDate) {
    endInput.value = toHtmlDate_(range.endDate);
  }
}

function renderTaoMobileStatus_() {
  if (!taoMobileStatus) return;

  renderTaoMobileOneClick_();
  renderTaoMobileOperation_();
  renderTaoMobileSteps_();
  renderTaoMobileDetails_();

  const generatedAt = document.getElementById('generatedAtText');
  const detailsBtn = document.getElementById('toggleDetailsBtn');

  if (generatedAt) {
    generatedAt.textContent = taoMobileStatus.generatedAt
      ? '狀態更新：' + taoMobileStatus.generatedAt
      : '';
  }

  if (detailsBtn) {
    detailsBtn.disabled = false;
  }
}


function renderTaoMobileOneClick_() {
  const banner = document.getElementById('oneClickBanner');
  const statusText = document.getElementById('oneClickStatusText');
  const progressText = document.getElementById('oneClickProgressText');
  const progressBar = document.getElementById('oneClickProgressBar');
  const stepText = document.getElementById('oneClickStepText');
  const errorText = document.getElementById('oneClickErrorText');
  const runAllBtn = document.getElementById('runAllBtn');
  const hint = document.getElementById('oneClickHint');

  if (!taoMobileStatus) return;

  const oneClick = taoMobileStatus.oneClick || {};
  const progress = Math.max(0, Math.min(4, Number(oneClick.progress || 0)));
  const active = Boolean(oneClick.active);
  const failed = String(oneClick.status || '').toUpperCase() === 'ERROR';
  const completed = Boolean(oneClick.alreadyCompleted) ||
    String(oneClick.status || '').toUpperCase() === 'SUCCESS';
  // 一鍵頁永遠顯示單一總狀態，避免使用者不知道是否已啟動。
  const visible = true;

  if (banner) {
    banner.hidden = !visible;
    banner.className = 'tao-mobile-oneclick-banner';
    if (active) banner.classList.add('running');
    if (failed) banner.classList.add('error');
    if (completed) banner.classList.add('success');
  }

  if (statusText) {
    statusText.textContent = oneClick.lastMessage || oneClick.message ||
      (active
        ? '一鍵更新正在背景執行，請勿重複按。'
        : failed
          ? '一鍵更新已停止，請查看錯誤原因。'
          : completed
            ? '此期間第1～第4步已全部完成。'
            : '尚未開始；確認日期後只需按一次。');
  }

  if (progressText) {
    progressText.textContent = progress + '／4';
  }

  if (progressBar) {
    progressBar.style.width = (progress * 25) + '%';
  }

  if (stepText) {
    stepText.textContent = completed
      ? '第1～第4步全部完成，不需再按'
      : active
        ? ('目前執行：' + (oneClick.currentStepLabel || '背景處理中'))
        : failed
          ? '流程已停止，可在修正後安全續跑'
          : '目前尚未開始';
  }

  if (errorText) {
    errorText.hidden = !oneClick.lastError;
    errorText.textContent = oneClick.lastError || '';
  }

  if (runAllBtn) {
    if (oneClick.canResume) {
      runAllBtn.textContent = '從失敗步驟繼續';
      runAllBtn.disabled = taoMobileRequestRunning;
      runAllBtn.dataset.mode = 'resume';
    } else if (active) {
      runAllBtn.textContent = '執行中，請勿重複按';
      runAllBtn.disabled = true;
      runAllBtn.dataset.mode = 'active';
    } else if (completed) {
      runAllBtn.textContent = '此期間已全部完成';
      runAllBtn.disabled = true;
      runAllBtn.dataset.mode = 'completed';
    } else {
      runAllBtn.textContent = '按一次開始自動更新';
      runAllBtn.disabled = !oneClick.canStart || taoMobileRequestRunning;
      runAllBtn.dataset.mode = 'start';
    }
  }

  if (hint) {
    hint.textContent = failed
      ? '修正錯誤後按「從失敗步驟繼續」；已完成步驟不會重跑。'
      : active
        ? '系統正在背景執行，請勿再次按；手機可關閉。'
        : completed
          ? '此期間已完成，不需再按。'
          : '確認期間後只按一次；啟動後按鈕會自動鎖定。';
  }
}


function renderTaoMobileOperation_() {
  const banner = document.getElementById('operationBanner');
  const title = document.getElementById('operationTitle');
  const text = document.getElementById('operationText');

  if (!banner || !title || !text || !taoMobileStatus) return;

  const operation = taoMobileStatus.operation || {};
  const busy = taoMobileStatus.backendBusy !== undefined
    ? Boolean(taoMobileStatus.backendBusy)
    : Boolean(taoMobileStatus.busy);
  const hasError = String(operation.status || '').toUpperCase() === 'ERROR';

  if (!busy && !hasError && !operation.lastMessage && !operation.lastError) {
    banner.hidden = true;
    return;
  }

  banner.hidden = false;
  banner.className = 'tao-mobile-operation-banner';

  if (hasError || operation.lastError) {
    banner.classList.add('error');
  } else if (busy) {
    banner.classList.add('running');
  } else {
    banner.classList.add('success');
  }

  title.textContent = operation.label || operation.step || '目前作業';
  text.textContent = [
    operation.status || '',
    operation.lastMessage || '',
    operation.lastError || ''
  ].filter(Boolean).join('｜');
}

function renderTaoMobileSteps_() {
  const list = document.getElementById('stepList');

  if (!list || !taoMobileStatus) return;

  const steps = taoMobileStatus.steps || {};
  const keys = ['audit', 'master', 'detail', 'annual'];

  list.innerHTML = keys.map(function (key) {
    return createTaoMobileStepHtml_(key, steps[key] || {});
  }).join('');
}

function createTaoMobileStepHtml_(key, step) {
  const status = String(step.status || 'LOCKED').toUpperCase();
  const statusClass = taoMobileStatusClass_(status);
  const reason = step.reason || taoMobileDefaultReason_(status);
  const metrics = formatTaoMobileMetrics_(key, step.metrics || {});

  return '' +
    '<article class="tao-mobile-step-card ' + statusClass + '">' +
      '<div class="tao-mobile-step-head">' +
        '<div class="tao-mobile-step-number">' + escapeHtml(step.number || '') + '</div>' +
        '<div class="tao-mobile-step-heading">' +
          '<h2>' + escapeHtml(step.title || '') + '</h2>' +
          '<div class="tao-mobile-step-reason">' + escapeHtml(reason) + '</div>' +
        '</div>' +
        '<div class="tao-mobile-status-badge ' + statusClass + '">' +
          escapeHtml(taoMobileStatusText_(status)) +
        '</div>' +
      '</div>' +
      (metrics
        ? '<div class="tao-mobile-step-metrics">' + metrics + '</div>'
        : '') +
      '<div class="tao-mobile-step-readonly">由一鍵流程自動執行</div>' +
    '</article>';
}

function formatTaoMobileMetrics_(key, metrics) {
  const items = [];

  if (key === 'audit') {
    items.push(['網站筆數', metrics.site]);
    items.push(['解析筆數', metrics.parsed]);
    items.push(['空白編號', metrics.blankMemberId]);
    items.push(['稽核時間', metrics.time]);
  }

  if (key === 'master') {
    items.push(['總人數', metrics.total]);
    items.push(['完成', metrics.done]);
    items.push(['待確認', metrics.review]);
    items.push(['待處理', metrics.pending]);
    items.push(['失敗', metrics.failed]);
    items.push([
      '年度',
      Array.isArray(metrics.affectedYears)
        ? metrics.affectedYears.join('、')
        : ''
    ]);
  }

  if (key === 'detail') {
    const receive = metrics.receive || {};
    const seminar = metrics.seminar || {};

    items.push(['求道寫入', receive.writtenRows]);
    items.push(['法會寫入', seminar.writtenRows]);
    items.push(['完成時間', metrics.completedAt]);
  }

  if (key === 'annual') {
    const totals = metrics.currentMonthTotals || {};

    items.push(['月結月份', metrics.closedMonths]);
    items.push(['本月', metrics.currentMonth]);
    items.push(['本月求道', totals.receive]);
    items.push(['本月法會', totals.seminar]);
    items.push(['完成時間', metrics.completedAt]);
  }

  return items
    .filter(function (item) {
      return item[1] !== undefined && item[1] !== null && item[1] !== '';
    })
    .map(function (item) {
      return '' +
        '<div class="tao-mobile-metric">' +
          '<span>' + escapeHtml(item[0]) + '</span>' +
          '<strong>' + escapeHtml(item[1]) + '</strong>' +
        '</div>';
    })
    .join('');
}


async function scheduleTaoMobileAll_() {
  if (taoMobileRequestRunning) return;

  const range = readTaoMobileRange_(true);
  const oneClick = taoMobileStatus && taoMobileStatus.oneClick
    ? taoMobileStatus.oneClick
    : {};

  if (!range) return;

  const resume = Boolean(oneClick.canResume);
  const action = resume
    ? TAO_MOBILE_ALL_ACTIONS.resume
    : TAO_MOBILE_ALL_ACTIONS.start;

  if (!resume && !oneClick.canStart) {
    showTaoMobileMessage_('目前不能啟動一鍵流程，請先重新整理狀態。', 'error');
    return;
  }

  const confirmed = confirm(
    (resume ? '確認從失敗步驟繼續？' : '確認一鍵執行第1～第4步？') + '\n' +
    '期間：' + range.startDate + ' ～ ' + range.endDate + '\n\n' +
    '系統會在背景依序驗證與執行；手機可以關閉。'
  );

  if (!confirmed) return;

  taoMobileRequestRunning = true;

  const runAllBtn = document.getElementById('runAllBtn');
  if (runAllBtn) {
    runAllBtn.disabled = true;
    runAllBtn.textContent = resume
      ? '正在啟動安全續跑，請勿重複按'
      : '正在啟動，請勿重複按';
  }

  setTaoMobileControlsLoading_(true);
  showTaoMobileMessage_(
    resume
      ? '正在啟動安全續跑，請勿重複按。'
      : '正在啟動一鍵流程，請勿重複按。',
    'success'
  );

  try {
    const result = await callApi({
      action: action,
      startDate: range.startDate,
      endDate: range.endDate
    });

    if (!result || !result.success) {
      throw new Error(
        result && result.message
          ? result.message
          : '一鍵流程啟動失敗。'
      );
    }

    taoMobileStatus = result.status || taoMobileStatus;
    renderTaoMobileStatus_();
    showTaoMobileMessage_(
      result.message || '一鍵流程已啟動，系統會自動追蹤進度。',
      'success'
    );
    updateTaoMobilePolling_();

  } catch (error) {
    showTaoMobileMessage_(
      error && error.message
        ? error.message
        : '一鍵流程啟動失敗，請稍後再試。',
      'error'
    );

  } finally {
    taoMobileRequestRunning = false;
    setTaoMobileControlsLoading_(false);
  }
}


function renderTaoMobileDetails_() {
  const panel = document.getElementById('detailsPanel');
  const content = document.getElementById('detailsContent');
  const button = document.getElementById('toggleDetailsBtn');

  if (!panel || !content || !button) return;

  panel.hidden = !taoMobileDetailsOpen;
  button.textContent = taoMobileDetailsOpen
    ? '收合進度與結果'
    : '查看進度與結果';

  if (!taoMobileDetailsOpen || !taoMobileStatus) return;

  const range = taoMobileStatus.range || {};
  const queue = taoMobileStatus.queue || {};
  const state = taoMobileStatus.state || {};
  const operation = taoMobileStatus.operation || {};
  const versions = taoMobileStatus.backendVersions || {};
  const completion = taoMobileStatus.periodCompletion || {};

  const rows = [
    ['查詢期間', joinRange_(range)],
    ['目前是否執行中', taoMobileStatus.busy ? '是' : '否'],
    ['主檔狀態', state.status || 'IDLE'],
    ['主檔階段', state.stage || '—'],
    ['Audit ID', state.auditId || '—'],
    ['Job ID', state.jobId || '—'],
    ['佇列總數', queue.total],
    ['DONE', queue.done],
    ['REVIEW', queue.review],
    ['PENDING', queue.pending],
    ['FAILED', queue.failed],
    ['年度明細狀態', state.annualSyncStatus || '—'],
    ['影響年度', Array.isArray(state.affectedYears) ? state.affectedYears.join('、') : '—'],
    ['目前作業', operation.label || operation.step || '無'],
    ['作業狀態', operation.status || 'IDLE'],
    ['最後訊息', operation.lastMessage || '—'],
    ['最後錯誤', operation.lastError || '—'],
    ['主檔完成', completion.masterCompleted ? '是' : '否'],
    ['正式明細完成', completion.detailCompleted ? '是' : '否'],
    ['年度統計完成', completion.annualCompleted ? '是' : '否'],
    ['一鍵流程狀態', (taoMobileStatus.oneClick || {}).status || 'IDLE'],
    ['一鍵目前步驟', (taoMobileStatus.oneClick || {}).currentStepLabel || '—'],
    ['一鍵完成進度', ((taoMobileStatus.oneClick || {}).progress || 0) + '／4'],
    ['一鍵最後訊息', (taoMobileStatus.oneClick || {}).lastMessage || '—'],
    ['一鍵最後錯誤', (taoMobileStatus.oneClick || {}).lastError || '—'],
    ['管理中心版本', versions.manager || taoMobileStatus.version || '—'],
    ['主檔更新版本', versions.updater || '—'],
    ['正式明細版本', versions.detailSync || '—'],
    ['月報版本', versions.monthlyClose || '—']
  ];

  content.innerHTML = rows.map(function (row) {
    const value = row[1] === undefined || row[1] === null || row[1] === ''
      ? '0'
      : row[1];

    return '' +
      '<div class="tao-mobile-detail-row">' +
        '<span>' + escapeHtml(row[0]) + '</span>' +
        '<strong>' + escapeHtml(value) + '</strong>' +
      '</div>';
  }).join('');
}

function updateTaoMobilePolling_() {
  stopTaoMobilePolling_();

  const oneClick = taoMobileStatus && taoMobileStatus.oneClick
    ? taoMobileStatus.oneClick
    : {};

  if (!taoMobileStatus || (!taoMobileStatus.busy && !oneClick.active)) return;

  taoMobilePollTimer = setTimeout(function () {
    loadTaoMobileStatus_(false);
  }, TAO_MOBILE_POLL_MS);
}

function stopTaoMobilePolling_() {
  if (taoMobilePollTimer) {
    clearTimeout(taoMobilePollTimer);
    taoMobilePollTimer = null;
  }
}

function setTaoMobileControlsLoading_(loading) {
  const refreshBtn = document.getElementById('refreshStatusBtn');
  const loadRangeBtn = document.getElementById('loadRangeBtn');
  const runAllBtn = document.getElementById('runAllBtn');
  const startInput = document.getElementById('startDateInput');
  const endInput = document.getElementById('endDateInput');

  const oneClick = taoMobileStatus && taoMobileStatus.oneClick
    ? taoMobileStatus.oneClick
    : {};
  const busy = Boolean(taoMobileStatus && taoMobileStatus.busy);
  const lockRange = loading || busy || Boolean(oneClick.active);

  if (refreshBtn) {
    refreshBtn.disabled = loading;
    refreshBtn.textContent = loading ? '讀取中...' : '重新整理';
  }

  if (loadRangeBtn) {
    loadRangeBtn.disabled = loading || busy || Boolean(oneClick.active);
  }

  if (runAllBtn && loading) {
    runAllBtn.disabled = true;
  }

  if (startInput) {
    startInput.disabled = lockRange;
  }

  if (endInput) {
    endInput.disabled = lockRange;
  }

  if (taoMobileStatus) {
    renderTaoMobileOneClick_();
    renderTaoMobileSteps_();
  }
}



/**
 * 依後端一鍵狀態產生單一、明確的使用者提示。
 */
function taoMobileCurrentStateMessage_() {
  const oneClick = taoMobileStatus && taoMobileStatus.oneClick
    ? taoMobileStatus.oneClick
    : {};
  const status = String(oneClick.status || '').toUpperCase();

  if (oneClick.active) {
    return '一鍵更新正在執行，請勿重複按；手機可關閉。';
  }

  if (status === 'ERROR') {
    return '一鍵更新已停止，請查看錯誤原因。';
  }

  if (oneClick.alreadyCompleted || status === 'SUCCESS') {
    return '此期間第1～第4步已全部完成，不需再按。';
  }

  return '此期間尚未開始；確認日期後按一次即可。';
}

function showTaoMobileMessage_(text, type) {
  const element = document.getElementById('taoMobileMessage');

  if (!element) return;

  element.textContent = text || '';
  element.className = 'message';

  if (!text) {
    element.style.display = 'none';
    return;
  }

  element.classList.add(type === 'success' ? 'success' : 'error');
  element.style.display = 'block';
}

function taoMobileStatusClass_(status) {
  const normalized = String(status || '').toUpperCase();

  if (
    normalized === 'SUCCESS' ||
    normalized === 'COMPLETED' ||
    normalized === 'AUDIT_PASS'
  ) {
    return 'success';
  }

  if (
    normalized === 'ERROR' ||
    normalized === 'FAILED' ||
    normalized.indexOf('BLOCKED') >= 0
  ) {
    return 'error';
  }

  if (
    normalized === 'RUNNING' ||
    normalized === 'SCHEDULED' ||
    normalized === 'MONITORING' ||
    normalized.indexOf('WAITING') === 0 ||
    normalized === 'BACKGROUND_RUNNING' ||
    normalized === 'FINALIZING'
  ) {
    return 'running';
  }

  return 'locked';
}

function taoMobileStatusText_(status) {
  const map = {
    AUDIT_PASS: '已通過',
    COMPLETED: '已完成',
    SUCCESS: '已完成',
    AVAILABLE: '可查看',
    LOCKED: '尚未開放',
    IDLE: '待執行',
    READY: '待執行',
    SCHEDULED: '已排程',
    RUNNING: '執行中',
    BACKGROUND_RUNNING: '背景執行中',
    MONITORING: '追蹤中',
    WAITING_CONTINUE: '等待續跑',
    WAITING_RETRY: '等待重試',
    WAITING_LOCK: '等待鎖定',
    FINALIZING: '最後驗證中',
    ERROR: '失敗',
    FAILED: '失敗'
  };

  return map[status] || status || '未知';
}

function taoMobileDefaultReason_(status) {
  if (status === 'LOCKED') return '請依序完成前一步驟';
  if (status === 'IDLE') return '尚未執行';
  return '';
}

function joinRange_(range) {
  if (!range || !range.startDate || !range.endDate) return '—';
  return range.startDate + ' ～ ' + range.endDate;
}

function toHtmlDate_(value) {
  return String(value || '').trim().replace(/\//g, '-');
}
