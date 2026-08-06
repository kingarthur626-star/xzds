/**
 * 程式名稱：mobile-share.js
 * 功能說明：
 * 1. 讀取手機成果分享 API。
 * 2. 顯示六種求道／法會分組報表。
 * 3. 依月份目標顯示壇名三色。
 * 4. 產生完整 PNG，使用手機原生分享選單分享到 LINE。
 *
 * 版本：v1.0.0R6
 * 最後更新：2026/08/06
 */

const MOBILE_SHARE_STORAGE_KEY = 'XZDS_MOBILE_SHARE_REPORT_KEY';
const MOBILE_SHARE_REPORT_KEYS = ['qiu1', 'qiu2', 'qiu3', 'fa1', 'fa2', 'fa3'];
const MOBILE_SHARE_TARGET_PERCENT_ = {
  1: 8, 2: 17, 3: 25, 4: 33, 5: 42, 6: 50,
  7: 58, 8: 67, 9: 75, 10: 83, 11: 92, 12: 100
};
let mobileShareSourceReport_ = null;
let mobileShareCurrentReport_ = null;
let mobileShareCurrentUser_ = null;
let mobileShareRequestSerial_ = 0;


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
  const userText = document.getElementById('mobileShareUserText');
  const select = document.getElementById('mobileShareReportSelect');

  if (userText) {
    userText.textContent = user.temple || '';
  }

  bindMobileShareEvents_();

  const savedKey = localStorage.getItem(MOBILE_SHARE_STORAGE_KEY);
  const defaultKey = MOBILE_SHARE_REPORT_KEYS.includes(savedKey)
    ? savedKey
    : inferMobileShareDefaultKey_(user);

  if (select) {
    select.value = defaultKey;
  }

  loadMobileShareReport_(defaultKey);
}


/**
 * 功能：綁定首頁、登出、下拉、重新讀取及分享事件。
 */
