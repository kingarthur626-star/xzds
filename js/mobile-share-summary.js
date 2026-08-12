/**
 * 程式名稱：mobile-share-summary.js
 * 功能：讀取六張各壇月報，彙整成求道／法會三大組累計達成，並產生 LINE 分享圖片。
 * 版本：v1.0.0R12
 */

const MOBILE_CUMULATIVE_MONTH_STORAGE_KEY = 'XZDS_MOBILE_SHARE_MONTH';
const MOBILE_CUMULATIVE_REPORT_KEYS = [
  'qiu1', 'qiu2', 'qiu3',
  'fa1', 'fa2', 'fa3'
];
const MOBILE_CUMULATIVE_MAX_CONCURRENCY = 2;
const MOBILE_CUMULATIVE_GROUP_LABELS = {
  1: '一組',
  2: '二組',
  3: '三組'
};

let mobileCumulativeRequestSerial_ = 0;
let mobileCumulativeSourceMonth_ = 0;
let mobileCumulativeCurrentReport_ = null;


document.addEventListener('DOMContentLoaded', function () {
  const user = requireLogin();
  if (!user) return;

  bindMobileCumulativeEvents_();

  const savedMonth = Number(
    localStorage.getItem(MOBILE_CUMULATIVE_MONTH_STORAGE_KEY) || 0
  );

  loadMobileCumulativeReport_(
    Number.isInteger(savedMonth) && savedMonth >= 1 && savedMonth <= 12
      ? savedMonth
      : 0
  );
});


function bindMobileCumulativeEvents_() {
  const logoutBtn = document.getElementById('mobileCumulativeLogoutBtn');
  const detailBtn = document.getElementById('mobileCumulativeDetailBtn');
  const homeBtn = document.getElementById('mobileCumulativeHomeBtn');
  const monthSelect = document.getElementById('mobileCumulativeMonthSelect');
  const reloadBtn = document.getElementById('mobileCumulativeReloadBtn');
  const shareBtn = document.getElementById('mobileCumulativeLineBtn');

  if (logoutBtn) {
    logoutBtn.addEventListener('click', function () {
      logout();
    });
  }

  if (detailBtn) {
    detailBtn.addEventListener('click', function () {
      location.href = 'mobile-share.html';
    });
  }

  if (homeBtn) {
    homeBtn.addEventListener('click', function () {
      location.href = 'home.html';
    });
  }

  if (monthSelect) {
    monthSelect.addEventListener('change', function () {
      loadMobileCumulativeReport_(Number(monthSelect.value));
    });
  }

  if (reloadBtn) {
    reloadBtn.addEventListener('click', function () {
      const month = monthSelect ? Number(monthSelect.value) : 0;
      loadMobileCumulativeReport_(month);
    });
  }

  if (shareBtn) {
    shareBtn.addEventListener('click', shareMobileCumulativeImage_);
  }
}


async function loadMobileCumulativeReport_(selectedMonth) {
  const serial = ++mobileCumulativeRequestSerial_;
  setMobileCumulativeLoading_(true);
  showMobileCumulativeError_('');

  const month = Number(selectedMonth);

  try {
    const responses = await loadMobileCumulativeReportsLimited_(month);

    if (serial !== mobileCumulativeRequestSerial_) return;

    const reports = responses.map(function (result, index) {
      if (!result || !result.success || !result.report) {
        throw new Error(
          result && result.message
            ? result.message
            : MOBILE_CUMULATIVE_REPORT_KEYS[index] + ' 讀取失敗'
        );
      }
      return result.report;
    });

    const sourceMonths = reports
      .map(function (report) {
        return Number(report.sourceMonth || report.month || 0);
      })
      .filter(function (value) {
        return Number.isInteger(value) && value >= 1 && value <= 12;
      });

    mobileCumulativeSourceMonth_ = sourceMonths.length
      ? Math.min.apply(null, sourceMonths)
      : Number(reports[0].month || 1);

    const reportMonth = Number(reports[0].month || mobileCumulativeSourceMonth_);
    const targetPercent = Number(reports[0].monthTargetPercent || 0);
    syncMobileCumulativeMonthOptions_(reportMonth, mobileCumulativeSourceMonth_);

    const receive = buildMobileCumulativeCategory_(reports, '求道');
    const seminar = buildMobileCumulativeCategory_(reports, '法會');

    mobileCumulativeCurrentReport_ = {
      month: reportMonth,
      targetPercent: targetPercent,
      receive: receive,
      seminar: seminar
    };

    renderMobileCumulativeReport_(
      reportMonth,
      targetPercent,
      receive,
      seminar
    );

  } catch (error) {
    if (serial !== mobileCumulativeRequestSerial_) return;

    mobileCumulativeCurrentReport_ = null;
    showMobileCumulativeError_(
      String(error && error.message ? error.message : '累計報表讀取失敗')
    );

  } finally {
    if (serial === mobileCumulativeRequestSerial_) {
      setMobileCumulativeLoading_(false);
    }
  }
}


