const XINZHUANG_DISTRICT_TOKEN = '__XINZHUANG_DISTRICT__';
const XZDS_HISTORY_TEMPLE_CACHE_KEY = 'XZDS_HISTORY_TEMPLE_CACHE_v2';
const XZDS_HISTORY_STATS_CACHE_PREFIX = 'XZDS_HISTORY_STATS_CACHE_v2:';

let historyStatsSerial_ = 0;
let historyDefaultStatsStarted_ = false;


document.addEventListener('DOMContentLoaded', function() {
  const user = requireLogin();

  if (!user) return;

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', logout);
  }

  const backBtn = document.getElementById('backBtn');
  if (backBtn) {
    backBtn.addEventListener('click', function() {
      location.href = 'home.html?v=20260731-4';
    });
  }

  const annualBtn = document.getElementById('annualBtn');
  if (annualBtn) {
    annualBtn.addEventListener('click', function() {
      location.href = 'annual.html?v=20260731-4';
    });
  }

  const templeSelect = document.getElementById('historyTempleSelect');

  if (templeSelect) {
    templeSelect.addEventListener('change', function() {
      const temple = templeSelect.value;

      if (temple) {
        setHistoryDistrictMode_(false);
        loadRecentDutyStats(temple);
      }
    });
  }

  const districtBtn = document.getElementById('districtBtn');
  if (districtBtn) {
    districtBtn.addEventListener('click', function() {
      if (templeSelect) {
        templeSelect.value = '';
      }
      setHistoryDistrictMode_(true);
      loadRecentDutyStats(XINZHUANG_DISTRICT_TOKEN);
    });
  }

  /*
   * 重要修正：近五年不再先等 getAllTemples 成功才開始讀統計。
   * 使用者登入資料本身已有壇名，先直接讀該壇近五年；壇名下拉改成背景補齊。
   * 這樣原本 2 個串聯 JSONP 的單點失敗，縮成主要資料只需 1 個 request。
   */
  const defaultTemple = String(user.temple || '').trim();
  if (defaultTemple) {
    historyDefaultStatsStarted_ = true;
    if (templeSelect) {
      templeSelect.innerHTML = '';
      const option = document.createElement('option');
      option.value = defaultTemple;
      option.textContent = defaultTemple;
      option.selected = true;
      templeSelect.appendChild(option);
      templeSelect.disabled = false;
    }
    loadRecentDutyStats(defaultTemple);
  }

  loadTempleOptions(user);
  loadHistorySharedLastUpdate_();
});


async function loadTempleOptions(user) {
  const templeSelect = document.getElementById('historyTempleSelect');
  if (!templeSelect) return;

  const cachedTemples = readHistoryTempleCache_();
  if (cachedTemples.length) {
    renderHistoryTempleOptions_(cachedTemples, user, false);
  } else if (!historyDefaultStatsStarted_) {
    templeSelect.innerHTML = '<option value="">讀取中...</option>';
    templeSelect.disabled = true;
  }

  try {
    const result = await callApi({
      action: 'getAllTemples'
    }, {
      timeoutMs: 12000,
      retryTimeoutMs: 15000,
      maxAttempts: 3,
      onRetry: function() {
        if (!historyDefaultStatsStarted_ && !cachedTemples.length) {
          showMessage('historyMessage', 'warning', '壇名清單正在重新確認…');
        }
      }
    });

    if (!result || !result.success) {
      throw new Error(result && result.message ? result.message : '壇名讀取失敗');
    }

    const temples = Array.isArray(result.temples) ? result.temples : [];
    writeHistoryTempleCache_(temples);
    renderHistoryTempleOptions_(temples, user, true);

    if (!historyDefaultStatsStarted_) {
      const matched = findMatchedTemple(temples, user.temple) || user.temple;
      if (matched) {
        historyDefaultStatsStarted_ = true;
        loadRecentDutyStats(matched);
      }
    }

  } catch (err) {
    if (cachedTemples.length) {
      renderHistoryTempleOptions_(cachedTemples, user, false);
    }

    if (historyDefaultStatsStarted_) {
      // 統計資料已另外讀取，不因壇名清單失敗把整頁判成失敗。
      return;
    }

    showMessage(
      'historyMessage',
      'error',
      err && err.message ? err.message : '壇名讀取失敗，請稍後再試'
    );
  }
}


