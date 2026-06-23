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

let allDutyActivities = [];
let visibleDutyActivities = [];
let selectedDutyActivityYear = '';

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

    allDutyActivities = sortDutyActivitiesByDateDesc_(result.activities || []);
    selectedDutyActivityYear = getDefaultDutyActivityYear_(allDutyActivities, selectedDutyActivityYear);
    renderDutyActivityYearFilter_();
    visibleDutyActivities = filterDutyActivitiesByYear_(allDutyActivities, selectedDutyActivityYear);

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
    stats.textContent = '共 ' + visibleDutyActivities.length + ' 筆活動' + (selectedDutyActivityYear ? '｜' + selectedDutyActivityYear : '');
  }

  if (visibleDutyActivities.length === 0) {
    area.innerHTML = '<div class="small-text">目前沒有啟用中的道務活動</div>';
    return;
  }

  const htmlParts = [];

  for (let i = 0; i < visibleDutyActivities.length; i++) {
    htmlParts.push(createActivityListCardHtml_(visibleDutyActivities[i], i));
  }

  area.innerHTML = htmlParts.join('');
  bindActivityListCards_();
}

function createActivityListCardHtml_(item, index) {
  const title = escapeActivityListHtml_(item.activityName || '');
  const dateStart = escapeActivityListHtml_(formatActivityListDateShort_(item.dateStart || ''));
  const dateRange = escapeActivityListHtml_(formatActivityListDateRange_(item.dateStart, item.dateEnd));
  const peopleCount = escapeActivityListHtml_(item.peopleCount || '—');
  const location = escapeActivityListHtml_(item.location || '');
  const planning = escapeActivityListHtml_(item.planning || '—');
  const note = escapeActivityListHtml_(item.note || '');

  return '' +
    '<div class="activity-list-item compact" data-index="' + String(index || 0) + '" data-date-range="' + dateRange + '" data-title="' + title + '">' +
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
  const index = Number(card.getAttribute('data-index') || 0);
  const item = visibleDutyActivities[index] || {};
  const note = item.note || '';

  showActivityDetailModal_(title, dateRange, note);
});

}

const closeBtn = document.getElementById('activityDetailCloseBtn');
const modal = document.getElementById('activityDetailModal');

if (closeBtn) {
closeBtn.onclick = closeActivityDetailModal_;
}

if (modal) {
const mask = modal.querySelector('.activity-detail-mask');

if (mask) {
  mask.onclick = closeActivityDetailModal_;
}

}
}

function showActivityDetailModal_(title, dateRange, note) {
const modal = document.getElementById('activityDetailModal');
const titleEl = document.getElementById('activityDetailTitle');
const dateEl = document.getElementById('activityDetailDate');
const noteEl = document.getElementById('activityDetailNote');

if (!modal) return;

if (titleEl) {
titleEl.textContent = title || '';
}

if (dateEl) {
dateEl.textContent = '';
dateEl.style.display = 'none';
}

if (noteEl) {
noteEl.innerHTML = renderActivityDetailNoteHtml_(note);
noteEl.style.whiteSpace = 'normal';
}

modal.style.display = 'flex';
}

function closeActivityDetailModal_() {
const modal = document.getElementById('activityDetailModal');

if (modal) {
modal.style.display = 'none';
}
}

function formatActivityListDate_(value) {
  const parts = parseActivityListDateParts_(value);

  if (!parts) {
    return normalizeActivityListText_(value);
  }

  return parts.year + '/' + parts.month + '/' + parts.day;
}

function formatActivityListDateRange_(dateStart, dateEnd) {
  const startText = formatActivityListDate_(dateStart);
  const endText = formatActivityListDate_(dateEnd);

  if (!startText) return '';

  if (!endText || startText === endText) {
    return startText;
  }

  return startText + '～' + endText;
}


