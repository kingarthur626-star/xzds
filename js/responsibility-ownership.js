/* =========================
程式名稱：responsibility-ownership.js
功能：
1. 顯示「責任點傳師 忠字班道務歸屬」唯讀資料。
2. 以後端回傳的 Excel D 欄正式佛堂名稱為唯一對應鍵。
3. 每間佛堂顯示求道／法會兩列；同時僅可展開一間佛堂。
4. 達成率採綠、黃、紅與 10 格比例圖。
========================= */

let responsibilityCurrentData_ = null;
let responsibilityExpandedTempleKey_ = '';
let responsibilityRequestSerial_ = 0;

document.addEventListener('DOMContentLoaded', function () {
  const user = requireLogin();
  if (!user) return;

  bindResponsibilityActions_();
  loadResponsibilityOwnership_(0);
});

function bindResponsibilityActions_() {
  const logoutButton = document.getElementById('responsibilityLogoutBtn');
  const homeButton = document.getElementById('responsibilityHomeBtn');
  const reloadButton = document.getElementById('responsibilityReloadBtn');
  const monthSelect = document.getElementById('responsibilityMonthSelect');
  const groupSelect = document.getElementById('responsibilityGroupSelect');
  const groups = document.getElementById('responsibilityGroups');

  if (logoutButton) {
    logoutButton.addEventListener('click', function () { logout(); });
  }

  if (homeButton) {
    homeButton.addEventListener('click', function () { location.href = 'home.html'; });
  }

  if (reloadButton) {
    reloadButton.addEventListener('click', function () {
      loadResponsibilityOwnership_(getResponsibilitySelectedMonth_());
    });
  }

  if (monthSelect) {
    monthSelect.addEventListener('change', function () {
      loadResponsibilityOwnership_(getResponsibilitySelectedMonth_());
    });
  }

  if (groups) {
    groups.addEventListener('click', function (event) {
      const exportButton = event.target.closest('[data-responsibility-export]');
      if (exportButton && groups.contains(exportButton)) {
        const selectedGroups = getResponsibilityVisibleGroups_(responsibilityCurrentData_);
        const group = selectedGroups[Number(exportButton.dataset.responsibilityExport)];
        if (group && window.ResponsibilityShare) {
          window.ResponsibilityShare.open(group, responsibilityCurrentData_, getResponsibilitySelectedGroup_(), exportButton);
        }
        return;
      }
      const button = event.target.closest('[data-responsibility-temple-key]');
      if (!button || !groups.contains(button)) return;
      toggleResponsibilityTemple_(String(button.dataset.responsibilityTempleKey || ''));
    });

    // 原生 button 自動支援 Enter／空白鍵，避免重複觸發。
  }

  if (groupSelect) {
    groupSelect.addEventListener('change', function () {
      if (window.ResponsibilityShare) window.ResponsibilityShare.close();
      responsibilityExpandedTempleKey_ = '';
      if (responsibilityCurrentData_) renderResponsibilityOwnership_(responsibilityCurrentData_);
    });
  }
}

