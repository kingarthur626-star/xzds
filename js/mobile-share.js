/**
 * 程式名稱：mobile-share.js
 * 功能說明：
 * 1. 讀取三大組月報 API。
 * 2. 月份切換時，重新向後端讀取該月達成與 1～該月累計。
 * 3. 動態顯示「月份成果＋壇數」，並在明細中段重複表頭。
 * 4. 達成率顯示 10 格進度條，並產生完整 PNG 分享。
 * 5. 點選任一佛堂列，可展開該佛堂 1～目前選定月份的逐月求道／法會數字。
 * 6. 月份數字為 0 時不顯示；壇名順序由後端依「即時道務統計」C欄排列。
 *
 * 版本：v1.0.0R13
 * 最後更新：2026/08/10
 */

const MOBILE_SHARE_STORAGE_KEY = 'XZDS_MOBILE_SHARE_REPORT_KEY';
const MOBILE_SHARE_MONTH_STORAGE_KEY = 'XZDS_MOBILE_SHARE_MONTH';
const MOBILE_SHARE_REPORT_KEYS = ['qiu1', 'qiu2', 'qiu3', 'fa1', 'fa2', 'fa3'];
const MOBILE_SHARE_CACHE_PREFIX = 'XZDS_MOBILE_SHARE_CACHE_v2:';

let mobileShareCurrentReport_ = null;
let mobileShareCurrentUser_ = null;
let mobileShareRequestSerial_ = 0;
let mobileShareExpandedDetailIndex_ = -1;


document.addEventListener('DOMContentLoaded', function () {
  const user = requireLogin();
  if (!user) return;

  mobileShareCurrentUser_ = user;
  initMobileSharePage_(user);
});


/**
 * 功能：初始化頁面、事件與預設分組。
 */
function initMobileSharePage_(user) {
  const select = document.getElementById('mobileShareReportSelect');

  bindMobileShareEvents_();

  const savedKey = localStorage.getItem(MOBILE_SHARE_STORAGE_KEY);
  const defaultKey = MOBILE_SHARE_REPORT_KEYS.includes(savedKey)
    ? savedKey
    : inferMobileShareDefaultKey_(user);

  if (select) {
    select.value = defaultKey;
  }

  const savedMonth = Number(
    localStorage.getItem(MOBILE_SHARE_MONTH_STORAGE_KEY) || 0
  );

  loadMobileShareReport_(
    defaultKey,
    Number.isInteger(savedMonth) && savedMonth >= 1 && savedMonth <= 12
      ? savedMonth
      : 0,
    false
  );
}


/**
 * 功能：綁定首頁、登出、月份、報表、重新讀取及分享事件。
 */
function bindMobileShareEvents_() {
  const homeBtn = document.getElementById('mobileShareHomeBtn');
  const logoutBtn = document.getElementById('mobileShareLogoutBtn');
  const summaryBtn = document.getElementById('mobileShareSummaryBtn');
  const reportSelect = document.getElementById('mobileShareReportSelect');
  const monthSelect = document.getElementById('mobileShareTargetMonthSelect');
  const reloadBtn = document.getElementById('mobileShareReloadBtn');
  const shareBtn = document.getElementById('mobileShareLineBtn');
  const detailRows = document.getElementById('mobileShareDetailRows');

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

  if (summaryBtn) {
    summaryBtn.addEventListener('click', function () {
      location.href = 'mobile-share-summary.html';
    });
  }

  if (reportSelect) {
    reportSelect.addEventListener('change', function () {
      localStorage.setItem(MOBILE_SHARE_STORAGE_KEY, reportSelect.value);
      const selectedMonth = monthSelect ? Number(monthSelect.value) : 0;
      loadMobileShareReport_(reportSelect.value, selectedMonth, true);
    });
  }

  if (monthSelect) {
    monthSelect.addEventListener('change', function () {
      const key = reportSelect ? reportSelect.value : 'qiu1';
      loadMobileShareReport_(key, Number(monthSelect.value), true);
    });
  }

  if (reloadBtn) {
    reloadBtn.addEventListener('click', function () {
      const key = reportSelect ? reportSelect.value : 'qiu1';
      const selectedMonth = monthSelect ? Number(monthSelect.value) : 0;
      loadMobileShareReport_(key, selectedMonth, true);
    });
  }

  if (shareBtn) {
    shareBtn.addEventListener('click', shareMobileReportImage_);
  }

  if (detailRows) {
    detailRows.addEventListener('click', function (event) {
      const row = event.target.closest('.mobile-share-detail-row-expandable');
      if (!row || !detailRows.contains(row)) return;
      toggleMobileShareMonthlyDetail_(Number(row.dataset.detailIndex));
    });

    detailRows.addEventListener('keydown', function (event) {
      const row = event.target.closest('.mobile-share-detail-row-expandable');
      if (!row || !detailRows.contains(row)) return;
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      toggleMobileShareMonthlyDetail_(Number(row.dataset.detailIndex));
    });
  }
}