/* =========================
函式名稱：renderDutyActivityYearFilter_
功能說明：
在「道務活動列表」標題左側建立年度下拉選單。
年度選項會依活動資料自動產生。
例如新增 2025 活動後會出現 2025；新增 2027 活動後會出現 2027。
========================= */
function renderDutyActivityYearFilter_() {
  const titleEl = findDutyActivityListTitle_();

  if (!titleEl) return;

  let wrapper = document.getElementById('activityYearFilterWrap');
  let select = document.getElementById('activityYearFilter');

  if (!wrapper) {
    wrapper = document.createElement('div');
    wrapper.id = 'activityYearFilterWrap';
    wrapper.className = 'activity-year-filter-wrap';

    select = document.createElement('select');
    select.id = 'activityYearFilter';
    select.className = 'activity-year-filter';
    select.setAttribute('aria-label', '選擇活動年度');

    wrapper.appendChild(select);
    titleEl.parentNode.insertBefore(wrapper, titleEl);

    injectDutyActivityYearFilterStyle_();

    select.addEventListener('change', function() {
      selectedDutyActivityYear = select.value;
      visibleDutyActivities = filterDutyActivitiesByYear_(allDutyActivities, selectedDutyActivityYear);
      renderDutyActivityList_();
    });
  }

  const years = getDutyActivityYears_(allDutyActivities);

  select.innerHTML = '';

  years.forEach(function(year) {
    const option = document.createElement('option');
    option.value = year;
    option.textContent = year;
    select.appendChild(option);
  });

  if (!selectedDutyActivityYear && years.length > 0) {
    selectedDutyActivityYear = years[0];
  }

  select.value = selectedDutyActivityYear;
}

/* =========================
函式名稱：findDutyActivityListTitle_
功能說明：
尋找頁面上的「道務活動列表」標題。
避免一定要修改 HTML，也能由 JS 自動把年度選單插入標題左側。
========================= */
function findDutyActivityListTitle_() {
  const headings = document.querySelectorAll('h1, h2');

  for (let i = 0; i < headings.length; i++) {
    if (normalizeActivityListText_(headings[i].textContent) === '道務活動列表') {
      return headings[i];
    }
  }

  return null;
}

/* =========================
函式名稱：getDutyActivityYears_
功能說明：
從活動日期中抓出所有年度，並由新到舊排列。
========================= */
function getDutyActivityYears_(activities) {
  const map = {};

  activities.forEach(function(item) {
    const parts = parseActivityListDateParts_(item && item.dateStart);

    if (parts && parts.year) {
      map[parts.year] = true;
    }
  });

  return Object.keys(map).sort(function(a, b) {
    return Number(b) - Number(a);
  });
}

/* =========================
函式名稱：getDefaultDutyActivityYear_
功能說明：
預設年度優先使用今年；若今年沒有資料，就使用資料中最新年度。
========================= */
function getDefaultDutyActivityYear_(activities, currentYear) {
  const years = getDutyActivityYears_(activities);

  if (currentYear && years.indexOf(currentYear) !== -1) {
    return currentYear;
  }

  const thisYear = String(new Date().getFullYear());

  if (years.indexOf(thisYear) !== -1) {
    return thisYear;
  }

  return years[0] || '';
}

/* =========================
函式名稱：filterDutyActivitiesByYear_
功能說明：
依年度下拉選單篩選活動。
========================= */
function filterDutyActivitiesByYear_(activities, year) {
  if (!year) return activities.slice();

  return activities.filter(function(item) {
    const parts = parseActivityListDateParts_(item && item.dateStart);

    return parts && parts.year === year;
  });
}

/* =========================
函式名稱：formatActivityListDateShort_
功能說明：
活動列表日期欄位只顯示月日，例如 05/31。
年度改由上方年度下拉選單辨識。
========================= */
function formatActivityListDateShort_(value) {
  const parts = parseActivityListDateParts_(value);

  if (!parts) {
    return normalizeActivityListText_(value);
  }

  return parts.month + '/' + parts.day;
}

/* =========================
函式名稱：injectDutyActivityYearFilterStyle_
功能說明：
加入年度下拉選單樣式，讓它放在標題左側並符合目前介面。
========================= */
function injectDutyActivityYearFilterStyle_() {
  if (document.getElementById('activityYearFilterStyle')) return;

  const style = document.createElement('style');
  style.id = 'activityYearFilterStyle';
  style.textContent = `
    .activity-year-filter-wrap {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      margin: 0 12px 0 0;
      vertical-align: middle;
    }

    .activity-year-filter {
      min-width: 92px;
      height: 42px;
      padding: 0 14px;
      border: 1px solid #cfd8e5;
      border-radius: 14px;
      background: #ffffff;
      color: #07365f;
      font-size: 18px;
      font-weight: 800;
      outline: none;
    }

    @media (max-width: 600px) {
      .activity-year-filter-wrap {
        margin-right: 10px;
      }

      .activity-year-filter {
        min-width: 82px;
        height: 38px;
        font-size: 16px;
        border-radius: 12px;
      }
    }
  `;

  document.head.appendChild(style);
}