function renderHistoryTempleOptions_(temples, user, fresh) {
  const templeSelect = document.getElementById('historyTempleSelect');
  if (!templeSelect) return;

  const current = String(templeSelect.value || '').trim();
  const userTemple = String(user && user.temple ? user.temple : '').trim();
  const preferred = current || findMatchedTemple(temples, userTemple) || userTemple;

  templeSelect.innerHTML = '<option value="">請選擇壇名</option>';

  temples.forEach(function(temple) {
    const option = document.createElement('option');
    option.value = temple;
    option.textContent = temple;
    templeSelect.appendChild(option);
  });

  if (preferred) {
    const matched = findMatchedTemple(temples, preferred) || preferred;
    templeSelect.value = matched;
  }

  templeSelect.disabled = false;

  if (fresh && document.getElementById('historyMessage')?.classList.contains('warning')) {
    clearMessage('historyMessage');
  }
}


async function loadRecentDutyStats(temple) {
  const serial = ++historyStatsSerial_;
  const area = document.getElementById('historyStatsArea');
  if (!area) return;

  const cached = readHistoryStatsCache_(temple);
  if (cached && cached.result) {
    renderRecentDutyStats(cached.result);
    showMessage('historyMessage', 'warning', '正在重新確認最新資料…');
  } else {
    clearMessage('historyMessage');
    area.innerHTML = '<div class="small-text">讀取中...</div>';
  }

  try {
    const result = await callApi({
      action: 'getRecentDutyStats',
      temple: temple
    }, {
      timeoutMs: 12000,
      retryTimeoutMs: 15000,
      maxAttempts: 3,
      onRetry: function() {
        if (serial !== historyStatsSerial_) return;
        showMessage('historyMessage', 'warning', '第一次連線未完成，正在自動重新確認…');
      }
    });

    if (serial !== historyStatsSerial_) return;

    if (!result || !result.success) {
      throw new Error(result && result.message ? result.message : '讀取失敗');
    }

    writeHistoryStatsCache_(temple, result);
    clearMessage('historyMessage');
    renderRecentDutyStats(result);

  } catch (err) {
    if (serial !== historyStatsSerial_) return;

    const fallback = cached || readHistoryStatsCache_(temple);
    if (fallback && fallback.result) {
      renderRecentDutyStats(fallback.result);
      showMessage(
        'historyMessage',
        'warning',
        '連線暫時不穩，目前顯示上次成功讀取資料。可稍後再重新整理。'
      );
      return;
    }

    showMessage(
      'historyMessage',
      'error',
      err && err.message ? err.message : '系統連線失敗，請稍後再試'
    );
    area.innerHTML = '';
  }
}


function readHistoryTempleCache_() {
  try {
    const raw = localStorage.getItem(XZDS_HISTORY_TEMPLE_CACHE_KEY);
    const data = raw ? JSON.parse(raw) : null;
    return data && Array.isArray(data.temples) ? data.temples : [];
  } catch (ignore) {
    return [];
  }
}


function writeHistoryTempleCache_(temples) {
  try {
    localStorage.setItem(
      XZDS_HISTORY_TEMPLE_CACHE_KEY,
      JSON.stringify({
        savedAt: Date.now(),
        temples: Array.isArray(temples) ? temples : []
      })
    );
  } catch (ignore) {}
}


function historyStatsCacheKey_(temple) {
  return XZDS_HISTORY_STATS_CACHE_PREFIX + encodeURIComponent(String(temple || ''));
}


function readHistoryStatsCache_(temple) {
  try {
    const raw = localStorage.getItem(historyStatsCacheKey_(temple));
    const data = raw ? JSON.parse(raw) : null;
    return data && data.result ? data : null;
  } catch (ignore) {
    return null;
  }
}


function writeHistoryStatsCache_(temple, result) {
  try {
    localStorage.setItem(
      historyStatsCacheKey_(temple),
      JSON.stringify({
        savedAt: Date.now(),
        result: result
      })
    );
  } catch (ignore) {}
}