/**
 * 功能：依登入者壇名開頭推測第一個預設組別。
 */
function inferMobileShareDefaultKey_(user) {
  const temple = String(user && user.temple ? user.temple : '').trim();
  const match = temple.match(/^([123])/);
  const groupNo = match ? match[1] : '1';
  return 'qiu' + groupNo;
}


/**
 * 功能：從後端讀取選定報表與月份。
 *
 * selectedMonth：
 * - 0：由後端採用目前正式月報月份。
 * - 1～12：讀取該月達成及 1～該月累計。
 */
async function loadMobileShareReport_(reportKey, selectedMonth, preserveReport) {
  const serial = ++mobileShareRequestSerial_;
  const month = Number(selectedMonth);
  const normalizedMonth = Number.isInteger(month) && month >= 1 && month <= 12
    ? month
    : 0;

  const currentMatches = mobileShareCurrentReport_ &&
    mobileShareReportMatchesRequest_(mobileShareCurrentReport_, reportKey, normalizedMonth);
  const cached = readMobileShareCache_(reportKey, normalizedMonth);

  if (!currentMatches && cached && cached.report) {
    mobileShareCurrentReport_ = cached.report;
    mobileShareExpandedDetailIndex_ = -1;
    syncMobileShareMonthOptions_(cached.report);
    renderMobileShareReport_(cached.report);
    showMobileShareError_('正在重新確認最新資料…', 'warning');
  } else {
    setMobileShareLoading_(true, Boolean(currentMatches));
    showMobileShareError_('', '');
  }

  const payload = {
    action: 'getMobileShareReport',
    reportKey: reportKey
  };

  if (normalizedMonth) {
    payload.month = normalizedMonth;
  }

  try {
    const result = await callApi(payload, {
      timeoutMs: 12000,
      retryTimeoutMs: 15000,
      maxAttempts: 3,
      onRetry: function () {
        if (serial !== mobileShareRequestSerial_) return;
        showMobileShareError_('第一次連線未完成，正在自動重新確認…', 'warning');
      }
    });

    if (serial !== mobileShareRequestSerial_) return;

    if (!result.success || !result.report) {
      throw new Error(result.message || '報表讀取失敗');
    }

    mobileShareCurrentReport_ = result.report;
    mobileShareExpandedDetailIndex_ = -1;
    writeMobileShareCache_(reportKey, normalizedMonth, result.report);
    syncMobileShareMonthOptions_(result.report);
    renderMobileShareReport_(result.report);
    showMobileShareError_('', '');

  } catch (error) {
    if (serial !== mobileShareRequestSerial_) return;

    const fallback = (
      mobileShareCurrentReport_ &&
      mobileShareReportMatchesRequest_(mobileShareCurrentReport_, reportKey, normalizedMonth)
    )
      ? { report: mobileShareCurrentReport_ }
      : (cached || readMobileShareCache_(reportKey, normalizedMonth));

    if (fallback && fallback.report) {
      mobileShareCurrentReport_ = fallback.report;
      mobileShareExpandedDetailIndex_ = -1;
      syncMobileShareMonthOptions_(fallback.report);
      renderMobileShareReport_(fallback.report);
      showMobileShareError_(
        '連線暫時不穩，目前顯示上次成功資料；稍後可再重新整理。',
        'warning'
      );
    } else {
      mobileShareCurrentReport_ = null;
      const message = String(
        error && error.message
          ? error.message
          : '系統連線失敗，請稍後再試'
      );

      showMobileShareError_(
        message === '未知的操作'
          ? '後端尚未啟用三大組月報 API，請更新 Apps Script 正式部署。'
          : message,
        'error'
      );
    }

  } finally {
    if (serial === mobileShareRequestSerial_) {
      setMobileShareLoading_(false, true);
    }
  }
}


