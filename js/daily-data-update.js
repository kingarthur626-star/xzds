/* 新莊區道務檢視｜每日資料更新 v1.0.0R2｜簡潔管理版 */

const TDU_POLL_MS = 5000;
let tduPollTimer = null;
let tduRequestRunning = false;
let tduCanUpdate = false;


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

  try {
    const result = await callApi({ action: 'getMyPermissions' });
    const permissions = result && result.permissions ? result.permissions : {};
    tduCanUpdate = !!permissions.updateTaoReport;

    if (!result.success || !tduCanUpdate) {
      renderTduPermissionDenied_();
      return;
    }

    await loadTduAll_(false);
  } catch (error) {
    renderTduLoadError_(error && error.message ? error.message : '權限讀取失敗');
  }
}


async function loadTduAll_(showMessage) {
  if (!tduCanUpdate || tduRequestRunning) return;

  tduRequestRunning = true;
  try {
    // 狀態只讀取 Script Properties，必須先顯示；歷史紀錄改為背景載入。
    const statusResult = await callApi({ action: 'taoDailyUpdateGetStatus' });
    renderTduStatus_(statusResult);

    if (showMessage) {
      setTduActionMessage_('目前狀態已更新；更新紀錄載入中。', false);
    }

    const current = statusResult && statusResult.current ? statusResult.current : {};
    updateTduPolling_(!!current.active);
    loadTduHistoryOnly_();
  } catch (error) {
    renderTduLoadError_(error && error.message ? error.message : '資料讀取失敗');
  } finally {
    tduRequestRunning = false;
  }
}


async function loadTduStatusOnly_() {
  if (!tduCanUpdate || tduRequestRunning) return;

  tduRequestRunning = true;
  try {
    const result = await callApi({ action: 'taoDailyUpdateGetStatus' });
    renderTduStatus_(result);

    const current = result && result.current ? result.current : {};
    if (!current.active) {
      stopTduPolling_();
      await loadTduHistoryOnly_();
    }
  } catch (error) {
    setTduActionMessage_(error && error.message ? error.message : '狀態讀取失敗', true);
  } finally {
    tduRequestRunning = false;
  }
}


async function loadTduHistoryOnly_() {
  try {
    const result = await callApi({ action: 'taoDailyUpdateGetHistory', limit: 15 });
    renderTduHistory_(result);
  } catch (error) {
    setTduActionMessage_(error && error.message ? error.message : '更新紀錄讀取失敗', true);
  }
}


async function runTduManualUpdate_() {
  if (!tduCanUpdate || tduRequestRunning) return;

  const btn = document.getElementById('tduManualBtn');
  tduRequestRunning = true;
  setTduManualButton_(btn, true, '排程中…');
  setTduActionMessage_('正在排入手動更新…', false);

  try {
    const result = await callApi({ action: 'taoDailyUpdateRunManual' });

    if (!result.success) {
      setTduActionMessage_(result.message || '目前無法執行手動更新。', true);
      await loadTduAll_(false);
      return;
    }

    setTduActionMessage_('手動更新已排入背景執行，頁面可關閉。', false);
    updateTduPolling_(true);
  } catch (error) {
    setTduActionMessage_(error && error.message ? error.message : '手動更新排程失敗', true);
  } finally {
    tduRequestRunning = false;
    setTduManualButton_(btn, false, '手動更新資料');
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

  if (badge) {
    badge.textContent = tduStatusLabel_(status);
    setTduStatusClass_(badge, status);
  }

  if (source) source.textContent = current.sourceLabel || '';

  if (message) {
    message.textContent = tduFriendlyCurrentMessage_(current);
  }

  if (time) {
    const t = current.completedAt || current.updatedAt || current.startedAt || '';
    time.textContent = t ? '時間：' + t : '';
  }

  if (btn) {
    btn.disabled = !!current.active;
    btn.textContent = current.active ? '更新執行中…' : '手動更新資料';
  }
}

function renderTduHistory_(result) {
  const list = document.getElementById('tduHistoryList');
  if (!list) return;

  list.replaceChildren();

  if (!result || !result.success) {
    list.appendChild(makeTduEmpty_('更新紀錄讀取失敗。'));
    return;
  }

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
      : (reviewCount > 0 ? '待確認 ' + reviewCount : '完成');
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
    });

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
  resultLine.className = failedCount > 0 ? 'tdu-action-summary is-failed' : (reviewCount > 0 ? 'tdu-action-summary is-review' : 'tdu-action-summary is-ok');
  if (failedCount > 0) {
    resultLine.textContent = '有資料更新失敗，請看下方「需要處理」。';
  } else if (reviewCount > 0) {
    resultLine.textContent = '更新已完成，有 ' + reviewCount + ' 筆需要人工確認。';
  } else {
    resultLine.textContent = '更新正常完成，沒有需要處理的問題。';
  }
  summarySection.appendChild(resultLine);
  body.appendChild(summarySection);

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
    help.textContent = '有問題時，把這一段截圖給我即可，不需要提供全部更新明細。';
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
