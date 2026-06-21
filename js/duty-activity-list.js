/* =========================
程式名稱：duty-activity-list.js
功能說明：
道務活動列表頁專用程式。

主要用途：
1. 檢查登入狀態。
2. 顯示啟用中的道務活動列表。
3. admin 可從上方按鈕進入「道務活動設定」。
4. 一般 user 只會看到「首頁」與「登出」。

注意事項：
1. 本頁只讀取資料，不修改資料。
2. 本頁需要後端 action：
   - getDutyActivityList
   - getMyPermissions
========================= */

let visibleDutyActivities = [];

document.addEventListener('DOMContentLoaded', function () {
  const user = requireLogin();

  if (!user) return;

  bindActivityListButtons_();
  checkActivitySettingButtonPermission_();
  loadDutyActivityList_();
});

function bindActivityListButtons_() {
  const homeBtn = document.getElementById('homeBtn');
  const settingBtn = document.getElementById('settingBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const reloadBtn = document.getElementById('reloadActivityListBtn');

  if (homeBtn) {
    homeBtn.addEventListener('click', function () {
      location.href = 'home.html';
    });
  }

  if (settingBtn) {
    settingBtn.addEventListener('click', function () {
      location.href = 'duty-activity-admin.html';
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', function () {
      logout();
    });
  }

  if (reloadBtn) {
    reloadBtn.addEventListener('click', function () {
      loadDutyActivityList_();
    });
  }
}

async function checkActivitySettingButtonPermission_() {
  const settingBtn = document.getElementById('settingBtn');

  if (settingBtn) {
    settingBtn.style.display = 'none';
  }

  try {
    const result = await callApi({
      action: 'getMyPermissions'
    });

    const permissions = result.permissions || {};

    if (result.success && permissions.dutyActivityAdmin && settingBtn) {
      settingBtn.style.display = '';
    }

  } catch (err) {
    if (settingBtn) {
      settingBtn.style.display = 'none';
    }
  }
}

async function loadDutyActivityList_() {
  const area = document.getElementById('activityListArea');
  const stats = document.getElementById('activityListStats');
  const reloadBtn = document.getElementById('reloadActivityListBtn');

  showActivityListMessage_('', '');

  if (area) {
    area.innerHTML = '<div class="small-text">讀取道務活動中...</div>';
  }

  if (stats) {
    stats.textContent = '讀取中...';
  }

  if (reloadBtn) {
    reloadBtn.disabled = true;
  }

  try {
    const result = await callApi({
      action: 'getDutyActivityList'
    });

    if (!result.success) {
      throw new Error(result.message || '讀取失敗');
    }

    visibleDutyActivities = result.activities || [];

    renderDutyActivityList_();

  } catch (err) {
    if (area) {
      area.innerHTML = '<div class="small-text">讀取失敗</div>';
    }

    if (stats) {
      stats.textContent = '讀取失敗';
    }

    showActivityListMessage_(err.message || '系統連線失敗，請稍後再試', 'error');

  } finally {
    if (reloadBtn) {
      reloadBtn.disabled = false;
    }
  }
}

function renderDutyActivityList_() {
  const area = document.getElementById('activityListArea');
  const stats = document.getElementById('activityListStats');

  if (!area) return;

  if (stats) {
    stats.textContent = '共 ' + visibleDutyActivities.length + ' 筆活動';
  }

  if (visibleDutyActivities.length === 0) {
    area.innerHTML = '<div class="small-text">目前沒有啟用中的道務活動</div>';
    return;
  }

  const htmlParts = [];

  for (let i = 0; i < visibleDutyActivities.length; i++) {
    htmlParts.push(createActivityListCardHtml_(visibleDutyActivities[i]));
  }

  area.innerHTML = htmlParts.join('');
  bindActivityListCards_();
}

function createActivityListCardHtml_(item) {
  const title = escapeActivityListHtml_(item.activityName || '');
  const dateStart = escapeActivityListHtml_(formatActivityListDate_(item.dateStart || ''));
  const dateRange = escapeActivityListHtml_(formatActivityListDateRange_(item.dateStart, item.dateEnd));
  const peopleCount = escapeActivityListHtml_(item.peopleCount || '—');
  const location = escapeActivityListHtml_(item.location || '—');
  const planning = escapeActivityListHtml_(item.planning || '—');
  const note = escapeActivityListHtml_(item.note || '');

  return '' +
    '<div class="activity-list-item compact" data-note="' + note + '" data-date-range="' + dateRange + '" data-title="' + title + '">' +
      '<div class="activity-table-row activity-table-head">' +
        '<div>日期</div>' +
        '<div>道務活動</div>' +
        '<div>人數</div>' +
        '<div>地點</div>' +
        '<div>規劃</div>' +
      '</div>' +

      '<div class="activity-table-row activity-table-body">' +
        '<div>' + dateStart + '</div>' +
        '<div>' + title + '</div>' +
        '<div>' + peopleCount + '</div>' +
        '<div>' + location + '</div>' +
        '<div>' + planning + '</div>' +
      '</div>' +
    '</div>';
}

function bindActivityListCards_() {
  const cards = document.querySelectorAll('.activity-list-item.compact');

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];

    card.addEventListener('click', function () {
      const title = card.getAttribute('data-title') || '';
      const dateRange = card.getAttribute('data-date-range') || '';
      const note = card.getAttribute('data-note') || '';

      let text = title;

      if (dateRange) {
        text += '\\n日期：' + dateRange;
      }

      if (note) {
        text += '\\n\\n備註：' + note;
      } else {
        text += '\\n\\n備註：無';
      }

      alert(text);
    });
  }
}

function formatActivityListDate_(value) {
  const text = normalizeActivityListText_(value);

  if (!text) return '';

  const compact = text.replace(/[\/\-\.]/g, '');

  if (/^\d{8}$/.test(compact)) {
    return compact.substring(4, 6) + '/' + compact.substring(6, 8);
  }

  if (/^\d{4}[\/\-\.]\d{2}[\/\-\.]\d{2}$/.test(text)) {
    return text.substring(5).replace(/-/g, '/').replace(/\./g, '/');
  }

  return text;
}

function formatActivityListDateRange_(dateStart, dateEnd) {
  const startText = normalizeActivityListText_(dateStart);
  const endText = normalizeActivityListText_(dateEnd);

  if (!startText) return '';

  if (!endText || startText === endText) {
    return startText;
  }

  return startText + '～' + endText;
}


function showActivityListMessage_(text, type) {
  const el = document.getElementById('activityListMessage');

  if (!el) return;

  el.textContent = text || '';
  el.className = 'message';

  if (!text) {
    el.style.display = 'none';
    return;
  }

  el.classList.add(type === 'success' ? 'success' : 'error');
  el.style.display = 'block';
}

function normalizeActivityListText_(value) {
  return String(value || '')
    .replace(/\u3000/g, ' ')
    .trim();
}

function escapeActivityListHtml_(value) {
  return normalizeActivityListText_(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