function mobileShareReportMatchesRequest_(report, reportKey, month) {
  if (!report) return false;

  const expectedCategory = String(reportKey || '').indexOf('fa') === 0 ? '法會' : '求道';
  const expectedGroup = Number(String(reportKey || '').replace(/\D/g, '') || 0);
  const reportMonth = Number(report.month || report.sourceMonth || 0);

  if (String(report.category || '') !== expectedCategory) return false;
  if (Number(report.groupNo || 0) !== expectedGroup) return false;
  if (month && reportMonth !== month) return false;

  return true;
}


function mobileShareCacheKey_(reportKey, month) {
  return MOBILE_SHARE_CACHE_PREFIX + String(reportKey || '') + ':' + String(month || 'auto');
}


function readMobileShareCache_(reportKey, month) {
  try {
    const raw = localStorage.getItem(mobileShareCacheKey_(reportKey, month));
    const data = raw ? JSON.parse(raw) : null;
    return data && data.report ? data : null;
  } catch (ignore) {
    return null;
  }
}


function writeMobileShareCache_(reportKey, requestedMonth, report) {
  try {
    const payload = JSON.stringify({
      savedAt: Date.now(),
      report: report
    });

    localStorage.setItem(
      mobileShareCacheKey_(reportKey, requestedMonth),
      payload
    );

    const actualMonth = Number(report && report.month || 0);
    if (actualMonth >= 1 && actualMonth <= 12) {
      localStorage.setItem(
        mobileShareCacheKey_(reportKey, actualMonth),
        payload
      );
    }

    localStorage.setItem(
      mobileShareCacheKey_(reportKey, 0),
      payload
    );
  } catch (ignore) {}
}


/**
 * 功能：月份預設為來源月報月份，未來月份禁止選取。
 */
function syncMobileShareMonthOptions_(report) {
  const select = document.getElementById('mobileShareTargetMonthSelect');
  if (!select) return;

  const sourceMonth = Number(report.sourceMonth || report.month || 1);
  const selectedMonth = Number(report.month || sourceMonth);

  Array.from(select.options).forEach(function (option) {
    option.disabled = Number(option.value) > sourceMonth;
  });

  select.value = String(selectedMonth);
  localStorage.setItem(
    MOBILE_SHARE_MONTH_STORAGE_KEY,
    String(selectedMonth)
  );
}


/**
 * 功能：將後端回傳資料渲染到手機畫面。
 */
function renderMobileShareReport_(report) {
  const reportArea = document.getElementById('mobileShareReport');
  const targetBadge = document.getElementById('mobileShareTargetBadge');
  const statusCard = document.getElementById('mobileShareStatusCard');

  setText_('mobileShareTempleCount', formatMobileShareNumber_(report.templeCount) + '壇');
  setText_('mobileShareTitle', report.title);
  setText_('mobileShareMonthCardLabel', report.monthColumnLabel + '達成');
  setText_('mobileShareCumulativeCardLabel', report.cumulativeLabel);
  setText_('mobileShareDetailMonthLabel', report.monthColumnLabel);
  setText_('mobileShareSummaryTarget', formatMobileShareNumber_(report.summary.target));
  setText_('mobileShareSummaryMonth', formatMobileShareNumber_(report.summary.monthValue));
  setText_('mobileShareSummaryCumulative', formatMobileShareNumber_(report.summary.cumulative));
  setText_('mobileShareSummaryRate', formatMobileShareNumber_(report.summary.ratePercent) + '%');
  setText_('mobileShareStatusLabel', report.summary.statusLabel);
  setText_('mobileShareStatusValue', report.summary.statusValue);

  if (targetBadge) {
    targetBadge.textContent = '目標 ' + report.monthTargetPercent + '%';
  }

  if (statusCard) {
    statusCard.classList.remove('green', 'red');
    statusCard.classList.add(
      report.summary.statusTone === 'green'
        ? 'green'
        : 'red'
    );
  }

  renderMobileShareDetailRows_(
    report.details || [],
    report.monthColumnLabel,
    report
  );

  if (reportArea) {
    reportArea.hidden = false;
  }
}


/**
 * 功能：建立欄位表頭。
 */
function buildMobileShareDetailHeaderHtml_(monthLabel, repeat) {
  return (
    '<div class="mobile-share-detail-head' +
      (repeat ? ' mobile-share-detail-head-repeat' : '') +
    '">' +
      '<span>壇名</span>' +
      '<span>目標</span>' +
      '<span>' + escapeHtml(monthLabel) + '</span>' +
      '<span>累計</span>' +
      '<span>達成率</span>' +
    '</div>'
  );
}


