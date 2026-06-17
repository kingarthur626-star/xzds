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
      location.href = 'home.html';
    });
  }

  const templeSelect = document.getElementById('historyTempleSelect');
  templeSelect.addEventListener('change', function() {
    const temple = templeSelect.value;

    if (temple) {
      loadRecentDutyStats(temple);
    }
  });

  loadTempleOptions(user);
});

async function loadTempleOptions(user) {
  clearMessage('historyMessage');

  const templeSelect = document.getElementById('historyTempleSelect');
  const area = document.getElementById('historyStatsArea');

  templeSelect.innerHTML = '<option value="">讀取中...</option>';
  templeSelect.disabled = true;
  area.innerHTML = '<div class="small-text">讀取中...</div>';

  try {
    const result = await callApi({
      action: 'getAllTemples'
    });

    if (!result.success) {
      showMessage('historyMessage', 'error', result.message || '壇名讀取失敗');
      area.innerHTML = '';
      return;
    }

    templeSelect.innerHTML = '<option value="">請選擇壇名</option>';

    result.temples.forEach(function(temple) {
      const option = document.createElement('option');
      option.value = temple;
      option.textContent = temple;
      templeSelect.appendChild(option);
    });

    templeSelect.disabled = false;

    const defaultTemple = findMatchedTemple(result.temples, user.temple) || user.temple;

    if (defaultTemple) {
      templeSelect.value = defaultTemple;
      loadRecentDutyStats(defaultTemple);
    }

  } catch (err) {
    showMessage('historyMessage', 'error', err.message || '壇名讀取失敗，請稍後再試');
    area.innerHTML = '';
  }
}

async function loadRecentDutyStats(temple) {
  clearMessage('historyMessage');

  const area = document.getElementById('historyStatsArea');
  area.innerHTML = '<div class="small-text">讀取中...</div>';

  try {
    const result = await callApi({
      action: 'getRecentDutyStats',
      temple: temple
    });

    if (!result.success) {
      showMessage('historyMessage', 'error', result.message || '讀取失敗');
      area.innerHTML = '';
      return;
    }

    renderRecentDutyStats(result);

  } catch (err) {
    showMessage('historyMessage', 'error', err.message || '系統連線失敗，請稍後再試');
    area.innerHTML = '';
  }
}

function renderRecentDutyStats(result) {
  const area = document.getElementById('historyStatsArea');

  const qiudaoRows = result.rows.map(function(row) {
    return `
      <tr>
        <td>${escapeHtml(row.year)}</td>
        <td>${escapeHtml(formatZeroAsBlank(row.qiudao.target))}</td>
        <td>${escapeHtml(formatZeroAsBlank(row.qiudao.total))}</td>
        <td>${escapeHtml(formatZeroAsBlank(row.qiudao.achievementRate))}</td>
      </tr>
    `;
  }).join('');

  const fahuiRows = result.rows.map(function(row) {
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
      <h2>2022-2026 <span class="title-qiudao">求道</span> - ${escapeHtml(getDisplayTempleName(result.temple))}</h2>

      ${renderLineChart(result.rows, 'qiudao', '求道')}

      <div class="table-scroll">
        <table class="stat-table history-table">
          <thead>
            <tr>
              <th>年度</th>
              <th>求道</th>
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
      <h2>2022-2026 <span class="title-fahui">法會</span> - ${escapeHtml(getDisplayTempleName(result.temple))}</h2>

      ${renderLineChart(result.rows, 'fahui', '法會')}

      <div class="table-scroll">
        <table class="stat-table history-table">
          <thead>
            <tr>
              <th>年度</th>
              <th>法會</th>
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