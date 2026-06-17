document.addEventListener('DOMContentLoaded', function() {
  const user = requireLogin();

  if (!user) return;

  document.getElementById('annualTitle').textContent = user.temple + ' 今年道務';

  // 不顯示「壇名　姓名」
  const userInfo = document.getElementById('userInfo');
  if (userInfo) {
    userInfo.style.display = 'none';
  }

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

  loadAnnualStats(user);
});

async function loadAnnualStats(user) {
  clearMessage('annualMessage');

  const area = document.getElementById('annualStatsArea');
  area.innerHTML = '';

  try {
    const result = await callApi({
      action: 'getAnnualStats',
      temple: user.temple
    });

    if (!result.success) {
      showMessage('annualMessage', 'error', result.message || '讀取失敗');
      return;
    }

    renderAnnualStats(result);

  } catch (err) {
    showMessage('annualMessage', 'error', err.message || '系統連線失敗，請稍後再試');
  }
}

function renderAnnualStats(result) {
  const area = document.getElementById('annualStatsArea');

  // 不顯示「壇名｜2026 年 1月到6月 統計」
  area.innerHTML = renderCombinedStats(result);
}

function renderCombinedStats(result) {
  const qiudao = result.data.qiudao;
  const fahui = result.data.fahui;

  const monthRows = [];

  for (let month = 1; month <= result.monthLimit; month++) {
    const qiudaoValue = formatZeroAsBlank(getMonthValue(qiudao, month));
    const fahuiValue = formatZeroAsBlank(getMonthValue(fahui, month));

    monthRows.push(`
      <tr>
        <td>${month}</td>
        <td>${escapeHtml(qiudaoValue)}</td>
        <td>${escapeHtml(fahuiValue)}</td>
      </tr>
    `);
  }

  return `
    <div class="stat-card">
      <h2>2026道務統計</h2>

      <div class="stat-summary">
        <div class="stat-box">
          <div class="stat-label">求道年度目標</div>
          <div class="stat-value">${escapeHtml(formatZeroAsBlank(getStatValue(qiudao, 'annualTarget')))}</div>
        </div>

        <div class="stat-box">
          <div class="stat-label">法會年度目標</div>
          <div class="stat-value">${escapeHtml(formatZeroAsBlank(getStatValue(fahui, 'annualTarget')))}</div>
        </div>

        <div class="stat-box">
          <div class="stat-label">求道累計</div>
          <div class="stat-value">${escapeHtml(formatZeroAsBlank(getStatValue(qiudao, 'ytdTotal')))}</div>
        </div>

        <div class="stat-box">
          <div class="stat-label">法會累計</div>
          <div class="stat-value">${escapeHtml(formatZeroAsBlank(getStatValue(fahui, 'ytdTotal')))}</div>
        </div>

        <div class="stat-box">
          <div class="stat-label">求道達成率</div>
          <div class="stat-value">${escapeHtml(formatZeroAsBlank(getStatValue(qiudao, 'achievementRate')))}</div>
        </div>

        <div class="stat-box">
          <div class="stat-label">法會達成率</div>
          <div class="stat-value">${escapeHtml(formatZeroAsBlank(getStatValue(fahui, 'achievementRate')))}</div>
        </div>
      </div>

      <table class="stat-table">
        <thead>
          <tr>
            <th>月份</th>
            <th>求道</th>
            <th>法會</th>
          </tr>
        </thead>
        <tbody>
          ${monthRows.join('')}
        </tbody>
      </table>
    </div>
  `;
}

function getMonthValue(item, month) {
  if (!item || !item.found || !item.months) {
    return '';
  }

  const monthData = item.months.find(function(m) {
    return Number(m.month) === Number(month);
  });

  if (!monthData) {
    return '';
  }

  return monthData.value || '';
}

function getStatValue(item, key) {
  if (!item || !item.found) {
    return '';
  }

  return item[key] || '';
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