/**
 * 功能：顯示壇名明細與三色達成率；資料中段重複一次表頭。
 */
function renderMobileShareDetailRows_(details, monthLabel, report) {
  const area = document.getElementById('mobileShareDetailRows');
  if (!area) return;

  if (!details.length) {
    area.innerHTML = '<div class="mobile-share-message">沒有壇名明細</div>';
    return;
  }

  const middleIndex = Math.ceil(details.length / 2);
  const parts = [];

  details.forEach(function (item, index) {
    if (index === middleIndex) {
      parts.push(
        buildMobileShareDetailHeaderHtml_(monthLabel, true)
      );
    }

    const tone = ['green', 'yellow', 'red'].includes(item.tone)
      ? item.tone
      : 'red';

    parts.push(
      '<div class="mobile-share-detail-row mobile-share-detail-row-expandable"' +
        ' role="button" tabindex="0" aria-expanded="false"' +
        ' aria-label="展開 ' + escapeHtml(item.temple) + ' 各月明細"' +
        ' data-detail-index="' + index + '">' +
        '<span class="mobile-share-temple-cell" title="' + escapeHtml(item.temple) + '">' +
          '<span class="mobile-share-temple-name">' +
            escapeHtml(item.temple) +
          '</span>' +
          '<b class="mobile-share-expand-chevron" aria-hidden="true">⌄</b>' +
        '</span>' +
        '<span>' + formatMobileShareNumber_(item.target) + '</span>' +
        '<span>' + formatMobileShareMonthValue_(item.monthValue) + '</span>' +
        '<span>' + formatMobileShareNumber_(item.cumulative) + '</span>' +
        '<span class="mobile-share-rate-cell ' + tone + '">' +
          '<span class="rate-number">' +
            formatMobileShareNumber_(item.ratePercent) + '%' +
          '</span>' +
          buildMobileShareSegmentTrackHtml_(item.ratePercent) +
        '</span>' +
      '</div>' +
      buildMobileShareMonthlyPanelHtml_(item, index, report)
    );
  });

  area.innerHTML = parts.join('');
}


/**
 * 功能：建立單一佛堂逐月明細面板。
 * 顯示範圍固定為 1 月到目前上方選定月份，避免把未來月份 0 誤認為實際成果。
 */
function buildMobileShareMonthlyPanelHtml_(item, index, report) {
  const selectedMonth = Number(report && report.month ? report.month : 0);
  const category = String(report && report.category ? report.category : '');
  const monthlyValues = Array.isArray(item.monthlyValues)
    ? item.monthlyValues.filter(function (entry) {
        const month = Number(entry && entry.month);
        const value = Number(entry && entry.value ? entry.value : 0);
        return month >= 1 && month <= selectedMonth && value !== 0;
      })
    : [];

  if (!monthlyValues.length) {
    return (
      '<div class="mobile-share-monthly-panel" data-monthly-index="' + index + '" hidden>' +
        '<div class="mobile-share-monthly-empty">1–' + selectedMonth + '月沒有' + escapeHtml(category) + '紀錄</div>' +
      '</div>'
    );
  }

  const cells = monthlyValues.map(function (entry) {
    const month = Number(entry.month);
    const selectedClass = month === selectedMonth ? ' is-selected' : '';
    return (
      '<div class="mobile-share-monthly-cell' + selectedClass + '">' +
        '<span>' + month + '月</span>' +
        '<strong>' + formatMobileShareNumber_(entry.value) + '</strong>' +
      '</div>'
    );
  }).join('');

  return (
    '<div class="mobile-share-monthly-panel" data-monthly-index="' + index + '" hidden>' +
      '<div class="mobile-share-monthly-title">' +
        escapeHtml(item.temple) + '｜1–' + selectedMonth + '月 ' + escapeHtml(category) +
      '</div>' +
      '<div class="mobile-share-monthly-grid">' + cells + '</div>' +
      '<div class="mobile-share-monthly-total">' +
        '1–' + selectedMonth + '月累計 ' + formatMobileShareNumber_(item.cumulative) +
      '</div>' +
    '</div>'
  );
}


/**
 * 功能：一次只展開一間佛堂；再次點同一列即收合。
 */