function bindMobileShareEvents_() {
  const homeBtn = document.getElementById('mobileShareHomeBtn');
  const logoutBtn = document.getElementById('mobileShareLogoutBtn');
  const select = document.getElementById('mobileShareReportSelect');
  const targetMonthSelect = document.getElementById('mobileShareTargetMonthSelect');
  const reloadBtn = document.getElementById('mobileShareReloadBtn');
  const shareBtn = document.getElementById('mobileShareLineBtn');

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

  if (select) {
    select.addEventListener('change', function () {
      localStorage.setItem(MOBILE_SHARE_STORAGE_KEY, select.value);
      loadMobileShareReport_(select.value);
    });
  }

  if (targetMonthSelect) {
    targetMonthSelect.addEventListener('change', function () {
      applyMobileShareTargetMonth_(Number(targetMonthSelect.value));
    });
  }

  if (reloadBtn) {
    reloadBtn.addEventListener('click', function () {
      const key = select ? select.value : 'qiu1';
      loadMobileShareReport_(key);
    });
  }

  if (shareBtn) {
    shareBtn.addEventListener('click', shareMobileReportImage_);
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
 * 功能：從後端讀取選定成果報表。
 */
async function loadMobileShareReport_(reportKey) {
  const serial = ++mobileShareRequestSerial_;
  setMobileShareLoading_(true);
  showMobileShareError_('');

  try {
    const result = await callApi({
      action: 'getMobileShareReport',
      reportKey: reportKey
    });

    if (serial !== mobileShareRequestSerial_) return;

    if (!result.success || !result.report) {
      throw new Error(result.message || '報表讀取失敗');
    }

    mobileShareSourceReport_ = result.report;
    const targetMonthSelect = document.getElementById('mobileShareTargetMonthSelect');
    if (targetMonthSelect) {
      targetMonthSelect.value = String(result.report.month || new Date().getMonth() + 1);
    }
    applyMobileShareTargetMonth_(Number(targetMonthSelect ? targetMonthSelect.value : result.report.month));

  } catch (error) {
    if (serial !== mobileShareRequestSerial_) return;
    mobileShareSourceReport_ = null;
    mobileShareCurrentReport_ = null;
    const message = String(error && error.message ? error.message : '系統連線失敗，請稍後再試');
    showMobileShareError_(message === '未知的操作'
      ? '後端尚未啟用三大組月報 API。請清除重複的備份 .gs 路由檔，重新建立 Apps Script 新版本並更新正式部署。'
      : message);

  } finally {
    if (serial === mobileShareRequestSerial_) {
      setMobileShareLoading_(false);
    }
  }
}


/**
 * 功能：依下拉選擇的目標月份，重新計算目標百分比、三色與大組達標狀態。
 * 注意：來源報表的實際月份與當月數字不變，避免把 8 月資料誤標為其他月份。
 */
function applyMobileShareTargetMonth_(targetMonth) {
  if (!mobileShareSourceReport_) return;

  const month = Number(targetMonth);
  const safeMonth = Number.isInteger(month) && month >= 1 && month <= 12
    ? month
    : Number(mobileShareSourceReport_.month || 1);

  mobileShareCurrentReport_ = buildMobileShareViewReport_(mobileShareSourceReport_, safeMonth);
  renderMobileShareReport_(mobileShareCurrentReport_);
}


/**
 * 功能：建立前端顯示用報表副本，不修改後端原始回傳資料。
 */
function buildMobileShareViewReport_(sourceReport, targetMonth) {
  const report = JSON.parse(JSON.stringify(sourceReport));
  const percent = MOBILE_SHARE_TARGET_PERCENT_[targetMonth] || 100;
  const target = Number(report.summary && report.summary.target || 0);
  const cumulative = Number(report.summary && report.summary.cumulative || 0);
  const targetToDate = target * percent / 100;
  const delta = cumulative - targetToDate;

  report.targetMonth = targetMonth;
  report.monthTargetPercent = percent;
  report.summary.targetToDate = targetToDate;
  report.summary.delta = delta;
  report.summary.statusLabel = delta >= 0 ? '目前達標' : '目前尚缺';
  report.summary.statusValue = delta >= 0
    ? '+' + Math.round(delta)
    : String(Math.round(Math.abs(delta)));
  report.summary.statusTone = delta >= 0 ? 'green' : 'red';

  report.details = (report.details || []).map(function (item) {
    item.tone = getMobileShareTone_(Number(item.ratePercent || 0), percent);
    return item;
  });

  return report;
}


/**
 * 功能：依目標百分比套用綠、黃、紅三色。
 */
function getMobileShareTone_(ratePercent, targetPercent) {
  if (ratePercent >= targetPercent) return 'green';
  if (ratePercent >= targetPercent - 10) return 'yellow';
  return 'red';
}


/**
 * 功能：將後端回傳資料渲染到手機畫面。
 */
function renderMobileShareReport_(report) {
  const reportArea = document.getElementById('mobileShareReport');
  const targetBadge = document.getElementById('mobileShareTargetBadge');
  const statusCard = document.getElementById('mobileShareStatusCard');

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
  setText_('mobileShareGeneratedText', '目標月份：' + report.targetMonth + '月｜資料產生：' + (report.generatedAt || ''));

  if (targetBadge) {
    targetBadge.textContent = '目標 ' + report.monthTargetPercent + '%';
  }

  if (statusCard) {
    statusCard.classList.remove('green', 'red');
    statusCard.classList.add(report.summary.statusTone === 'green' ? 'green' : 'red');
  }

  renderMobileShareDetailRows_(report.details || []);

  if (reportArea) {
    reportArea.hidden = false;
  }
}


/**
 * 功能：顯示壇名明細與三色達成率。
 */
function renderMobileShareDetailRows_(details) {
  const area = document.getElementById('mobileShareDetailRows');
  if (!area) return;

  if (!details.length) {
    area.innerHTML = '<div class="mobile-share-message">沒有壇名明細</div>';
    return;
  }

  area.innerHTML = details.map(function (item) {
    const tone = ['green', 'yellow', 'red'].includes(item.tone) ? item.tone : 'red';

    return (
      '<div class="mobile-share-detail-row">' +
        '<span title="' + escapeHtml(item.temple) + '">' + escapeHtml(item.temple) + '</span>' +
        '<span>' + formatMobileShareNumber_(item.target) + '</span>' +
        '<span>' + formatMobileShareNumber_(item.monthValue) + '</span>' +
        '<span>' + formatMobileShareNumber_(item.cumulative) + '</span>' +
        '<span class="mobile-share-rate-cell ' + tone + '">' +
          '<span class="rate-number">' + formatMobileShareNumber_(item.ratePercent) + '%</span>' +
          '<span class="mobile-share-mini-track"><i></i></span>' +
        '</span>' +
      '</div>'
    );
  }).join('');
}


/**
 * 功能：建立完整成果 PNG，優先使用手機 Web Share 分享。
 * LINE 會出現在 iPhone／Android 的系統分享選單中。
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
        text: mobileShareCurrentReport_.label + '｜' + mobileShareCurrentReport_.title,
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
  const height = 690 + detailCount * rowHeight + 210;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return Promise.reject(new Error('瀏覽器無法建立圖片畫布。'));
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

  drawCanvasRoundRect_(ctx, 28, 28, width - 56, canvas.height - 56, 34, '#ffffff', '#dfe5ed');

  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = colors.ink;
  ctx.font = '900 42px "Microsoft JhengHei", "Noto Sans TC", sans-serif';
  ctx.fillText('新莊區 道務成果', padding, 90);

  ctx.textAlign = 'right';
  ctx.fillStyle = colors.muted;
  ctx.font = '700 27px "Microsoft JhengHei", "Noto Sans TC", sans-serif';
  ctx.fillText(report.label, width - padding, 90);

  drawCanvasPill_(
    ctx,
    padding,
    132,
    196,
    56,
    report.targetMonth + '月目標 ' + report.monthTargetPercent + '%',
    colors.green
  );

  ctx.textAlign = 'center';
  ctx.fillStyle = colors.blue;
  ctx.font = '900 66px "Microsoft JhengHei", "Noto Sans TC", sans-serif';
  ctx.fillText(report.title, width / 2, 232);

  const cardY = 292;
  const cardGap = 12;
  const cardWidth = (width - padding * 2 - cardGap * 4) / 5;
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
    ctx.font = '800 23px "Microsoft JhengHei", "Noto Sans TC", sans-serif';
    drawCanvasWrappedText_(ctx, String(card.label), x + cardWidth / 2, cardY + 42, cardWidth - 16, 26, 2);
    ctx.fillStyle = toneColor;
    ctx.font = '900 43px "Microsoft JhengHei", "Noto Sans TC", sans-serif';
    ctx.fillText(String(card.value), x + cardWidth / 2, cardY + 112);
  });

  const tableX = padding;
  const tableY = 480;
  const tableWidth = width - padding * 2;
  const headerHeight = 60;
  const col = {
    temple: tableX + 22,
    target: tableX + tableWidth * 0.57,
    month: tableX + tableWidth * 0.69,
    cumulative: tableX + tableWidth * 0.80,
    rate: tableX + tableWidth * 0.945
  };

  drawCanvasRoundRect_(ctx, tableX, tableY, tableWidth, headerHeight, 16, colors.light, colors.line);
  ctx.fillStyle = colors.ink;
  ctx.font = '900 26px "Microsoft JhengHei", "Noto Sans TC", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('壇名', col.temple, tableY + headerHeight / 2);
  ctx.textAlign = 'center';
  ctx.fillText('目標', col.target, tableY + headerHeight / 2);
  ctx.fillText(report.monthColumnLabel, col.month, tableY + headerHeight / 2);
  ctx.fillText('累計', col.cumulative, tableY + headerHeight / 2);
  ctx.fillText('達成率', col.rate, tableY + headerHeight / 2);

  let rowY = tableY + headerHeight;

  (report.details || []).forEach(function (item, index) {
    const background = index % 2 === 0 ? '#ffffff' : '#fbfcfe';
    drawCanvasRoundRect_(ctx, tableX, rowY, tableWidth, rowHeight, 0, background, colors.line);

    ctx.fillStyle = colors.ink;
    ctx.font = '800 27px "Microsoft JhengHei", "Noto Sans TC", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(truncateCanvasText_(ctx, item.temple, tableWidth * 0.45), col.temple, rowY + rowHeight / 2);

    ctx.font = '700 26px "Microsoft JhengHei", "Noto Sans TC", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(String(item.target), col.target, rowY + rowHeight / 2);
    ctx.fillText(String(item.monthValue), col.month, rowY + rowHeight / 2);
    ctx.fillText(String(item.cumulative), col.cumulative, rowY + rowHeight / 2);

    const toneColor = item.tone === 'green'
      ? colors.green
      : item.tone === 'yellow'
        ? colors.yellow
        : colors.red;

    ctx.fillStyle = toneColor;
    ctx.font = '900 27px "Microsoft JhengHei", "Noto Sans TC", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(item.ratePercent + '%', col.rate - 12, rowY + rowHeight / 2);
    drawCanvasProgress_(ctx, tableX + tableWidth - 64, rowY + rowHeight / 2 - 8, 44, 16, toneColor);

    rowY += rowHeight;
  });

  const footerY = rowY + 34;
  drawCanvasRoundRect_(ctx, padding, footerY, width - padding * 2, 62, 16, '#f1faf2', '#cce3cf');
  ctx.fillStyle = '#46604a';
  ctx.textAlign = 'center';
  ctx.font = '700 25px "Microsoft JhengHei", "Noto Sans TC", sans-serif';
  ctx.fillText('報表月份依來源月報更新｜目標月份 ' + report.targetMonth + '月｜資料產生 ' + (report.generatedAt || ''), width / 2, footerY + 31);

  ctx.fillStyle = colors.muted;
  ctx.font = '600 22px "Microsoft JhengHei", "Noto Sans TC", sans-serif';
  ctx.fillText(
    '綠：達標　黃：差距 10% 以內　紅：落後超過 10%',
    width / 2,
    footerY + 100
  );
}


/**
 * 功能：Canvas 圓角矩形。
 */
function drawCanvasRoundRect_(ctx, x, y, width, height, radius, fill, stroke) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
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
function drawCanvasPill_(ctx, x, y, width, height, text, color) {
  drawCanvasRoundRect_(ctx, x, y, width, height, height / 2, color, null);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.font = '900 29px "Microsoft JhengHei", "Noto Sans TC", sans-serif';
  ctx.fillText(text, x + width / 2, y + height / 2 + 1);
}


/**
 * 功能：Canvas 小型狀態條。
 */
function drawCanvasProgress_(ctx, x, y, width, height, color) {
  drawCanvasRoundRect_(ctx, x, y, width, height, height / 2, '#f4f6f8', '#d4dae2');
  drawCanvasRoundRect_(ctx, x + 1, y + 1, width * 0.76, height - 2, (height - 2) / 2, color, null);
}


/**
 * 功能：Canvas 卡片標題自動換行。
 */
function drawCanvasWrappedText_(ctx, text, centerX, centerY, maxWidth, lineHeight, maxLines) {
  const words = Array.from(String(text));
  const lines = [];
  let current = '';

  words.forEach(function (char) {
    const candidate = current + char;
    if (ctx.measureText(candidate).width > maxWidth && current) {
      lines.push(current);
      current = char;
    } else {
      current = candidate;
    }
  });

  if (current) lines.push(current);
  const visible = lines.slice(0, maxLines);
  const startY = centerY - (visible.length - 1) * lineHeight / 2;

  visible.forEach(function (line, index) {
    ctx.fillText(line, centerX, startY + index * lineHeight);
  });
}


/**
 * 功能：Canvas 長壇名截短。
 */
function truncateCanvasText_(ctx, text, maxWidth) {
  const source = String(text || '');
  if (ctx.measureText(source).width <= maxWidth) return source;

  let value = source;
  while (value.length > 1 && ctx.measureText(value + '…').width > maxWidth) {
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
  setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
}


/**
 * 功能：建立不含檔名非法字元的 PNG 名稱。
 */
function buildMobileShareFileName_(report) {
  const safeLabel = String(report.label || '道務成果').replace(/[\\/:*?"<>|]/g, '_');
  return '新莊區_' + safeLabel + '_' + report.month + '月成果.png';
}


/**
 * 功能：控制載入畫面。
 */
function setMobileShareLoading_(loading) {
  const loadingArea = document.getElementById('mobileShareLoading');
  const reportArea = document.getElementById('mobileShareReport');
  const select = document.getElementById('mobileShareReportSelect');
  const targetMonthSelect = document.getElementById('mobileShareTargetMonthSelect');
  const reload = document.getElementById('mobileShareReloadBtn');
  const share = document.getElementById('mobileShareLineBtn');

  if (loadingArea) loadingArea.hidden = !loading;
  if (reportArea && loading) reportArea.hidden = true;
  if (select) select.disabled = loading;
  if (targetMonthSelect) targetMonthSelect.disabled = loading;
  if (reload) reload.disabled = loading;
  if (share) share.disabled = loading;
}


/**
 * 功能：顯示或清除錯誤訊息。
 */
function showMobileShareError_(message) {
  const area = document.getElementById('mobileShareError');
  if (!area) return;

  area.textContent = message || '';
  area.hidden = !message;
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
  if (element) element.textContent = value == null ? '' : String(value);
}


/**
 * 功能：數字顯示，整數不顯示小數點。
 */
function formatMobileShareNumber_(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return '0';
  return Number.isInteger(number) ? String(number) : number.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}
