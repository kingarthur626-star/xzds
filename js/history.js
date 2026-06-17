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

  const rows = result.rows.map(function(row) {
    return `
      <tr>
        <td>${escapeHtml(row.year)}</td>
        <td>${escapeHtml(formatZeroAsBlank(row.qiudao.target))}</td>
        <td>${escapeHtml(formatZeroAsBlank(row.qiudao.total))}</td>
        <td>${escapeHtml(formatZeroAsBlank(row.qiudao.achievementRate))}</td>
        <td>${escapeHtml(formatZeroAsBlank(row.fahui.target))}</td>
        <td>${escapeHtml(formatZeroAsBlank(row.fahui.total))}</td>
        <td>${escapeHtml(formatZeroAsBlank(row.fahui.achievementRate))}</td>
      </tr>
    `;
  }).join('');

  area.innerHTML = `
    <div class="stat-card">
      <h2>2022-2026 道務統計 - ${escapeHtml(getDisplayTempleName(result.temple))}</h2>

      <div class="table-scroll">
        <table class="stat-table history-table">
          <thead>
            <tr>
              <th>年度</th>
              <th>求道目標</th>
              <th>累計</th>
              <th>達成%</th>
              <th>法會目標</th>
              <th>累計</th>
              <th>達成%</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    </div>
  `;
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