function toggleMobileShareMonthlyDetail_(index) {
  if (!Number.isInteger(index) || index < 0) return;

  const area = document.getElementById('mobileShareDetailRows');
  if (!area) return;

  const rows = area.querySelectorAll('.mobile-share-detail-row-expandable');
  const panels = area.querySelectorAll('.mobile-share-monthly-panel');
  const shouldClose = mobileShareExpandedDetailIndex_ === index;

  rows.forEach(function (row) {
    row.classList.remove('is-expanded');
    row.setAttribute('aria-expanded', 'false');
  });

  panels.forEach(function (panel) {
    panel.hidden = true;
  });

  if (shouldClose) {
    mobileShareExpandedDetailIndex_ = -1;
    return;
  }

  const targetRow = area.querySelector(
    '.mobile-share-detail-row-expandable[data-detail-index="' + index + '"]'
  );
  const targetPanel = area.querySelector(
    '.mobile-share-monthly-panel[data-monthly-index="' + index + '"]'
  );

  if (!targetRow || !targetPanel) {
    mobileShareExpandedDetailIndex_ = -1;
    return;
  }

  targetRow.classList.add('is-expanded');
  targetRow.setAttribute('aria-expanded', 'true');
  targetPanel.hidden = false;
  mobileShareExpandedDetailIndex_ = index;
}


/**
 * 功能：依達成率換算 10 格進度條。
 * 規則：10%以下1格、11～20%為2格，100%以上固定10格。
 */
function getMobileShareProgressSegments_(ratePercent) {
  const rate = Number(ratePercent);

  if (!Number.isFinite(rate) || rate <= 10) {
    return 1;
  }

  return Math.min(10, Math.ceil(rate / 10));
}


/**
 * 功能：建立畫面用 10 格進度條 HTML。
 */
function buildMobileShareSegmentTrackHtml_(ratePercent) {
  const activeCount = getMobileShareProgressSegments_(ratePercent);
  let segments = '';

  for (let index = 1; index <= 10; index += 1) {
    segments += '<b' + (index <= activeCount ? ' class="active"' : '') + '></b>';
  }

  return '<span class="mobile-share-mini-track" aria-hidden="true">' + segments + '</span>';
}


/**
 * 功能：建立完整成果 PNG，優先使用手機 Web Share 分享。
 */
async function shareMobileReportImage_() {
  if (!mobileShareCurrentReport_) {
    alert('請先完成報表讀取。');
    return;
  }

  const button = document.getElementById('mobileShareLineBtn');
  setMobileShareButtonLoading_(button, true);

  try {
    const blob = await buildMobileSharePngBlob_(mobileShareCurrentReport_);
    const fileName = buildMobileShareFileName_(mobileShareCurrentReport_);
    const file = new File([blob], fileName, { type: 'image/png' });

    if (
      navigator.share &&
      navigator.canShare &&
      navigator.canShare({ files: [file] })
    ) {
      await navigator.share({
        title: mobileShareCurrentReport_.title,
        text:
          mobileShareCurrentReport_.label +
          '｜' +
          mobileShareCurrentReport_.title,
        files: [file]
      });
      return;
    }

    downloadMobileShareBlob_(blob, fileName);
    alert('此瀏覽器未支援直接分享檔案，已下載 PNG；請從照片或檔案分享到 LINE。');

  } catch (error) {
    if (error && error.name === 'AbortError') return;
    alert(error.message || '成果圖片產生失敗。');

  } finally {
    setMobileShareButtonLoading_(button, false);
  }
}


/**
 * 功能：建立與手機畫面一致的高解析 PNG Blob。
 */
function buildMobileSharePngBlob_(report) {
  const width = 1080;
  const padding = 54;
  const rowHeight = 70;
  const detailCount = (report.details || []).length;
  const repeatHeaderHeight = detailCount > 1 ? 60 : 0;
  const tableY = 480;
  const headerHeight = 60;
  const contentBottom =
    tableY +
    headerHeight +
    detailCount * rowHeight +
    repeatHeaderHeight;
  const height = contentBottom + 118;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return Promise.reject(
      new Error('瀏覽器無法建立圖片畫布。')
    );
  }

  drawMobileShareCanvas_(ctx, canvas, report, padding, rowHeight);

  return new Promise(function (resolve, reject) {
    canvas.toBlob(function (blob) {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('PNG 轉換失敗。'));
      }
    }, 'image/png', 0.96);
  });
}


/**
 * 功能：在 Canvas 繪製完整成果圖片。
 */
