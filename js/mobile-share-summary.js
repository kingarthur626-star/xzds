/**
 * 程式名稱：mobile-share-summary.js
 * 功能：讀取六張各壇月報，彙整成求道／法會三大組累計達成。
 * 版本：v1.0.0R9
 */

const MOBILE_CUMULATIVE_MONTH_STORAGE_KEY = 'XZDS_MOBILE_SHARE_MONTH';
const MOBILE_CUMULATIVE_REPORT_KEYS = [
  'qiu1', 'qiu2', 'qiu3',
  'fa1', 'fa2', 'fa3'
];
const MOBILE_CUMULATIVE_GROUP_LABELS = {
  1: '一組',
  2: '二組',
  3: '三組'
};

let mobileCumulativeRequestSerial_ = 0;
let mobileCumulativeSourceMonth_ = 0;


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
}


async function loadMobileCumulativeReport_(selectedMonth) {
  const serial = ++mobileCumulativeRequestSerial_;
  setMobileCumulativeLoading_(true);
  showMobileCumulativeError_('');

  const month = Number(selectedMonth);

  try {
    const responses = await Promise.all(
      MOBILE_CUMULATIVE_REPORT_KEYS.map(function (reportKey) {
        const payload = {
          action: 'getMobileShareReport',
          reportKey: reportKey
        };

        if (Number.isInteger(month) && month >= 1 && month <= 12) {
          payload.month = month;
        }

        return callApi(payload);
      })
    );

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
    syncMobileCumulativeMonthOptions_(reportMonth, mobileCumulativeSourceMonth_);

    const receive = buildMobileCumulativeCategory_(reports, '求道');
    const seminar = buildMobileCumulativeCategory_(reports, '法會');

    renderMobileCumulativeReport_(
      reportMonth,
      Number(reports[0].monthTargetPercent || 0),
      receive,
      seminar
    );

  } catch (error) {
    if (serial !== mobileCumulativeRequestSerial_) return;

    showMobileCumulativeError_(
      String(error && error.message ? error.message : '累計報表讀取失敗')
    );

  } finally {
    if (serial === mobileCumulativeRequestSerial_) {
      setMobileCumulativeLoading_(false);
    }
  }
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

  setMobileCumulativeMonthHead_(
    'mobileCumulativeReceiveMonthHead',
    month
  );
  setMobileCumulativeMonthHead_(
    'mobileCumulativeSeminarMonthHead',
    month
  );

  renderMobileCumulativeRows_(
    'mobileCumulativeReceiveRows',
    receive.rows
  );
  renderMobileCumulativeRows_(
    'mobileCumulativeSeminarRows',
    seminar.rows
  );

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


function syncMobileCumulativeMonthOptions_(selectedMonth, sourceMonth) {
  const select = document.getElementById('mobileCumulativeMonthSelect');
  if (!select) return;

  Array.from(select.options).forEach(function (option) {
    option.disabled = Number(option.value) > sourceMonth;
  });

  select.value = String(selectedMonth);
  localStorage.setItem(
    MOBILE_CUMULATIVE_MONTH_STORAGE_KEY,
    String(selectedMonth)
  );
}


function setMobileCumulativeLoading_(loading) {
  const loadingArea = document.getElementById('mobileCumulativeLoading');
  const monthSelect = document.getElementById('mobileCumulativeMonthSelect');
  const reloadBtn = document.getElementById('mobileCumulativeReloadBtn');

  if (loadingArea) loadingArea.hidden = !loading;
  if (monthSelect) monthSelect.disabled = loading;
  if (reloadBtn) reloadBtn.disabled = loading;
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