/**
 * 六張月報改成最多同時 2 支 API。
 * 原本 Promise.all 一次打 6 支，只要其中 1 支傳輸暫時失敗，整頁就直接失敗；
 * 本版配合 api.js 的唯讀自動重試，降低 Apps Script / JSONP 同時間尖峰。
 */
async function loadMobileCumulativeReportsLimited_(month) {
  const responses = new Array(MOBILE_CUMULATIVE_REPORT_KEYS.length);
  let nextIndex = 0;

  async function worker_() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;

      if (index >= MOBILE_CUMULATIVE_REPORT_KEYS.length) {
        return;
      }

      const reportKey = MOBILE_CUMULATIVE_REPORT_KEYS[index];
      const payload = {
        action: 'getMobileShareReport',
        reportKey: reportKey
      };

      if (Number.isInteger(month) && month >= 1 && month <= 12) {
        payload.month = month;
      }

      responses[index] = await callApi(payload);
    }
  }

  const workers = [];
  const workerCount = Math.min(
    MOBILE_CUMULATIVE_MAX_CONCURRENCY,
    MOBILE_CUMULATIVE_REPORT_KEYS.length
  );

  for (let i = 0; i < workerCount; i++) {
    workers.push(worker_());
  }

  await Promise.all(workers);
  return responses;
}


function buildMobileCumulativeCategory_(reports, category) {
  const categoryReports = reports
    .filter(function (report) {
      return report.category === category;
    })
    .sort(function (a, b) {
      return Number(a.groupNo) - Number(b.groupNo);
    });

  if (categoryReports.length !== 3) {
    throw new Error(category + '三大組資料不完整。');
  }

  const rows = categoryReports.map(function (report) {
    const summary = report.summary || {};
    const delta = Number(summary.delta || 0);

    return {
      groupNo: Number(report.groupNo),
      groupLabel: MOBILE_CUMULATIVE_GROUP_LABELS[Number(report.groupNo)] || String(report.groupNo),
      templeCount: Number(report.templeCount || (report.details || []).length || 0),
      target: Number(summary.target || 0),
      monthValue: Number(summary.monthValue || 0),
      cumulative: Number(summary.cumulative || 0),
      ratePercent: Number(summary.ratePercent || 0),
      delta: delta,
      deltaText: delta >= 0
        ? '+' + Math.abs(Math.round(delta))
        : String(Math.abs(Math.round(delta))),
      tone: delta >= 0 ? 'green' : 'red'
    };
  });

  const target = rows.reduce(function (sum, row) {
    return sum + row.target;
  }, 0);
  const monthValue = rows.reduce(function (sum, row) {
    return sum + row.monthValue;
  }, 0);
  const cumulative = rows.reduce(function (sum, row) {
    return sum + row.cumulative;
  }, 0);
  const templeCount = rows.reduce(function (sum, row) {
    return sum + row.templeCount;
  }, 0);
  const targetPercent = Number(categoryReports[0].monthTargetPercent || 0);
  const ratePercent = target > 0
    ? Math.round(cumulative / target * 100)
    : 0;
  const delta = Math.round(cumulative - target * targetPercent / 100);

  rows.push({
    groupNo: 0,
    groupLabel: '總計',
    templeCount: templeCount,
    target: target,
    monthValue: monthValue,
    cumulative: cumulative,
    ratePercent: ratePercent,
    delta: delta,
    deltaText: delta >= 0
      ? '+' + Math.abs(delta)
      : String(Math.abs(delta)),
    tone: delta >= 0 ? 'green' : 'red',
    total: true
  });

  return {
    category: category,
    rows: rows
  };
}