function drawMobileShareCanvas_(ctx, canvas, report, padding, rowHeight) {
  const width = canvas.width;
  const summary = report.summary;
  const details = report.details || [];
  const colors = {
    blue: '#1559d6',
    purple: '#7b2fc4',
    green: '#0b8f2d',
    yellow: '#f39a00',
    red: '#e11515',
    ink: '#15243a',
    muted: '#66768b',
    line: '#dce3ec',
    light: '#f3f6fa'
  };

  ctx.fillStyle = '#f5f7fb';
  ctx.fillRect(0, 0, width, canvas.height);

  drawCanvasRoundRect_(
    ctx,
    28,
    28,
    width - 56,
    canvas.height - 56,
    34,
    '#ffffff',
    '#dfe5ed'
  );

  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillStyle = colors.ink;
  ctx.font =
    '900 52px "Microsoft JhengHei", "Noto Sans TC", sans-serif';
  ctx.fillText(
    report.title + '  ' + report.templeCount + '壇',
    width / 2,
    88
  );

  /* 標題下方保留約兩行空間，讓 LINE 圖片更舒展。 */
  const controlY = 188;
  const controlGap = 14;
  const monthWidth = 245;
  const targetWidth = 230;
  const reportWidth = width - padding * 2 - monthWidth - targetWidth - controlGap * 2;

  drawCanvasRoundRect_(
    ctx,
    padding,
    controlY,
    monthWidth,
    70,
    18,
    '#ffffff',
    '#cbd5e1'
  );
  ctx.fillStyle = colors.ink;
  ctx.font =
    '900 36px "Microsoft JhengHei", "Noto Sans TC", sans-serif';
  ctx.fillText(report.month + '月', padding + monthWidth / 2, controlY + 35);

  drawCanvasPill_(
    ctx,
    padding + monthWidth + controlGap,
    controlY,
    targetWidth,
    70,
    '目標 ' + report.monthTargetPercent + '%',
    colors.green
  );

  const reportX = padding + monthWidth + controlGap + targetWidth + controlGap;
  drawCanvasRoundRect_(
    ctx,
    reportX,
    controlY,
    reportWidth,
    70,
    18,
    '#ffffff',
    '#cbd5e1'
  );
  ctx.fillStyle = colors.ink;
  ctx.font =
    '850 28px "Microsoft JhengHei", "Noto Sans TC", sans-serif';
  ctx.fillText(report.label, reportX + reportWidth / 2, controlY + 35);

  const cardY = 292;
  const cardGap = 12;
  const cardWidth =
    (width - padding * 2 - cardGap * 4) / 5;
  const cardHeight = 154;
  const cards = [
    { label: '目標', value: summary.target, tone: 'purple' },
    { label: report.monthColumnLabel + '達成', value: summary.monthValue, tone: 'purple' },
    { label: report.cumulativeLabel, value: summary.cumulative, tone: 'purple' },
    { label: '實際達成率', value: summary.ratePercent + '%', tone: 'purple' },
    { label: summary.statusLabel, value: summary.statusValue, tone: summary.statusTone }
  ];

  cards.forEach(function (card, index) {
    const x = padding + index * (cardWidth + cardGap);
    const toneColor = card.tone === 'green'
      ? colors.green
      : card.tone === 'red'
        ? colors.red
        : colors.purple;

    drawCanvasRoundRect_(ctx, x, cardY, cardWidth, cardHeight, 18, '#ffffff', colors.line);
    ctx.fillStyle = toneColor;
    ctx.fillRect(x + 1, cardY + 1, cardWidth - 2, 5);

    ctx.textAlign = 'center';
    ctx.fillStyle = card.tone === 'green' || card.tone === 'red' ? toneColor : colors.ink;
    ctx.font = '800 22px "Microsoft JhengHei", "Noto Sans TC", sans-serif';
    drawCanvasWrappedText_(ctx, String(card.label), x + cardWidth / 2, cardY + 42, cardWidth - 14, 25, 2);

    ctx.fillStyle = toneColor;
    ctx.font = '900 41px "Microsoft JhengHei", "Noto Sans TC", sans-serif';
    ctx.fillText(String(card.value), x + cardWidth / 2, cardY + 112);
  });

  const tableX = padding;
  const tableY = 480;
  const tableWidth = width - padding * 2;
  const headerHeight = 60;
  const col = {
    temple: tableX + tableWidth * 0.16,
    target: tableX + tableWidth * 0.37,
    month: tableX + tableWidth * 0.47,
    cumulative: tableX + tableWidth * 0.57,
    rateHeader: tableX + tableWidth * 0.82,
    rateText: tableX + tableWidth * 0.69,
    progressX: tableX + tableWidth * 0.76,
    progressWidth: tableWidth * 0.21
  };

  function drawHeader_(y, repeat) {
    drawCanvasRoundRect_(
      ctx,
      tableX,
      y,
      tableWidth,
      headerHeight,
      repeat ? 0 : 16,
      repeat ? '#eef3f9' : colors.light,
      colors.line
    );

    ctx.fillStyle = colors.ink;
    ctx.font = '900 26px "Microsoft JhengHei", "Noto Sans TC", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('壇名', col.temple, y + headerHeight / 2);
    ctx.fillText('目標', col.target, y + headerHeight / 2);
    ctx.fillText(report.monthColumnLabel, col.month, y + headerHeight / 2);
    ctx.fillText('累計', col.cumulative, y + headerHeight / 2);
    ctx.fillText('達成率', col.rateHeader, y + headerHeight / 2);
  }

  drawHeader_(tableY, false);

  let rowY = tableY + headerHeight;
  const middleIndex = Math.ceil(details.length / 2);

  details.forEach(function (item, index) {
    if (index === middleIndex) {
      drawHeader_(rowY, true);
      rowY += headerHeight;
    }

    const background = index % 2 === 0 ? '#ffffff' : '#fbfcfe';
    drawCanvasRoundRect_(ctx, tableX, rowY, tableWidth, rowHeight, 0, background, colors.line);

    ctx.fillStyle = colors.ink;
    ctx.font = '800 27px "Microsoft JhengHei", "Noto Sans TC", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(
      truncateCanvasText_(ctx, item.temple, tableWidth * 0.29),
      col.temple,
      rowY + rowHeight / 2
    );

    ctx.font = '700 26px "Microsoft JhengHei", "Noto Sans TC", sans-serif';
    ctx.fillText(String(item.target), col.target, rowY + rowHeight / 2);
    ctx.fillText(formatMobileShareMonthValue_(item.monthValue), col.month, rowY + rowHeight / 2);
    ctx.fillText(String(item.cumulative), col.cumulative, rowY + rowHeight / 2);

    const toneColor = item.tone === 'green'
      ? colors.green
      : item.tone === 'yellow'
        ? colors.yellow
        : colors.red;

    ctx.fillStyle = toneColor;
    ctx.font = '900 27px "Microsoft JhengHei", "Noto Sans TC", sans-serif';
    ctx.fillText(item.ratePercent + '%', col.rateText, rowY + rowHeight / 2);

    drawCanvasProgress_(
      ctx,
      col.progressX,
      rowY + rowHeight / 2 - 7,
      col.progressWidth,
      14,
      toneColor,
      item.ratePercent
    );

    rowY += rowHeight;
  });

  ctx.fillStyle = colors.muted;
  ctx.font = '600 22px "Microsoft JhengHei", "Noto Sans TC", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(
    '綠：達標　黃：差距 10% 以內　紅：落後超過 10%',
    width / 2,
    rowY + 50
  );
}