async function loadResponsibilityOwnership_(requestedMonth) {
  if (window.ResponsibilityShare) window.ResponsibilityShare.close();
  const serial = ++responsibilityRequestSerial_;
  const month = normalizeResponsibilityMonth_(requestedMonth);
  // 僅保留此頁記憶體中的同月份資料，不將跨壇責任資料寫入瀏覽器儲存空間。
  const cached = responsibilityCurrentData_ &&
    (!month || responsibilityCurrentData_.month === month) ? responsibilityCurrentData_ : null;

  if (cached) {
    responsibilityCurrentData_ = cached;
    responsibilityExpandedTempleKey_ = '';
    syncResponsibilityMonth_(cached);
    renderResponsibilityOwnership_(cached);
    setResponsibilityWarning_('目前先顯示上次成功資料，正在重新確認最新資料…');
  } else {
    // 清除不同月份的記憶體資料，避免讀取期間切換組別重畫舊月份。
    responsibilityCurrentData_ = null;
    responsibilityExpandedTempleKey_ = '';
    setResponsibilityLoading_(true);
    setResponsibilityError_('');
    setResponsibilityWarning_('');
    document.getElementById('responsibilityGroups').innerHTML = '';
  }

  try {
    const payload = { action: 'getResponsibilityOwnership' };
    if (month) payload.month = month;

    const result = await callApi(payload, {
      timeoutMs: 12000,
      retryTimeoutMs: 15000,
      maxAttempts: 3,
      onRetry: function () {
        if (serial === responsibilityRequestSerial_) {
          setResponsibilityWarning_('第一次連線未完成，正在自動重新確認…');
        }
      }
    });

    if (serial !== responsibilityRequestSerial_) return;
    if (!result || !result.success || !Array.isArray(result.groups)) {
      const failure = new Error(result && result.message ? result.message : '責任公壇資料讀取失敗');
      failure.serverRejected = true;
      throw failure;
    }

    responsibilityCurrentData_ = result;
    responsibilityExpandedTempleKey_ = '';
    syncResponsibilityMonth_(result);
    renderResponsibilityOwnership_(result);
    setResponsibilityError_('');
    setResponsibilityWarning_(buildResponsibilityWarning_(result));

  } catch (error) {
    if (serial !== responsibilityRequestSerial_) return;

    if (error && (error.serverRejected || error.code === 'AUTH_REQUIRED')) {
      responsibilityCurrentData_ = null;
      document.getElementById('responsibilityGroups').innerHTML = '';
      setResponsibilityWarning_('');
      setResponsibilityError_(error.message);
    } else if (cached) {
      responsibilityCurrentData_ = cached;
      renderResponsibilityOwnership_(cached);
      setResponsibilityWarning_('連線暫時不穩，目前顯示上次成功資料；稍後可再重新讀取。');
    } else {
      const message = String(error && error.message ? error.message : '系統連線失敗，請稍後再試');
      setResponsibilityError_(
        message === '未知的操作'
          ? '後端尚未啟用責任公壇資料 API，請完成 Apps Script 發布後再試。'
          : message
      );
    }
  } finally {
    if (serial === responsibilityRequestSerial_) {
      setResponsibilityLoading_(false);
    }
  }
}

function renderResponsibilityOwnership_(data) {
  const area = document.getElementById('responsibilityGroups');
  const subtitle = document.getElementById('responsibilitySubtitle');
  if (!area) return;

  const groups = getResponsibilityVisibleGroups_(data);
  const month = Number(data && data.month || 0);

  if (subtitle) {
    subtitle.textContent = (data && data.year ? data.year + ' 年 ' : '') +
      (month ? month + ' 月資料' : '年度資料') +
      '｜' + getResponsibilityGroupLabel_(getResponsibilitySelectedGroup_()) + '・' + groups.length + ' 個責任區塊';
  }

  if (!groups.length) {
    area.innerHTML = '<div class="responsibility-message">目前沒有可顯示的責任公壇資料。</div>';
    return;
  }

  area.innerHTML = groups.map(function (group, index) {
    return buildResponsibilityGroupHtml_(group, month, index);
  }).join('');
}

function getResponsibilitySelectedGroup_() {
  const select = document.getElementById('responsibilityGroupSelect');
  return select && /^[123]$/.test(select.value) ? select.value : '1';
}

function getResponsibilityGroupLabel_(value) {
  return ({ '1': '第一組', '2': '第二組', '3': '第三組' })[value] || '第一組';
}

function getResponsibilityVisibleGroups_(data) {
  const selected = getResponsibilitySelectedGroup_();
  return (Array.isArray(data && data.groups) ? data.groups : []).map(function (group) {
    const temples = (Array.isArray(group.temples) ? group.temples : []).filter(function (temple) {
      // 只依正式名稱的數字組別篩選，不猜測姓名或別名，也不修改後端資料。
      const match = /^([123])[A-Z]_/.exec(String(temple.formalTempleName || '').trim());
      return match && match[1] === selected;
    });
    return Object.assign({}, group, { temples: temples });
  }).filter(function (group) { return group.temples.length > 0; });
}

