document.addEventListener('DOMContentLoaded', function() {
  const user = requireLogin();

  if (!user) return;

  const annualTitle = document.getElementById('annualTitle');
  if (annualTitle) {
    annualTitle.textContent = user.temple + ' ' + getAnnualDisplayYear_() + '道務統計';
  }

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
  loadAnnualSharedLastUpdate_();
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
    loadAnnualSharedLastUpdate_();

  } catch (err) {
    showMessage('annualMessage', 'error', err.message || '系統連線失敗，請稍後再試');
  }
}

function renderAnnualStats(result) {
  const area = document.getElementById('annualStatsArea');

  // 不顯示「2A_顓德｜2026 年 1月到6月 統計」
  area.innerHTML = `
    ${renderCombinedStats(result)}
  `;
}

function renderCombinedStats(result) {
  const qiudao = result.data.qiudao;
  const fahui = result.data.fahui;

  const monthRows = [];

  for (let month = 1; month <= result.monthLimit; month++) {
    const qiudaoValue = getMonthValue(qiudao, month);
    const fahuiValue = getMonthValue(fahui, month);

    monthRows.push(`
      <tr>
        <td>${month}月</td>
        <td>${escapeHtml(qiudaoValue)}</td>
        <td>${escapeHtml(fahuiValue)}</td>
      </tr>
    `);
  }

  return `
    <div class="stat-card">
      <div id="annualLastUpdateText" class="last-update-mini annual-last-update-top"></div>
<div class="stat-summary">
        <div class="stat-box">
          <div class="stat-label">求道年度目標</div>
          <div class="stat-value">${escapeHtml(getStatValue(qiudao, 'annualTarget'))}</div>
        </div>

        <div class="stat-box">
          <div class="stat-label">求道今年累計</div>
          <div class="stat-value">${escapeHtml(getStatValue(qiudao, 'ytdTotal'))}</div>
        </div>

        <div class="stat-box">
          <div class="stat-label">法會年度目標</div>
          <div class="stat-value">${escapeHtml(getStatValue(fahui, 'annualTarget'))}</div>
        </div>

        <div class="stat-box">
          <div class="stat-label">法會今年累計</div>
          <div class="stat-value">${escapeHtml(getStatValue(fahui, 'ytdTotal'))}</div>
        </div>

        <div class="stat-box">
          <div class="stat-label">求道達成率</div>
          <div class="stat-value">${escapeHtml(getStatValue(qiudao, 'achievementRate'))}</div>
        </div>

        <div class="stat-box">
          <div class="stat-label">法會達成率</div>
          <div class="stat-value">${escapeHtml(getStatValue(fahui, 'achievementRate'))}</div>
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
    return '0';
  }

  const monthData = item.months.find(function(m) {
    return Number(m.month) === Number(month);
  });

  if (!monthData) {
    return '0';
  }

  return monthData.value || '0';
}

function getStatValue(item, key) {
  if (!item || !item.found) {
    return '0';
  }

  return item[key] || '0';
}

/* =========================
函式名稱：loadAnnualSharedLastUpdate_
功能說明：
讀取與首頁相同來源的「最後更新」時間。
來源：
1. localStorage：taoReportLastUpdate
2. 後端 action：getTaoReportLastUpdate
========================= */
async function loadAnnualSharedLastUpdate_() {
  const cachedLastUpdate = localStorage.getItem('taoReportLastUpdate');
  updateAnnualLastUpdateText_(cachedLastUpdate || '讀取中...');

  try {
    const result = await callApi({
      action: 'getTaoReportLastUpdate'
    });

    if (result.success && result.lastUpdate) {
      localStorage.setItem('taoReportLastUpdate', result.lastUpdate);
      updateAnnualLastUpdateText_(result.lastUpdate);
      return;
    }

    if (!cachedLastUpdate) {
      updateAnnualLastUpdateText_('尚未更新');
    }

  } catch (err) {
    if (!cachedLastUpdate) {
      updateAnnualLastUpdateText_('讀取失敗');
    }
  }
}

/* =========================
函式名稱：updateAnnualLastUpdateText_
功能說明：
更新今年道務頁「最後更新」小字。
========================= */
function updateAnnualLastUpdateText_(text) {
  const area = document.getElementById('annualLastUpdateText');

  if (!area) return;

  area.textContent = '最後更新：' + (text || '尚未更新');
}


/* =========================
函式名稱：getAnnualDisplayYear_
功能說明：
取得今年道務頁標題顯示年度。
若未來到 2027 年，會自動顯示 2027道務統計。
========================= */
function getAnnualDisplayYear_() {
  return new Date().getFullYear();
}