/**
 * 功能：Canvas 圓角矩形。
 */
function drawCanvasRoundRect_(
  ctx,
  x,
  y,
  width,
  height,
  radius,
  fill,
  stroke
) {
  const r = Math.max(
    0,
    Math.min(radius, width / 2, height / 2)
  );

  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(
    x + width,
    y,
    x + width,
    y + r
  );
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(
    x + width,
    y + height,
    x + width - r,
    y + height
  );
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(
    x,
    y + height,
    x,
    y + height - r
  );
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();

  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }

  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}


/**
 * 功能：Canvas 目標膠囊。
 */
function drawCanvasPill_(
  ctx,
  x,
  y,
  width,
  height,
  text,
  color
) {
  drawCanvasRoundRect_(
    ctx,
    x,
    y,
    width,
    height,
    height / 2,
    color,
    null
  );

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.font =
    '900 29px "Microsoft JhengHei", "Noto Sans TC", sans-serif';
  ctx.fillText(text, x + width / 2, y + height / 2 + 1);
}


/**
 * 功能：Canvas 小型狀態條。
 */
function drawCanvasProgress_(
  ctx,
  x,
  y,
  width,
  height,
  color,
  ratePercent
) {
  const segments = 10;
  const activeCount = getMobileShareProgressSegments_(ratePercent);
  const gap = 3;
  const segmentWidth = (width - gap * (segments - 1)) / segments;

  for (let index = 0; index < segments; index += 1) {
    drawCanvasRoundRect_(
      ctx,
      x + index * (segmentWidth + gap),
      y,
      segmentWidth,
      height,
      2,
      index < activeCount ? color : '#dfe4ec',
      null
    );
  }
}