function renderRecentDutyStats(result) {
  const area = document.getElementById('historyStatsArea');

  if (!area) return;

  const rows = result.rows || [];

  if (rows.length === 0) {
    area.innerHTML = `
      <div class="stat-card">
        <div class="small-text">
          ${escapeHtml(result.message || '查無近五年道務資料')}
        </div>
      </div>
    `;
    return;
  }

  const yearRangeText = result.yearRangeText || getYearRangeTextFromRows(rows);
  const templeName = getDisplayTempleName(result.temple);

  const qiudaoRows = rows.map(function(row) {
    return `
      <tr>
        <td>${escapeHtml(row.year)}</td>
        <td>${escapeHtml(formatZeroAsBlank(row.qiudao.target))}</td>
        <td>${escapeHtml(formatZeroAsBlank(row.qiudao.total))}</td>
        <td>${escapeHtml(formatZeroAsBlank(row.qiudao.achievementRate))}</td>
      </tr>
    `;
  }).join('');

  const fahuiRows = rows.map(function(row) {
    return `
      <tr>
        <td>${escapeHtml(row.year)}</td>
        <td>${escapeHtml(formatZeroAsBlank(row.fahui.target))}</td>
        <td>${escapeHtml(formatZeroAsBlank(row.fahui.total))}</td>
        <td>${escapeHtml(formatZeroAsBlank(row.fahui.achievementRate))}</td>
      </tr>
    `;
  }).join('');

  area.innerHTML = `
    <div class="stat-card">
      ${renderLineChart(rows, 'qiudao', '求道')}

      <div class="table-scroll">
        <table class="stat-table history-table">
          <thead>
            <tr>
              <th>年度</th>
              <th><span class="history-highlight history-highlight-qiudao">求道</span></th>
              <th>累計</th>
              <th>達成</th>
            </tr>
          </thead>
          <tbody>
            ${qiudaoRows}
          </tbody>
        </table>
      </div>
    </div>

    <div class="stat-card">
      ${renderLineChart(rows, 'fahui', '法會')}

      <div class="table-scroll">
        <table class="stat-table history-table">
          <thead>
            <tr>
              <th>年度</th>
              <th><span class="history-highlight history-highlight-fahui">法會</span></th>
              <th>累計</th>
              <th>達成</th>
            </tr>
          </thead>
          <tbody>
            ${fahuiRows}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderLineChart(rows, type, title) {
  const chartRows = rows.slice().reverse();

  const points = chartRows.map(function(row) {
    return {
      year: String(row.year),
      target: toNumber(row[type].target),
      total: toNumber(row[type].total)
    };
  });

  const validNumbers = [];

  points.forEach(function(item) {
    if (item.target > 0) validNumbers.push(item.target);
    if (item.total > 0) validNumbers.push(item.total);
  });

  if (validNumbers.length === 0) {
    return '<div class="small-text">目前沒有可繪製的圖表資料</div>';
  }

  const width = 320;
  const height = 190;
  const paddingLeft = 34;
  const paddingRight = 16;
  const paddingTop = 18;
  const paddingBottom = 36;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  const maxValue = Math.max.apply(null, validNumbers);
  const yMax = Math.ceil(maxValue * 1.15);

  function getX(index) {
    if (points.length === 1) {
      return paddingLeft + chartWidth / 2;
    }

    return paddingLeft + index * (chartWidth / (points.length - 1));
  }

  function getY(value) {
    if (!value || value <= 0) {
      return null;
    }

    return paddingTop + chartHeight - (value / yMax) * chartHeight;
  }

  function buildPath(key) {
    let path = '';

    points.forEach(function(item, index) {
      const y = getY(item[key]);

      if (y === null) return;

      const x = getX(index);

      if (!path) {
        path += `M ${x} ${y}`;
      } else {
        path += ` L ${x} ${y}`;
      }
    });

    return path;
  }

  function buildDots(key, className) {
    return points.map(function(item, index) {
      const y = getY(item[key]);

      if (y === null) return '';

      const x = getX(index);

      return `
        <circle class="${className}" cx="${x}" cy="${y}" r="3"></circle>
        <text class="chart-value" x="${x}" y="${y - 7}" text-anchor="middle">${item[key]}</text>
      `;
    }).join('');
  }

  const targetPath = buildPath('target');
  const totalPath = buildPath('total');

  const yearLabels = points.map(function(item, index) {
    const x = getX(index);

    return `
      <text class="chart-year" x="${x}" y="${height - 12}" text-anchor="middle">${item.year}</text>
    `;
  }).join('');

  return `
    <div class="line-chart-box">
      <div class="chart-legend">
        <span><i class="legend-target"></i>目標</span>
        <span><i class="legend-total"></i>累計</span>
      </div>

      <svg class="line-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(title)}近年趨勢圖">
        <line class="chart-axis" x1="${paddingLeft}" y1="${paddingTop}" x2="${paddingLeft}" y2="${height - paddingBottom}"></line>
        <line class="chart-axis" x1="${paddingLeft}" y1="${height - paddingBottom}" x2="${width - paddingRight}" y2="${height - paddingBottom}"></line>

        <line class="chart-grid" x1="${paddingLeft}" y1="${paddingTop}" x2="${width - paddingRight}" y2="${paddingTop}"></line>
        <text class="chart-max" x="4" y="${paddingTop + 4}">${yMax}</text>

        ${targetPath ? `<path class="chart-line chart-line-target" d="${targetPath}"></path>` : ''}
        ${totalPath ? `<path class="chart-line chart-line-total" d="${totalPath}"></path>` : ''}

        ${buildDots('target', 'chart-dot-target')}
        ${buildDots('total', 'chart-dot-total')}

        ${yearLabels}
      </svg>
    </div>
  `;
}

function toNumber(value) {
  const text = String(value || '')
    .replace(/,/g, '')
    .replace(/%/g, '')
    .trim();

  const number = Number(text);

  if (!isFinite(number)) {
    return 0;
  }

  return number;
}

function findMatchedTemple(temples, loginTemple) {
  const loginTempleText = normalizeTempleForDisplay(loginTemple);

  for (let i = 0; i < temples.length; i++) {
    if (temples[i] === loginTemple) {
      return temples[i];
    }

    if (normalizeTempleForDisplay(temples[i]) === loginTempleText) {
      return temples[i];
    }
  }

  return '';
}

function getDisplayTempleName(temple) {
  return normalizeTempleForDisplay(temple);
}

function normalizeTempleForDisplay(temple) {
  return String(temple || '')
    .trim()
    .replace(/^[123][ABCabc][_－\-\s]*/g, '');
}

function formatZeroAsBlank(value) {
  const text = String(value || '').trim();

  if (!text) return '';

  const normalized = text
    .replace(/,/g, '')
    .replace(/\s/g, '');

  if (
    normalized === '0' ||
    normalized === '0.0' ||
    normalized === '0.00' ||
    normalized === '0%' ||
    normalized === '0.0%' ||
    normalized === '0.00%'
  ) {
    return '';
  }

  return text;
}

function getYearRangeTextFromRows(rows) {
  if (!rows || rows.length === 0) {
    return '近五年道務';
  }

  const years = rows.map(function(row) {
    return Number(row.year);
  }).filter(function(year) {
    return isFinite(year);
  });

  if (years.length === 0) {
    return '近五年道務';
  }

  const yearStart = Math.min.apply(null, years);
  const yearEnd = Math.max.apply(null, years);

  return yearStart + '-' + yearEnd;
}


/* =========================
函式名稱：loadHistorySharedLastUpdate_
功能說明：
讀取與首頁相同來源的「最後更新」時間。
來源：
1. localStorage：taoReportLastUpdate
2. 後端 action：getTaoReportLastUpdate
========================= */
async function loadHistorySharedLastUpdate_() {
  const cachedLastUpdate = localStorage.getItem('taoReportLastUpdate');
  updateHistoryLastUpdateText_(cachedLastUpdate || '讀取中...');

  try {
    const result = await callApi({
      action: 'getTaoReportLastUpdate'
    });

    if (result.success && result.lastUpdate) {
      localStorage.setItem('taoReportLastUpdate', result.lastUpdate);
      updateHistoryLastUpdateText_(result.lastUpdate);
      return;
    }

    if (!cachedLastUpdate) {
      updateHistoryLastUpdateText_('尚未更新');
    }

  } catch (err) {
    if (!cachedLastUpdate) {
      updateHistoryLastUpdateText_('讀取失敗');
    }
  }
}

/* =========================
函式名稱：updateHistoryLastUpdateText_
功能說明：
更新近五年道務頁「最後更新」小字。
========================= */
function updateHistoryLastUpdateText_(text) {
  const area = document.getElementById('historyLastUpdateText');

  if (!area) return;

  area.textContent = '最後更新：' + (text || '尚未更新');
}
function setHistoryDistrictMode_(active) {
  const districtBtn = document.getElementById('districtBtn');
  if (!districtBtn) return;

  districtBtn.classList.toggle('is-active', Boolean(active));
  districtBtn.setAttribute('aria-pressed', active ? 'true' : 'false');
}