function buildResponsibilityGroupHtml_(group, month, index) {
  const temples = Array.isArray(group && group.temples) ? group.temples : [];
  return (
    '<section class="responsibility-group">' +
      '<div class="responsibility-group-head">' +
        '<span>責任點傳師：' + escapeResponsibilityHtml_(group.responsibleTransmitter || '—') + '</span>' +
        '<span>責任忠字班：' + escapeResponsibilityHtml_(group.responsibleZhongZiClass || '—') + '</span>' +
      '</div>' +
      '<div class="responsibility-group-gap" aria-hidden="true"></div>' +
      buildResponsibilityTableHeadHtml_(month) +
      temples.map(function (temple) { return buildResponsibilityTempleHtml_(temple); }).join('') +
      '<div class="responsibility-group-actions"><button type="button" data-responsibility-export="' + index +
        '" aria-label="產生' + escapeResponsibilityAttribute_(group.responsibleZhongZiClass || '此責任區塊') +
        '的分享圖片">圖片分享／下載</button></div>' +
    '</section>'
  );
}

function buildResponsibilityTableHeadHtml_(month) {
  return (
    '<div class="responsibility-table-head">' +
      '<span>佛堂</span><span>類別</span><span>去年<br>實績</span><span>年度<br>目標</span>' +
      '<span>' + escapeResponsibilityHtml_(month ? month + '月' : '本月') + '</span><span>本年<br>累計</span><span>達成率</span>' +
    '</div>'
  );
}

function buildResponsibilityTempleHtml_(temple) {
  const key = String(temple && temple.templeKey || '');
  const expanded = key && key === responsibilityExpandedTempleKey_;
  const metrics = Array.isArray(temple && temple.metrics) ? temple.metrics : [];
  const qiu = metrics[0] || {};
  const fahui = metrics[1] || {};
  const templeName = escapeResponsibilityHtml_(temple && temple.formalTempleName || '—');

  return (
    '<article class="responsibility-temple' + (expanded ? ' is-expanded' : '') + '">' +
      '<button class="responsibility-temple-toggle" type="button" data-responsibility-temple-key="' +
        escapeResponsibilityAttribute_(key) + '" aria-expanded="' + (expanded ? 'true' : 'false') +
        '" aria-label="展開 ' + templeName + ' 的責任資料">' +
        '<span class="responsibility-temple-name"><span>' + templeName + '</span><b class="responsibility-chevron" aria-hidden="true">⌄</b></span>' +
        buildResponsibilityMetricRowHtml_(qiu) +
        buildResponsibilityMetricRowHtml_(fahui) +
      '</button>' +
      (expanded ? buildResponsibilityDetailHtml_(temple) : '') +
    '</article>'
  );
}

function buildResponsibilityMetricRowHtml_(metric) {
  const tone = getResponsibilityTone_(metric && metric.ratePercent);
  return (
    '<div class="responsibility-metric-row">' +
      '<span class="temple" aria-hidden="true"></span>' +
      '<span class="category">' + escapeResponsibilityHtml_(metric && metric.category || '—') + '</span>' +
      '<span class="number">' + formatResponsibilityNumber_(metric && metric.previousActual) + '</span>' +
      '<span class="number">' + formatResponsibilityNumber_(metric && metric.annualTarget) + '</span>' +
      '<span class="number">' + formatResponsibilityNumber_(metric && metric.monthValue) + '</span>' +
      '<span class="number">' + formatResponsibilityNumber_(metric && metric.cumulative) + '</span>' +
      '<span class="responsibility-rate ' + tone + '"><strong>' +
        formatResponsibilityNumber_(metric && metric.ratePercent) + (metric.ratePercent == null ? '' : '%') + '</strong>' +
        buildResponsibilitySegmentTrackHtml_(metric && metric.ratePercent, tone) +
      '</span>' +
    '</div>'
  );
}