/**
 * 功能：Canvas 卡片標題自動換行。
 */
function drawCanvasWrappedText_(
  ctx,
  text,
  centerX,
  centerY,
  maxWidth,
  lineHeight,
  maxLines
) {
  const words = Array.from(String(text));
  const lines = [];
  let current = '';

  words.forEach(function (char) {
    const candidate = current + char;

    if (
      ctx.measureText(candidate).width > maxWidth &&
      current
    ) {
      lines.push(current);
      current = char;
    } else {
      current = candidate;
    }
  });

  if (current) lines.push(current);

  const visible = lines.slice(0, maxLines);
  const startY =
    centerY -
    (visible.length - 1) * lineHeight / 2;

  visible.forEach(function (line, index) {
    ctx.fillText(
      line,
      centerX,
      startY + index * lineHeight
    );
  });
}


/**
 * 功能：Canvas 長壇名截短。
 */
function truncateCanvasText_(ctx, text, maxWidth) {
  const source = String(text || '');
  if (ctx.measureText(source).width <= maxWidth) {
    return source;
  }

  let value = source;

  while (
    value.length > 1 &&
    ctx.measureText(value + '…').width > maxWidth
  ) {
    value = value.slice(0, -1);
  }

  return value + '…';
}


/**
 * 功能：分享不支援時下載 PNG。
 */
function downloadMobileShareBlob_(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(function () {
    URL.revokeObjectURL(url);
  }, 1000);
}


/**
 * 功能：建立不含檔名非法字元的 PNG 名稱。
 */
function buildMobileShareFileName_(report) {
  const safeLabel = String(
    report.label || '道務成果'
  ).replace(/[\\/:*?"<>|]/g, '_');

  return (
    '新莊區_' +
    safeLabel +
    '_' +
    report.month +
    '月成果.png'
  );
}


/**
 * 功能：控制載入畫面。
 */
function setMobileShareLoading_(loading, preserveReport) {
  const loadingArea =
    document.getElementById('mobileShareLoading');
  const reportArea =
    document.getElementById('mobileShareReport');
  const reportSelect =
    document.getElementById('mobileShareReportSelect');
  const monthSelect =
    document.getElementById('mobileShareTargetMonthSelect');
  const reload =
    document.getElementById('mobileShareReloadBtn');
  const share =
    document.getElementById('mobileShareLineBtn');

  if (loadingArea) {
    loadingArea.hidden = !loading;
  }

  if (reportArea && loading && !preserveReport) {
    reportArea.hidden = true;
  }

  if (reportSelect) reportSelect.disabled = loading;
  if (monthSelect) monthSelect.disabled = loading;
  if (reload) reload.disabled = loading;
  if (share) share.disabled = loading;
}


/**
 * 功能：顯示或清除錯誤訊息。
 */
function showMobileShareError_(message, tone) {
  const area =
    document.getElementById('mobileShareError');

  if (!area) return;

  area.textContent = message || '';
  area.hidden = !message;
  area.classList.remove('error', 'warning');

  if (message) {
    area.classList.add(tone === 'warning' ? 'warning' : 'error');
  }
}


/**
 * 功能：控制 LINE 分享按鈕載入狀態。
 */
function setMobileShareButtonLoading_(button, loading) {
  if (!button) return;

  button.disabled = loading;
  button.innerHTML = loading
    ? '圖片產生中...'
    : '<span class="mobile-share-line-mark">LINE</span>分享成果圖片';
}


/**
 * 功能：安全填入文字。
 */
function setText_(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent =
      value == null ? '' : String(value);
  }
}


/**
 * 功能：數字顯示，整數不顯示小數點。
 */
function formatMobileShareMonthValue_(value) {
  const number = Number(value || 0);

  if (!Number.isFinite(number) || number === 0) {
    return '';
  }

  return formatMobileShareNumber_(number);
}


function formatMobileShareNumber_(value) {
  const number = Number(value || 0);

  if (!Number.isFinite(number)) {
    return '0';
  }

  return Number.isInteger(number)
    ? String(number)
    : number
        .toFixed(2)
        .replace(/0+$/, '')
        .replace(/\.$/, '');
}