function renderMobileCumulativeReport_(month, targetPercent, receive, seminar) {
  const targetBadge = document.getElementById('mobileCumulativeTargetBadge');
  const reportArea = document.getElementById('mobileCumulativeReport');

  if (targetBadge) {
    targetBadge.textContent = '目標 ' + targetPercent + '%';
  }

  setMobileCumulativeMonthHead_('mobileCumulativeReceiveMonthHead', month);
  setMobileCumulativeMonthHead_('mobileCumulativeSeminarMonthHead', month);

  renderMobileCumulativeRows_('mobileCumulativeReceiveRows', receive.rows);
  renderMobileCumulativeRows_('mobileCumulativeSeminarRows', seminar.rows);

  if (reportArea) {
    reportArea.hidden = false;
  }
}


function setMobileCumulativeMonthHead_(elementId, month) {
  const element = document.getElementById(elementId);
  if (element) {
    element.innerHTML = escapeHtml(String(month)) + '月<br>達成';
  }
}


function renderMobileCumulativeRows_(elementId, rows) {
  const area = document.getElementById(elementId);
  if (!area) return;

  area.innerHTML = rows.map(function (row) {
    return (
      '<div class="mobile-cumulative-row' + (row.total ? ' total-row' : '') + '">' +
        '<span class="group-cell">' +
          escapeHtml(row.groupLabel) +
          '<small>' + escapeHtml(String(row.templeCount)) + '壇</small>' +
        '</span>' +
        '<span>' + formatMobileCumulativeNumber_(row.target) + '</span>' +
        '<span>' + formatMobileCumulativeNumber_(row.monthValue) + '</span>' +
        '<span>' + formatMobileCumulativeNumber_(row.cumulative) + '</span>' +
        '<span class="rate-cell ' + row.tone + '">' +
          formatMobileCumulativeNumber_(row.ratePercent) + '%' +
        '</span>' +
        '<span class="delta-cell ' + row.tone + '">' +
          escapeHtml(row.deltaText) +
        '</span>' +
      '</div>'
    );
  }).join('');
}


async function shareMobileCumulativeImage_() {
  if (!mobileCumulativeCurrentReport_) {
    alert('請先完成累計報表讀取。');
    return;
  }

  const button = document.getElementById('mobileCumulativeLineBtn');
  setMobileCumulativeShareLoading_(button, true);

  try {
    const blob = await buildMobileCumulativePngBlob_(mobileCumulativeCurrentReport_);
    const fileName = '新莊區_三大組累計達成_' + mobileCumulativeCurrentReport_.month + '月.png';
    const file = new File([blob], fileName, { type: 'image/png' });

    if (
      navigator.share &&
      navigator.canShare &&
      navigator.canShare({ files: [file] })
    ) {
      await navigator.share({
        title: '三大組累計達成',
        text: mobileCumulativeCurrentReport_.month + '月 三大組累計達成',
        files: [file]
      });
      return;
    }

    downloadMobileCumulativeBlob_(blob, fileName);
    alert('此瀏覽器未支援直接分享檔案，已下載 PNG；請從照片或檔案分享到 LINE。');

  } catch (error) {
    if (error && error.name === 'AbortError') return;
    alert(error && error.message ? error.message : '累計圖片產生失敗。');

  } finally {
    setMobileCumulativeShareLoading_(button, false);
  }
}


function buildMobileCumulativePngBlob_(report) {
  const width = 1080;
  const height = 1230;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    return Promise.reject(new Error('瀏覽器無法建立圖片畫布。'));
  }

  drawMobileCumulativeCanvas_(ctx, canvas, report);

  return new Promise(function (resolve, reject) {
    canvas.toBlob(function (blob) {
      if (blob) resolve(blob);
      else reject(new Error('PNG 轉換失敗。'));
    }, 'image/png', 0.96);
  });
}