/* =========================
函式名稱：sortDutyActivitiesByDateDesc_
功能說明：
將道務活動依照「日期起」排序。
日期越新的活動排越上面，日期越舊的活動排越下面。
========================= */
function sortDutyActivitiesByDateDesc_(activities) {
  return activities.slice().sort(function(a, b) {
    const timeA = getActivityListDateTime_(a && a.dateStart);
    const timeB = getActivityListDateTime_(b && b.dateStart);

    if (timeA !== timeB) {
      return timeB - timeA;
    }

    const idA = Number((a && a.id) || 0);
    const idB = Number((b && b.id) || 0);

    return idB - idA;
  });
}

/* =========================
函式名稱：getActivityListDateTime_
功能說明：
將活動日期轉成排序用時間戳。
========================= */
function getActivityListDateTime_(value) {
  const parts = parseActivityListDateParts_(value);

  if (!parts) {
    return 0;
  }

  return new Date(Number(parts.year), Number(parts.month) - 1, Number(parts.day)).getTime();
}

/* =========================
函式名稱：parseActivityListDateParts_
功能說明：
解析 2026/04/04、2026-04-04、20260404 等日期格式。
========================= */
function parseActivityListDateParts_(value) {
  const text = normalizeActivityListText_(value);

  if (!text) return null;

  const compact = text.replace(/[\/\-\.]/g, '');

  if (/^\d{8}$/.test(compact)) {
    return {
      year: compact.substring(0, 4),
      month: compact.substring(4, 6),
      day: compact.substring(6, 8)
    };
  }

  return null;
}

/* =========================
函式名稱：formatActivityListDateHtml_
功能說明：
活動列表日期欄位顯示年度，方便辨識跨年度活動。
手機上會分成兩行顯示：
2026
04/04
========================= */
function formatActivityListDateHtml_(value) {
  const parts = parseActivityListDateParts_(value);

  if (!parts) {
    return escapeActivityListHtml_(normalizeActivityListText_(value));
  }

  return '' +
    '<span class="activity-list-date-year">' + escapeActivityListHtml_(parts.year) + '</span>' +
    '<br>' +
    '<span class="activity-list-date-md">' + escapeActivityListHtml_(parts.month + '/' + parts.day) + '</span>';
}

/* =========================
函式名稱：renderActivityDetailNoteHtml_
功能說明：
將活動備註轉成美編後的 HTML。
若為「求道統計+壇名」備註，會顯示成對齊表格。
其他備註則維持一般文字顯示。
========================= */
function renderActivityDetailNoteHtml_(note) {
  const text = String(note || '').trim();

  if (!text) {
    return '<div class="activity-detail-note-empty">備註：無</div>';
  }

  const parsed = parseReceiveByTempleNote_(text);

  if (!parsed) {
    return '<div class="activity-detail-note-text">備註：' + escapeActivityListHtml_(text) + '</div>';
  }

  injectActivityDetailNoteStyle_();

  const rowsHtml = parsed.rows.map(function(row) {
    const isTotal = row.temple === '合計';

    return '' +
      '<tr class="' + (isTotal ? 'is-total' : '') + '">' +
        '<td class="temple-cell">' + escapeActivityListHtml_(row.temple) + '</td>' +
        '<td>' + escapeActivityListHtml_(row.total) + '</td>' +
        '<td>' + escapeActivityListHtml_(formatActivityNoteZeroBlank_(row.qian)) + '</td>' +
        '<td>' + escapeActivityListHtml_(formatActivityNoteZeroBlank_(row.kun)) + '</td>' +
        '<td>' + escapeActivityListHtml_(formatActivityNoteZeroBlank_(row.tong)) + '</td>' +
        '<td>' + escapeActivityListHtml_(formatActivityNoteZeroBlank_(row.nv)) + '</td>' +
      '</tr>';
  }).join('');

  return '' +
    '<div class="activity-detail-note-card">' +
      '<div class="activity-detail-note-title">備註：求道統計+壇名</div>' +
      '<div class="activity-detail-note-meta">' +
        '<div><span>期間</span>' + escapeActivityListHtml_(parsed.period || '') + '</div>' +
        '<div><span>地點</span>' + escapeActivityListHtml_(parsed.location || '') + '</div>' +
      '</div>' +
      '<div class="activity-detail-note-table-wrap">' +
        '<table class="activity-detail-note-table">' +
          '<thead>' +
            '<tr>' +
              '<th>所屬佛堂</th>' +
              '<th>人數</th>' +
              '<th>乾</th>' +
              '<th>坤</th>' +
              '<th>童</th>' +
              '<th>女</th>' +
            '</tr>' +
          '</thead>' +
          '<tbody>' + rowsHtml + '</tbody>' +
        '</table>' +
      '</div>' +
    '</div>';
}

