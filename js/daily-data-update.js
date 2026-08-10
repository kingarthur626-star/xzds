/* 新莊區道務檢視｜每日資料更新 v1.0.0R1 */

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
    const results = await Promise.all([
      callApi({ action: 'taoDailyUpdateGetStatus' }),
      callApi({ action: 'taoDailyUpdateGetHistory', limit: 50 })
    ]);

    renderTduStatus_(results[0]);
    renderTduHistory_(results[1]);

    if (showMessage) {
      setTduActionMessage_('已重新整理。', false);
    }

    const current = results[0] && results[0].current ? results[0].current : {};
    updateTduPolling_(!!current.active);
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
    const result = await callApi({ action: 'taoDailyUpdateGetHistory', limit: 50 });
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
    if (message) message.textContent = result && result.message ? result.message : '無法讀取更新狀態。';
    if (btn) btn.disabled = true;
    return;
  }

  const current = result.current || {};
  const status = String(current.status || 'IDLE').toUpperCase();

  if (badge) {
    badge.textContent = tduStatusLabel_(status);
    setTduStatusClass_(badge, status);
  }

  if (source) {
    source.textContent = current.sourceLabel || '';
  }

  if (message) {
    message.textContent = current.error || current.message || tduStatusDefaultMessage_(status);
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
    list.appendChild(makeTduEmpty_(result && result.message ? result.message : '更新紀錄讀取失敗。'));
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

    const resultBadge = document.createElement('span');
    resultBadge.className = 'tdu-record-result';
    resultBadge.textContent = tduStatusLabel_(String(record.result || '').toUpperCase());
    setTduStatusClass_(resultBadge, String(record.result || '').toUpperCase());

    top.appendChild(left);
    top.appendChild(resultBadge);

    const counts = document.createElement('div');
    counts.className = 'tdu-record-counts';
    appendTduTextSpan_(counts, '新增 ' + numberText_(record.inserted));
    appendTduTextSpan_(counts, '更新 ' + numberText_(record.updated));
    appendTduTextSpan_(counts, '待確認 ' + numberText_(record.review));
    appendTduTextSpan_(counts, '失敗 ' + numberText_(record.failed));

    const note = document.createElement('div');
    note.className = 'tdu-record-note';
    if (Number(record.changeCount || 0) > 0) {
      note.textContent = '主檔實際變更 ' + numberText_(record.changeCount) + ' 筆；點選查看更新道親。';
    } else if (Number(record.newLogCount || 0) > 0) {
      note.textContent = '本次有外部異動通知，但主檔內容無新增／更新。';
    } else {
      note.textContent = '本次檢查沒有新的資料異動。';
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
    body.appendChild(makeTduEmpty_(result && result.message ? result.message : '找不到詳細資料。'));
    return;
  }

  const s = result.summary || {};
  const summarySection = makeTduSection_('執行摘要');
  const kv = document.createElement('div');
  kv.className = 'tdu-kv-list';
  addTduKv_(kv, '更新日期時間', s.executedAt || '--');
  addTduKv_(kv, '更新方式', s.sourceLabel || '--');
  addTduKv_(kv, '查詢期間', joinDateRange_(s.startDate, s.endDate));
  addTduKv_(kv, '外部新異動', numberText_(s.newLogCount) + ' 筆');
  addTduKv_(kv, '不重複道親', numberText_(s.memberCount) + ' 人');
  addTduKv_(kv, '主檔新增', numberText_(s.inserted) + ' 筆');
  addTduKv_(kv, '主檔更新', numberText_(s.updated) + ' 筆');
  addTduKv_(kv, '待確認', numberText_(s.review) + ' 筆');
  addTduKv_(kv, '失敗', numberText_(s.failed) + ' 筆');
  addTduKv_(kv, '同步年度', s.affectedYears || '無');
  addTduKv_(kv, '結果', tduStatusLabel_(String(s.result || '').toUpperCase()));
  if (s.runId) addTduKv_(kv, 'Run ID', s.runId);
  summarySection.appendChild(kv);
  body.appendChild(summarySection);

  const historical = Array.isArray(result.historical) ? result.historical : [];
  if (historical.length) {
    const h = historical[0];
    const section = makeTduSection_('1912～2020 歷史整合表');
    const hkv = document.createElement('div');
    hkv.className = 'tdu-kv-list';
    addTduKv_(hkv, '求道', '新增 ' + numberText_(h.receiveInserted) + '／更新 ' + numberText_(h.receiveUpdated) + '／移除 ' + numberText_(h.receiveRemoved));
    addTduKv_(hkv, '法會', '新增 ' + numberText_(h.seminarInserted) + '／更新 ' + numberText_(h.seminarUpdated) + '／移除 ' + numberText_(h.seminarRemoved));
    section.appendChild(hkv);
    body.appendChild(section);
  }

  const events = Array.isArray(result.externalEvents) ? result.externalEvents : [];
  const changes = Array.isArray(result.changes) ? result.changes : [];
  const changeByMember = {};
  changes.forEach(function (c) {
    const id = String(c.memberId || '').trim();
    if (id) changeByMember[id] = c;
  });

  if (events.length) {
    const section = makeTduSection_('本次處理的異動資料（' + events.length + '）');
    events.forEach(function (event) {
      const change = changeByMember[String(event.memberId || '').trim()] || {};
      const title = document.createElement('div');
      title.className = 'tdu-detail-item';

      const titleLine = document.createElement('div');
      titleLine.className = 'tdu-detail-item-title';
      titleLine.textContent = [event.name || '未列姓名', event.memberId || ''].filter(Boolean).join('　');

      const meta = document.createElement('div');
      meta.className = 'tdu-detail-item-meta';
      const lines = [];
      if (event.temple) lines.push('佛堂：' + event.temple);
      if (event.changeTime) lines.push('外部異動時間：' + event.changeTime);
      if (event.feature) lines.push('功能：' + event.feature);
      if (event.operation) lines.push('操作：' + event.operation);
      if (event.masterAction) lines.push('主檔動作：' + event.masterAction);
      if (change.changeType) lines.push('實際異動：' + change.changeType);
      if (event.exportFeature) lines.push('匯出來源：' + event.exportFeature);
      if (event.error) lines.push('錯誤：' + event.error);
      meta.textContent = lines.join('\n');
      meta.style.whiteSpace = 'pre-line';

      title.appendChild(titleLine);
      title.appendChild(meta);
      section.appendChild(title);
    });
    body.appendChild(section);
  } else if (changes.length) {
    const section = makeTduSection_('主檔實際異動（' + changes.length + '）');
    changes.forEach(function (change) {
      section.appendChild(makeTduDetailItem_(
        (change.memberId || '未列道親編號') + '　' + (change.changeType || ''),
        [change.changeTime, change.exportFeature, change.note].filter(Boolean).join('｜')
      ));
    });
    body.appendChild(section);
  }

  const reviews = Array.isArray(result.reviews) ? result.reviews : [];
  if (reviews.length) {
    const section = makeTduSection_('待確認（' + reviews.length + '）');
    reviews.forEach(function (review) {
      section.appendChild(makeTduDetailItem_(
        [review.name || '未列姓名', review.memberId || ''].filter(Boolean).join('　'),
        [review.temple, review.feature, review.operation, review.reason, review.status].filter(Boolean).join('｜')
      ));
    });
    body.appendChild(section);
  }

  if (!events.length && !changes.length && !reviews.length) {
    const section = makeTduSection_('異動資料');
    section.appendChild(makeTduEmpty_('本次沒有需要新增或更新的道親資料。'));
    body.appendChild(section);
  }

  if (s.message) {
    const section = makeTduSection_('系統訊息');
    section.appendChild(makeTduDetailItem_('執行結果', s.message));
    body.appendChild(section);
  }

  if (s.error) {
    const section = makeTduSection_('錯誤');
    section.appendChild(makeTduDetailItem_('錯誤內容', s.error));
    body.appendChild(section);
  }

  if (result.note) {
    const note = document.createElement('div');
    note.className = 'tdu-detail-note';
    note.textContent = result.note;
    body.appendChild(note);
  }
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