function drawMobileCumulativeCanvas_(ctx, canvas, report) {
  const width = canvas.width;
  const colors = {
    blue: '#064cff',
    green: '#0b9732',
    red: '#f10d17',
    purple: '#5422bd',
    ink: '#142238',
    muted: '#667085',
    line: '#cbd5e1',
    head: '#f5f7fb',
    total: '#b9cbea'
  };

  ctx.fillStyle = '#f5f7fb';
  ctx.fillRect(0, 0, width, canvas.height);
  cumulativeRoundRect_(ctx, 28, 28, width - 56, canvas.height - 56, 32, '#ffffff', '#dbe3ed');

  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#173f63';
  ctx.font = '900 58px "Microsoft JhengHei", "Noto Sans TC", sans-serif';
  ctx.fillText('三大組 累計達成', width / 2, 92);

  cumulativeRoundRect_(ctx, 315, 195, 190, 70, 18, '#ffffff', '#cbd5e1');
  ctx.fillStyle = colors.blue;
  ctx.font = '900 38px "Microsoft JhengHei", "Noto Sans TC", sans-serif';
  ctx.fillText(report.month + '月', 410, 230);

  cumulativeRoundRect_(ctx, 525, 195, 240, 70, 18, '#0b9732', null);
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 31px "Microsoft JhengHei", "Noto Sans TC", sans-serif';
  ctx.fillText('目標 ' + report.targetPercent + '%', 645, 230);

  let y = 310;
  y = drawMobileCumulativeTableCanvas_(ctx, report.receive.rows, '求道', report.month, y, colors);
  y += 32;
  drawMobileCumulativeTableCanvas_(ctx, report.seminar.rows, '法會', report.month, y, colors);
}


function drawMobileCumulativeTableCanvas_(ctx, rows, category, month, startY, colors) {
  const x = 58;
  const width = 964;
  const headerHeight = 72;
  const rowHeight = 86;
  const columns = [0, .23, .38, .53, .68, .84, 1];

  cumulativeRoundRect_(ctx, x, startY, width, headerHeight + rowHeight * rows.length, 18, '#ffffff', colors.line);
  ctx.fillStyle = colors.head;
  ctx.fillRect(x + 1, startY + 1, width - 2, headerHeight - 1);

  for (let i = 1; i < columns.length - 1; i += 1) {
    ctx.strokeStyle = colors.line;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + width * columns[i], startY);
    ctx.lineTo(x + width * columns[i], startY + headerHeight + rowHeight * rows.length);
    ctx.stroke();
  }

  const centers = [];
  for (let i = 0; i < columns.length - 1; i += 1) {
    centers.push(x + width * (columns[i] + columns[i + 1]) / 2);
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = colors.ink;
  ctx.font = '900 25px "Microsoft JhengHei", "Noto Sans TC", sans-serif';
  ctx.fillText('組別', centers[0], startY + headerHeight / 2);
  drawMobileCumulativeMixedTargetHeader_(
    ctx,
    category,
    centers[1],
    startY + headerHeight / 2,
    colors
  );
  ctx.fillText(month + '月達成', centers[2], startY + headerHeight / 2);
  ctx.fillText('今年累計', centers[3], startY + headerHeight / 2);
  ctx.fillText('實際達成率', centers[4], startY + headerHeight / 2);
  ctx.fillText('目前增減', centers[5], startY + headerHeight / 2);

  rows.forEach(function (row, index) {
    const rowY = startY + headerHeight + index * rowHeight;
    const background = row.total ? colors.total : '#ffffff';
    ctx.fillStyle = background;
    ctx.fillRect(x + 1, rowY, width - 2, rowHeight);
    ctx.strokeStyle = colors.line;
    ctx.beginPath();
    ctx.moveTo(x, rowY);
    ctx.lineTo(x + width, rowY);
    ctx.stroke();

    ctx.fillStyle = row.total ? '#12325a' : colors.purple;
    ctx.font = '900 29px "Microsoft JhengHei", "Noto Sans TC", sans-serif';
    ctx.fillText(row.groupLabel, centers[0], rowY + 31);
    ctx.fillStyle = colors.muted;
    ctx.font = '800 18px "Microsoft JhengHei", "Noto Sans TC", sans-serif';
    ctx.fillText(row.templeCount + '壇', centers[0], rowY + 60);

    ctx.fillStyle = colors.ink;
    ctx.font = '800 29px "Microsoft JhengHei", "Noto Sans TC", sans-serif';
    ctx.fillText(formatMobileCumulativeNumber_(row.target), centers[1], rowY + rowHeight / 2);
    ctx.fillText(formatMobileCumulativeNumber_(row.monthValue), centers[2], rowY + rowHeight / 2);
    ctx.fillText(formatMobileCumulativeNumber_(row.cumulative), centers[3], rowY + rowHeight / 2);

    const toneColor = row.tone === 'green' ? colors.green : colors.red;
    ctx.fillStyle = toneColor;
    ctx.font = '900 31px "Microsoft JhengHei", "Noto Sans TC", sans-serif';
    ctx.fillText(formatMobileCumulativeNumber_(row.ratePercent) + '%', centers[4], rowY + rowHeight / 2);

    const deltaX = x + width * columns[5] + 1;
    const deltaWidth = width * (columns[6] - columns[5]) - 2;

    if (row.tone === 'green') {
      ctx.fillStyle = colors.green;
      ctx.fillRect(deltaX, rowY, deltaWidth, rowHeight);
      ctx.fillStyle = '#ffffff';
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(deltaX, rowY, deltaWidth, rowHeight);
      ctx.fillStyle = colors.red;
    }

    ctx.font = '950 34px "Microsoft JhengHei", "Noto Sans TC", sans-serif';
    ctx.fillText(row.deltaText, centers[5], rowY + rowHeight / 2);
  });

  return startY + headerHeight + rowHeight * rows.length;
}