/* =========================
函式名稱：parseReceiveByTempleNote_
功能說明：
解析「求道統計+壇名」備註。
支援有換行 / tab 的新格式，也支援被瀏覽器壓成空白的一行格式。
========================= */
function parseReceiveByTempleNote_(note) {
  const text = String(note || '').trim();

  if (text.indexOf('求道統計+壇名') < 0 || text.indexOf('所屬佛堂') < 0) {
    return null;
  }

  const periodMatch = text.match(/(?:期間|統計期間)：?\s*([0-9\/\-]+(?:～|~)[0-9\/\-]+)/);
  const locationMatch = text.match(/(?:地點|輸入地點)：?\s*([^\s\n\t]+)/);

  const period = periodMatch ? periodMatch[1] : '';
  const location = locationMatch ? locationMatch[1] : '';

  let rows = [];

  if (text.indexOf('\t') >= 0 || text.indexOf('\n') >= 0) {
    rows = parseReceiveByTempleNoteRowsFromLines_(text);
  }

  if (rows.length === 0) {
    rows = parseReceiveByTempleNoteRowsFromFlatText_(text);
  }

  if (rows.length === 0) {
    return null;
  }

  return {
    period: period,
    location: location,
    rows: rows
  };
}

/* =========================
函式名稱：parseReceiveByTempleNoteRowsFromLines_
功能說明：
從換行 / tab 格式解析各壇統計資料。
========================= */
function parseReceiveByTempleNoteRowsFromLines_(text) {
  const rows = [];
  const lines = String(text || '').split(/\r?\n/);

  lines.forEach(function(line) {
    const cleanLine = line.trim();

    if (!cleanLine) return;
    if (cleanLine.indexOf('所屬佛堂') >= 0) return;
    if (cleanLine.indexOf('求道統計+壇名') >= 0) return;
    if (cleanLine.indexOf('期間：') >= 0) return;
    if (cleanLine.indexOf('地點：') >= 0) return;

    const parts = cleanLine.split(/\t+|\s{2,}/).map(function(part) {
      return part.trim();
    }).filter(Boolean);

    if (parts.length >= 6 && isActivityNoteNumber_(parts[1])) {
      rows.push({
        temple: parts[0],
        total: parts[1],
        qian: parts[2],
        kun: parts[3],
        tong: parts[4],
        nv: parts[5]
      });
      return;
    }

    const match = cleanLine.match(/^(.+?)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$/);

    if (match) {
      rows.push({
        temple: match[1].trim(),
        total: match[2],
        qian: match[3],
        kun: match[4],
        tong: match[5],
        nv: match[6]
      });
    }
  });

  return rows;
}