function buildResponsibilityDetailHtml_(temple) {
  return (
    '<div class="responsibility-detail">' +
      '<span>五常德：<b>' + escapeResponsibilityHtml_(temple && temple.virtue || '—') + '</b></span>' +
      '<span>講師：<b>' + formatResponsibilityNumber_(temple && temple.lecturers) + '</b></span>' +
      '<span>在職壇主：<b>' + formatResponsibilityNumber_(temple && temple.activeAltarMasters) + '</b></span>' +
      '<span>在職副壇主：<b>' + formatResponsibilityNumber_(temple && temple.activeViceAltarMasters) + '</b></span>' +
    '</div>'
  );
}

function toggleResponsibilityTemple_(templeKey) {
  if (!templeKey || !responsibilityCurrentData_) return;
  responsibilityExpandedTempleKey_ = responsibilityExpandedTempleKey_ === templeKey ? '' : templeKey;
  renderResponsibilityOwnership_(responsibilityCurrentData_);
  const buttons = document.querySelectorAll('[data-responsibility-temple-key]');
  Array.from(buttons).find(function (button) {
    if (button.dataset.responsibilityTempleKey !== templeKey) return false;
    button.focus({ preventScroll: true });
    return true;
  });
}

function getResponsibilityTone_(ratePercent) {
  const rate = Number(ratePercent);
  if (Number.isFinite(rate) && rate >= 70) return 'green';
  if (Number.isFinite(rate) && rate >= 50) return 'yellow';
  return 'red';
}

function getResponsibilityProgressSegments_(ratePercent) {
  const rate = Number(ratePercent);
  if (!Number.isFinite(rate) || rate <= 0) return 0;
  return Math.min(10, Math.ceil(rate / 10));
}

function buildResponsibilitySegmentTrackHtml_(ratePercent, tone) {
  const activeCount = getResponsibilityProgressSegments_(ratePercent);
  let segments = '';
  for (let index = 1; index <= 10; index += 1) {
    segments += '<b' + (index <= activeCount ? ' class="active"' : '') + '></b>';
  }
  return '<span class="responsibility-segments ' + tone + '" aria-hidden="true">' + segments + '</span>';
}

function buildResponsibilityWarning_(data) {
  const unmatched = Array.isArray(data && data.unmatchedTemples) ? data.unmatchedTemples : [];
  if (!unmatched.length) return '';
  return '有 ' + unmatched.length + ' 間佛堂尚待核對今年月報資料；未取得的數字以「—」顯示。';
}

function setResponsibilityLoading_(loading) {
  const area = document.getElementById('responsibilityLoading');
  if (!area) return;
  area.hidden = !loading;
}

function setResponsibilityError_(message) {
  const area = document.getElementById('responsibilityError');
  if (!area) return;
  area.textContent = message || '';
  area.hidden = !message;
}

function setResponsibilityWarning_(message) {
  const area = document.getElementById('responsibilityWarning');
  if (!area) return;
  area.textContent = message || '';
  area.hidden = !message;
}

function getResponsibilitySelectedMonth_() {
  const select = document.getElementById('responsibilityMonthSelect');
  return normalizeResponsibilityMonth_(select && select.value);
}

function syncResponsibilityMonth_(data) {
  const select = document.getElementById('responsibilityMonthSelect');
  if (!select) return;
  const sourceMonth = normalizeResponsibilityMonth_(data && (data.sourceMonth || data.month)) || 1;
  const selectedMonth = normalizeResponsibilityMonth_(data && data.month) || sourceMonth;
  Array.from(select.options).forEach(function (option) {
    option.disabled = Number(option.value) > sourceMonth;
  });
  select.value = String(selectedMonth);
}

function normalizeResponsibilityMonth_(value) {
  const month = Number(value || 0);
  return Number.isInteger(month) && month >= 1 && month <= 12 ? month : 0;
}

function formatResponsibilityNumber_(value) {
  if (value === null || value === undefined) return '—';
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.round(number).toLocaleString('zh-TW') : '0';
}

function escapeResponsibilityHtml_(value) {
  return String(value === undefined || value === null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeResponsibilityAttribute_(value) {
  return escapeResponsibilityHtml_(value).replace(/`/g, '&#096;');
}