function drawMobileCumulativeMixedTargetHeader_(ctx, category, centerX, centerY, colors) {
  const font = '900 24px "Microsoft JhengHei", "Noto Sans TC", sans-serif';
  const suffix = '目標';

  ctx.font = font;
  const categoryWidth = ctx.measureText(category).width;
  const suffixWidth = ctx.measureText(suffix).width;
  const totalWidth = categoryWidth + suffixWidth;
  let x = centerX - totalWidth / 2;

  ctx.textAlign = 'left';
  ctx.fillStyle = colors.blue;
  ctx.fillText(category, x, centerY);

  x += categoryWidth;
  ctx.fillStyle = colors.ink;
  ctx.fillText(suffix, x, centerY);

  ctx.textAlign = 'center';
}


function cumulativeRoundRect_(ctx, x, y, width, height, radius, fill, stroke) {
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


function downloadMobileCumulativeBlob_(blob, fileName) {
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


function setMobileCumulativeShareLoading_(button, loading) {
  if (!button) return;
  button.disabled = loading;
  button.innerHTML = loading
    ? '圖片產生中...'
    : '<span class="mobile-share-line-mark">LINE</span>分享累計圖片';
}


function syncMobileCumulativeMonthOptions_(selectedMonth, sourceMonth) {
  const select = document.getElementById('mobileCumulativeMonthSelect');
  if (!select) return;

  Array.from(select.options).forEach(function (option) {
    option.disabled = Number(option.value) > sourceMonth;
  });

  select.value = String(selectedMonth);
  localStorage.setItem(MOBILE_CUMULATIVE_MONTH_STORAGE_KEY, String(selectedMonth));
}


function setMobileCumulativeLoading_(loading) {
  const loadingArea = document.getElementById('mobileCumulativeLoading');
  const monthSelect = document.getElementById('mobileCumulativeMonthSelect');
  const reloadBtn = document.getElementById('mobileCumulativeReloadBtn');
  const shareBtn = document.getElementById('mobileCumulativeLineBtn');

  if (loadingArea) loadingArea.hidden = !loading;
  if (monthSelect) monthSelect.disabled = loading;
  if (reloadBtn) reloadBtn.disabled = loading;
  if (shareBtn) shareBtn.disabled = loading;
}


function showMobileCumulativeError_(message) {
  const area = document.getElementById('mobileCumulativeError');
  if (!area) return;

  area.textContent = message || '';
  area.hidden = !message;
}


function formatMobileCumulativeNumber_(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return '0';

  return number.toLocaleString('zh-TW', {
    maximumFractionDigits: 0
  });
}