/* =========================
函式名稱：parseReceiveByTempleNoteRowsFromFlatText_
功能說明：
當備註被壓成一整行時，仍嘗試解析各壇統計資料。
========================= */
function parseReceiveByTempleNoteRowsFromFlatText_(text) {
  const rows = [];
  const headerIndex = text.indexOf('所屬佛堂');

  if (headerIndex < 0) return rows;

  let body = text.substring(headerIndex);
  body = body.replace(/^所屬佛堂\s*人數\s*乾\s*坤\s*童\s*女\s*/, '');
  body = body.replace(/說明：[\s\S]*$/, '');
  body = body.trim();

  const regex = /([^\s]+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/g;
  let match;

  while ((match = regex.exec(body)) !== null) {
    rows.push({
      temple: match[1],
      total: match[2],
      qian: match[3],
      kun: match[4],
      tong: match[5],
      nv: match[6]
    });
  }

  return rows;
}

/* =========================
函式名稱：isActivityNoteNumber_
功能說明：
判斷文字是否為數字。
========================= */
function isActivityNoteNumber_(value) {
  return /^\d+$/.test(String(value || '').trim());
}

/* =========================
函式名稱：formatActivityNoteZeroBlank_
功能說明：
備註表格中，乾坤童女欄位若為 0，改成空白不顯示。
========================= */
function formatActivityNoteZeroBlank_(value) {
  const text = String(value || '').trim();

  if (text === '0' || text === '0.0' || text === '0.00') {
    return '';
  }

  return text;
}


/* =========================
函式名稱：injectActivityDetailNoteStyle_
功能說明：
加入活動詳情備註表格樣式。
表格會依文字內容自動縮放，不會固定撐滿整個彈窗。
========================= */
function injectActivityDetailNoteStyle_() {
  if (document.getElementById('activityDetailNoteStyle')) return;

  const style = document.createElement('style');
  style.id = 'activityDetailNoteStyle';
  style.textContent = `
    .activity-detail-note-card {
      margin-top: 12px;
      line-height: 1.38;
      color: #1f2d3d;
    }

    .activity-detail-note-title {
      font-size: 17px;
      font-weight: 800;
      color: #07365f;
      margin-bottom: 8px;
    }

    .activity-detail-note-meta {
      display: grid;
      gap: 4px;
      margin-bottom: 10px;
      font-size: 14px;
      color: #34495e;
    }

    .activity-detail-note-meta span {
      display: inline-block;
      min-width: 38px;
      margin-right: 6px;
      font-weight: 800;
      color: #07365f;
    }

    .activity-detail-note-table-wrap {
      display: block;
      width: 100%;
      overflow-x: auto;
      border: 1px solid #d8e2ee;
      border-radius: 10px;
      background: #ffffff;
    }

    .activity-detail-note-table {
      width: auto;
      min-width: 0;
      max-width: none;
      border-collapse: collapse;
      table-layout: auto;
      font-size: 13px;
      margin: 0;
    }

    .activity-detail-note-table th,
    .activity-detail-note-table td {
      border-bottom: 1px solid #e0e8f2;
      border-right: 1px solid #e0e8f2;
      padding: 5px 7px;
      text-align: center;
      white-space: nowrap;
      line-height: 1.25;
    }

    .activity-detail-note-table th:last-child,
    .activity-detail-note-table td:last-child {
      border-right: 0;
    }

    .activity-detail-note-table tr:last-child td {
      border-bottom: 0;
    }

    .activity-detail-note-table th {
      background: #f3f7fc;
      color: #07365f;
      font-weight: 800;
    }

    .activity-detail-note-table .temple-cell {
      text-align: center;
      font-weight: 700;
      min-width: 76px;
    }

    .activity-detail-note-table td:not(.temple-cell),
    .activity-detail-note-table th:not(:first-child) {
      min-width: 34px;
    }

    .activity-detail-note-table tr.is-total td {
      background: #f8fbff;
      font-weight: 900;
      color: #07365f;
    }

    .activity-detail-note-empty,
    .activity-detail-note-text {
      white-space: pre-line;
      line-height: 1.7;
    }

    @media (max-width: 600px) {
      .activity-detail-note-title {
        font-size: 16px;
      }

      .activity-detail-note-meta {
        font-size: 13px;
      }

      .activity-detail-note-table {
        font-size: 12.5px;
      }

      .activity-detail-note-table th,
      .activity-detail-note-table td {
        padding: 5px 6px;
      }

      .activity-detail-note-table .temple-cell {
        min-width: 72px;
      }

      .activity-detail-note-table td:not(.temple-cell),
      .activity-detail-note-table th:not(:first-child) {
        min-width: 30px;
      }
    }
  `;

  document.head.appendChild(style);
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
