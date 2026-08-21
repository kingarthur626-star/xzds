/* =========================
程式名稱：duty-activity-list.js
功能說明：
道務活動列表頁專用程式。

主要用途：
1. 檢查登入狀態。
2. 顯示啟用中的道務活動列表。
3. admin 可從上方按鈕進入「道務活動設定」。
4. 一般 user 只會看到「首頁」與「登出」。
5. R17：壇名與壇名資料強制置中；所有活動共用固定按鈕列；小計移除「間」；0 隱藏；雙組分享圖片置中。

注意事項：
1. 本頁只讀取資料，不修改資料。
2. 本頁需要後端 action：
   - getDutyActivityList
   - getMyPermissions
========================= */

let allDutyActivities = [];
let visibleDutyActivities = [];
let selectedDutyActivityYear = '';
let activityDetailBodyScrollY_ = 0;
let activityDetailTouchStartY_ = 0;
let activityDetailTouchStartScrollTop_ = 0;
let activityDetailTouchBound_ = false;
let activityDetailViewportHandlerBound_ = false;

let currentDutyActivityDetail_ = null;
let activityShareFile_ = null;
let activityShareObjectUrl_ = '';
let activitySharePrepareToken_ = 0;

const DUTY_ACTIVITY_LIST_SESSION_KEY = 'xzds.dutyActivityList.v1';
const DUTY_ACTIVITY_LIST_PERSISTENT_CACHE_KEY = 'xzds.dutyActivityList.persistent.v1';
const DUTY_ACTIVITY_DETAIL_SESSION_KEY = 'xzds.dutyActivityDetail.v1';

const DUTY_ACTIVITY_TEMPLE_ORDER_R15 = [
  "1A_瑩德",
  "1A_選德",
  "1A_聯德",
  "1A_均德",
  "1A_樹德",
  "1A_閎德",
  "1A_誠德",
  "1A_禛德",
  "1B_益德",
  "1B_捷德",
  "1B_仝德",
  "1B_愿德",
  "1B_永德",
  "1B_代德",
  "1B_茁德",
  "1B_根德",
  "1C_信德",
  "1C_覺德",
  "1C_心德",
  "1C_英德",
  "1C_山德",
  "1C_秝德",
  "1C_如德",
  "1C_居德",
  "1C_谷德",
  "1C_懋德",
  "1C_煜德",
  "1C_醒德",
  "2A_頌德",
  "2A_顓德",
  "2A_薪德",
  "2A_田德",
  "2A_庚德",
  "2A_航德",
  "2A_季德",
  "2A_記德",
  "2A_蘊德",
  "2A_原德",
  "2B_琳德",
  "2B_綝德",
  "2B_胤德",
  "2B_是德",
  "2B_昊德",
  "2B_先德",
  "2B_渡德",
  "2B_領德",
  "3A_和德",
  "3A_標德",
  "3A_聞德",
  "3A_晉德",
  "3A_鳳德",
  "3A_皆德",
  "3A_佑德",
  "3A_靜德",
  "3B_文德",
  "3B_朗德",
  "3B_慕德",
  "3B_翰德",
  "3B_量德",
  "3B_融德",
  "3B_望德",
  "3B_璿德",
  "3C_端德",
  "3C_騰德",
  "3C_蓁德",
  "3C_述德",
  "3C_印德",
  "3C_旺德",
  "3C_品德"
];

const DUTY_ACTIVITY_TEMPLE_ORDER_INDEX_R15 = DUTY_ACTIVITY_TEMPLE_ORDER_R15.reduce(function(map, name, index) {
  map[normalizeDutyActivityTempleKeyR15_(name)] = index;
  return map;
}, {});

document.addEventListener('DOMContentLoaded', function () {
  const user = requireLogin();

  if (!user) return;

  if (document.body.classList.contains('duty-activity-detail-page')) {
    initDutyActivityDetailPage_();
    return;
  }

  bindActivityListButtons_();
  bindActivityDetailModalActions_();
  checkActivitySettingButtonPermission_();
  loadDutyActivityList_();
});

function bindActivityDetailModalActions_() {
  const modal = document.getElementById('activityDetailModal');
  const closeBtn = document.getElementById('activityDetailCloseBtn');
  const shareBtn = document.getElementById('activityDetailShareBtn');

  if (closeBtn) {
    closeBtn.onclick = function(event) {
      event.preventDefault();
      event.stopPropagation();
      closeActivityDetailModal_();
    };
  }

  if (shareBtn) {
    shareBtn.onclick = function(event) {
      event.preventDefault();
      event.stopPropagation();
      if (!shareBtn.disabled) {
        shareCurrentDutyActivityImage_();
      }
    };
  }

  if (modal) {
    const mask = modal.querySelector('.activity-detail-mask');
    if (mask) {
      mask.onclick = closeActivityDetailModal_;
    }
  }
}

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
      loadDutyActivityList_(true);
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

async function loadDutyActivityList_(forceRefresh) {
  const area = document.getElementById('activityListArea');
  const stats = document.getElementById('activityListStats');
  const reloadBtn = document.getElementById('reloadActivityListBtn');

  showActivityListMessage_('', '');

  const cachedActivities = forceRefresh ? null : readDutyActivityListSessionCache_();

  if (cachedActivities) {
    applyDutyActivityListResult_(cachedActivities);
  } else if (area) {
    area.innerHTML = '<div class="small-text">讀取道務活動中...</div>';
  }

  if (stats && !cachedActivities) {
    stats.textContent = '讀取中...';
  }

  if (reloadBtn) {
    reloadBtn.disabled = true;
  }

  try {
    const result = await callApi({
      action: 'getDutyActivityList',
      forceRefresh: forceRefresh === true
    });

    if (!result.success) {
      throw new Error(result.message || '讀取失敗');
    }

    const activities = result.activities || [];
    writeDutyActivityListSessionCache_(activities);
    applyDutyActivityListResult_(activities);
    showActivityListMessage_('', '');

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

function applyDutyActivityListResult_(activities) {
  allDutyActivities = sortDutyActivitiesByDateDesc_(activities || []);
  selectedDutyActivityYear = getDefaultDutyActivityYear_(allDutyActivities, selectedDutyActivityYear);
  renderDutyActivityYearFilter_();
  visibleDutyActivities = filterDutyActivitiesByYear_(allDutyActivities, selectedDutyActivityYear);
  renderDutyActivityList_();
}

function readDutyActivityListSessionCache_() {
  try {
    const raw = sessionStorage.getItem(DUTY_ACTIVITY_LIST_SESSION_KEY);
    const cached = raw ? JSON.parse(raw) : null;
    if (Array.isArray(cached)) return cached;

    const persistentRaw = localStorage.getItem(DUTY_ACTIVITY_LIST_PERSISTENT_CACHE_KEY);
    const persistent = persistentRaw ? JSON.parse(persistentRaw) : null;
    return Array.isArray(persistent) ? persistent : null;
  } catch (err) {
    return null;
  }
}

function writeDutyActivityListSessionCache_(activities) {
  try {
    const serialized = JSON.stringify(activities || []);
    sessionStorage.setItem(DUTY_ACTIVITY_LIST_SESSION_KEY, serialized);
    localStorage.setItem(DUTY_ACTIVITY_LIST_PERSISTENT_CACHE_KEY, serialized);
  } catch (err) {
    // sessionStorage 無法使用時，仍以伺服器回應正常顯示。
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
const shareBtn = document.getElementById('activityDetailShareBtn');
const modal = document.getElementById('activityDetailModal');

if (closeBtn) {
closeBtn.onclick = closeActivityDetailModal_;
}

if (shareBtn) {
shareBtn.onclick = shareCurrentDutyActivityImage_;
}

if (modal) {
const mask = modal.querySelector('.activity-detail-mask');

if (mask) {
  mask.onclick = closeActivityDetailModal_;
}

}
}

function openDutyActivityDetailPage_(title, dateRange, note) {
  const detail = {
    title: normalizeActivityListText_(title),
    dateRange: normalizeActivityListText_(dateRange),
    note: String(note || '')
  };

  try {
    sessionStorage.setItem(DUTY_ACTIVITY_DETAIL_SESSION_KEY, JSON.stringify(detail));
  } catch (err) {
    // The detail page can still show a clear return action if storage is unavailable.
  }

  location.href = 'duty-activity-detail.html';
}

function initDutyActivityDetailPage_() {
  const raw = sessionStorage.getItem(DUTY_ACTIVITY_DETAIL_SESSION_KEY);
  let detail = null;

  try {
    detail = raw ? JSON.parse(raw) : null;
  } catch (err) {
    detail = null;
  }

  if (!detail || !detail.title) {
    location.replace('duty-activity-list.html');
    return;
  }

  injectActivityDetailNoteStyle_();
  currentDutyActivityDetail_ = detail;

  const modal = document.getElementById('activityDetailModal');
  const titleEl = document.getElementById('activityDetailTitle');
  const noteEl = document.getElementById('activityDetailNote');
  const backBtn = document.getElementById('activityDetailBackBtn');
  const shareBtn = document.getElementById('activityDetailShareBtn');

  if (titleEl) titleEl.textContent = detail.title;
  if (noteEl) {
    noteEl.innerHTML = renderActivityDetailNoteHtml_(detail.note, detail.dateRange);
    noteEl.style.whiteSpace = 'normal';
  }

  if (modal) {
    modal.style.display = 'block';
    modal.scrollTop = 0;
  }

  if (backBtn) {
    backBtn.onclick = function() {
      location.href = 'duty-activity-list.html';
    };
  }

  if (shareBtn) {
    shareBtn.onclick = function(event) {
      event.preventDefault();
      if (!shareBtn.disabled) shareCurrentDutyActivityImage_();
    };
  }

  resetDutyActivityShareFile_();
  setDutyActivityShareButtonState_('preparing');
  prepareCurrentDutyActivityShareImage_();
}

function showActivityDetailModal_(title, dateRange, note) {
// R17：無論備註是否能解析成表格，都先套用固定彈窗與按鈕樣式。
injectActivityDetailNoteStyle_();

const modal = document.getElementById('activityDetailModal');
const titleEl = document.getElementById('activityDetailTitle');
const dateEl = document.getElementById('activityDetailDate');
const noteEl = document.getElementById('activityDetailNote');

if (!modal) return;

currentDutyActivityDetail_ = {
  title: normalizeActivityListText_(title),
  dateRange: normalizeActivityListText_(dateRange),
  note: String(note || '')
};

resetDutyActivityShareFile_();
setDutyActivityShareButtonState_('preparing');

if (titleEl) {
titleEl.textContent = title || '';
}

if (dateEl) {
dateEl.textContent = '';
dateEl.style.display = 'none';
}

if (noteEl) {
noteEl.innerHTML = renderActivityDetailNoteHtml_(note, dateRange);
noteEl.style.whiteSpace = 'normal';
}

modal.style.display = 'block';
lockActivityDetailPageScroll_();
modal.scrollTop = 0;

window.requestAnimationFrame(function() {
  updateActivityDetailViewportHeight_();
  modal.scrollTop = 0;
});

prepareCurrentDutyActivityShareImage_();
}

function closeActivityDetailModal_() {
const modal = document.getElementById('activityDetailModal');

if (modal) {
modal.style.setProperty('display', 'none', 'important');
}

activitySharePrepareToken_++;
resetDutyActivityShareFile_();
currentDutyActivityDetail_ = null;
unlockActivityDetailPageScroll_();
}

function lockActivityDetailPageScroll_() {
  activityDetailBodyScrollY_ = window.pageYOffset || document.documentElement.scrollTop || 0;

  document.documentElement.classList.add('activity-detail-open');
  document.body.classList.add('activity-detail-open');

  document.body.style.position = 'fixed';
  document.body.style.top = '-' + activityDetailBodyScrollY_ + 'px';
  document.body.style.left = '0';
  document.body.style.right = '0';
  document.body.style.width = '100%';
}

function unlockActivityDetailPageScroll_() {
  document.documentElement.classList.remove('activity-detail-open');
  document.body.classList.remove('activity-detail-open');

  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.left = '';
  document.body.style.right = '';
  document.body.style.width = '';

  window.scrollTo(0, activityDetailBodyScrollY_ || 0);
}

function updateActivityDetailViewportHeight_() {
  const modal = document.getElementById('activityDetailModal');
  if (!modal) return;

  const height = window.visualViewport && window.visualViewport.height
    ? window.visualViewport.height
    : window.innerHeight;

  modal.style.setProperty('--activity-detail-viewport-height', Math.max(320, Math.floor(height)) + 'px');
}

function prepareActivityDetailIOSScroll_() {
  const modal = document.getElementById('activityDetailModal');
  const noteEl = document.getElementById('activityDetailNote');

  if (!modal || !noteEl) return;

  updateActivityDetailViewportHeight_();

  if (!activityDetailViewportHandlerBound_) {
    activityDetailViewportHandlerBound_ = true;

    window.addEventListener('resize', updateActivityDetailViewportHeight_);

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', updateActivityDetailViewportHeight_);
      window.visualViewport.addEventListener('scroll', updateActivityDetailViewportHeight_);
    }
  }

  if (activityDetailTouchBound_) return;
  activityDetailTouchBound_ = true;

  noteEl.addEventListener('touchstart', function(event) {
    if (!event.touches || event.touches.length !== 1) return;

    activityDetailTouchStartY_ = event.touches[0].clientY;
    activityDetailTouchStartScrollTop_ = noteEl.scrollTop;
  }, { passive: true });

  noteEl.addEventListener('touchmove', function(event) {
    if (!event.touches || event.touches.length !== 1) return;

    const maxScrollTop = Math.max(0, noteEl.scrollHeight - noteEl.clientHeight);

    if (maxScrollTop <= 0) return;

    const deltaY = activityDetailTouchStartY_ - event.touches[0].clientY;
    const nextScrollTop = Math.max(
      0,
      Math.min(maxScrollTop, activityDetailTouchStartScrollTop_ + deltaY)
    );

    noteEl.scrollTop = nextScrollTop;
    event.preventDefault();
    event.stopPropagation();
  }, { passive: false });

  modal.addEventListener('touchmove', function(event) {
    if (noteEl.contains(event.target)) return;
    event.preventDefault();
  }, { passive: false });
}


/* =========================
R14：產生統計圖片並使用 iPhone 分享面板傳送到 LINE
========================= */

function setDutyActivityShareButtonState_(state) {
  const button = document.getElementById('activityDetailShareBtn');
  if (!button) return;

  button.classList.remove('is-preparing', 'is-error');

  if (state === 'ready') {
    button.disabled = false;
    button.textContent = 'LINE分享';
    return;
  }

  if (state === 'error') {
    button.disabled = false;
    button.textContent = '重新產生圖片';
    button.classList.add('is-error');
    return;
  }

  button.disabled = true;
  button.textContent = '圖片準備中';
  button.classList.add('is-preparing');
}

function resetDutyActivityShareFile_() {
  activityShareFile_ = null;

  if (activityShareObjectUrl_) {
    URL.revokeObjectURL(activityShareObjectUrl_);
    activityShareObjectUrl_ = '';
  }
}

async function prepareCurrentDutyActivityShareImage_() {
  const detail = currentDutyActivityDetail_;
  const token = ++activitySharePrepareToken_;

  if (!detail) {
    setDutyActivityShareButtonState_('error');
    return;
  }

  setDutyActivityShareButtonState_('preparing');

  try {
    if (document.fonts && document.fonts.ready) {
      try {
        await document.fonts.ready;
      } catch (ignore) {}
    }

    await new Promise(function(resolve) {
      window.requestAnimationFrame(resolve);
    });

    if (token !== activitySharePrepareToken_ || detail !== currentDutyActivityDetail_) {
      return;
    }

    const canvas = createDutyActivityShareCanvasR15_(detail);
    const blob = await dutyActivityCanvasToBlob_(canvas, 'image/png', 1);

    if (!blob) {
      throw new Error('圖片產生失敗');
    }

    if (token !== activitySharePrepareToken_ || detail !== currentDutyActivityDetail_) {
      return;
    }

    const fileName = buildDutyActivityShareFileName_(detail);
    resetDutyActivityShareFile_();
    activityShareFile_ = new File([blob], fileName, { type: 'image/png' });
    setDutyActivityShareButtonState_('ready');
  } catch (error) {
    console.error('prepareCurrentDutyActivityShareImage_', error);
    if (token === activitySharePrepareToken_) {
      setDutyActivityShareButtonState_('error');
    }
  }
}

function createDutyActivityShareCanvasR15_(detail) {
  const parsed = parseReceiveByTempleNote_(detail.note || '');
  const canvas = document.createElement('canvas');
  const width = 1440;
  const marginX = 42;
  const gap = 26;
  const topHeight = 226;
  const groupTitleHeight = 82;
  const tableHeaderHeight = 58;
  const rowHeight = 52;
  const subtotalHeight = 72;
  const grandTotalHeight = 120;
  const bottomSpace = 52;

  if (!parsed) {
    canvas.width = width;
    canvas.height = 1080;
    const ctx = canvas.getContext('2d');
    drawDutyActivityPosterBackgroundR15_(ctx, canvas.width, canvas.height);
    drawDutyActivityPosterHeaderR15_(ctx, detail.title || '道務活動統計', detail.dateRange || '', width);
    ctx.fillStyle = '#ffffff';
    roundRectDutyActivityR15_(ctx, 70, 250, width - 140, 700, 28, true, false);
    ctx.fillStyle = '#173a65';
    ctx.font = dutyActivityCanvasFontR15_(34, 600);
    drawWrappedDutyActivityTextR15_(ctx, String(detail.note || '無資料'), 110, 310, width - 220, 54);
    return canvas;
  }

  const showChildColumns = parsed.columnMode !== 'qianKunOnly';
  const sections = getDutyActivityVisibleSectionsR16_(
    buildActivityDetailGroupSections_(parsed.rows)
  );
  sortDutyActivitySectionsByMasterOrderR15_(sections);

  const regularSections = sections.filter(function(section) {
    return !section.isGrandTotal;
  }).slice(0, 3);
  const grandTotalSection = sections.find(function(section) {
    return section.isGrandTotal;
  });

  if (regularSections.length === 0) {
    canvas.width = width;
    canvas.height = 1080;
    const ctx = canvas.getContext('2d');
    drawDutyActivityPosterBackgroundR15_(ctx, canvas.width, canvas.height);
    drawDutyActivityPosterHeaderR15_(ctx, detail.title || '道務活動統計', detail.dateRange || '', width);
    ctx.fillStyle = '#ffffff';
    roundRectDutyActivityR15_(ctx, 70, 250, width - 140, 700, 28, true, false);
    ctx.fillStyle = '#173a65';
    ctx.font = dutyActivityCanvasFontR15_(34, 600);
    drawWrappedDutyActivityTextR15_(ctx, '無各壇統計資料', 110, 310, width - 220, 54);
    return canvas;
  }

  const maxRows = Math.max.apply(null, regularSections.map(function(section) {
    return Math.max(1, (section.rows || []).length);
  }));

  const cardHeight = groupTitleHeight + tableHeaderHeight + maxRows * rowHeight + subtotalHeight;
  const height = topHeight + cardHeight + 24 + grandTotalHeight + bottomSpace;
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  drawDutyActivityPosterBackgroundR15_(ctx, width, height);
  drawDutyActivityPosterHeaderR15_(
    ctx,
    detail.title || '道務活動統計',
    detail.dateRange || parsed.period || '',
    width
  );

  const layout = getDutyActivityShareLayoutR16_(regularSections.length, width, marginX, gap);
  regularSections.forEach(function(section, index) {
    const x = layout.startX + index * (layout.cardWidth + layout.gap);
    drawDutyActivityGroupCardR15_(
      ctx,
      section,
      x,
      topHeight,
      layout.cardWidth,
      cardHeight,
      maxRows,
      showChildColumns
    );
  });

  const totals = getDutyActivityGrandTotalsR15_(grandTotalSection, regularSections);
  drawDutyActivityGrandTotalR15_(
    ctx,
    marginX,
    topHeight + cardHeight + 24,
    width - marginX * 2,
    grandTotalHeight,
    totals,
    showChildColumns
  );

  return canvas;
}

function drawDutyActivityPosterBackgroundR15_(ctx, width, height) {
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#fffefa');
  gradient.addColorStop(1, '#f5f0e6');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.strokeStyle = '#d5a23c';
  ctx.lineWidth = 3;
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.arc(90 + i * 20, 82, 60 + i * 14, Math.PI, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(width - 90 - i * 20, 82, 60 + i * 14, Math.PI, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawDutyActivityPosterHeaderR15_(ctx, title, period, width) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#082f6b';
  ctx.font = dutyActivityCanvasFontR15_(76, 800);
  fitDutyActivityCanvasTextR15_(ctx, normalizeActivityListText_(title), width - 180, 76, 56);
  ctx.fillText(normalizeActivityListText_(title), width / 2, 74);

  const divider = ctx.createLinearGradient(200, 0, width - 200, 0);
  divider.addColorStop(0, 'rgba(205,145,36,0)');
  divider.addColorStop(0.25, '#d09a32');
  divider.addColorStop(0.75, '#d09a32');
  divider.addColorStop(1, 'rgba(205,145,36,0)');
  ctx.strokeStyle = divider;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(230, 132);
  ctx.lineTo(width - 230, 132);
  ctx.stroke();
  ctx.fillStyle = '#d09a32';
  ctx.beginPath();
  ctx.arc(width / 2, 132, 8, 0, Math.PI * 2);
  ctx.fill();

  if (period) {
    ctx.fillStyle = '#173a65';
    ctx.font = dutyActivityCanvasFontR15_(34, 600);
    ctx.fillText('期間：' + normalizeActivityListText_(period), width / 2, 180);
  }
  ctx.restore();
}

function drawDutyActivityGroupCardR15_(ctx, section, x, y, width, height, maxRows, showChildColumns) {
  ctx.save();
  ctx.shadowColor = 'rgba(20, 54, 97, 0.12)';
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 8;
  ctx.fillStyle = 'rgba(255,255,255,0.97)';
  roundRectDutyActivityR15_(ctx, x, y, width, height, 24, true, false);
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = '#d09a32';
  ctx.lineWidth = 2.5;
  roundRectDutyActivityR15_(ctx, x, y, width, height, 24, false, true);

  const groupTitleHeight = 82;
  const headerHeight = 58;
  const rowHeight = 52;
  const subtotalHeight = 72;

  ctx.fillStyle = '#fffaf0';
  roundRectDutyActivityR15_(ctx, x + 2, y + 2, width - 4, groupTitleHeight, 22, true, false);
  ctx.fillStyle = '#08336d';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = dutyActivityCanvasFontR15_(42, 800);
  fitDutyActivityCanvasTextR15_(ctx, section.title || '統計', width - 40, 42, 30);
  ctx.fillText(section.title || '統計', x + width / 2, y + groupTitleHeight / 2 + 3);

  const columns = showChildColumns
    ? [0.36, 0.20, 0.11, 0.11, 0.11, 0.11]
    : [0.44, 0.22, 0.17, 0.17];
  const headers = showChildColumns
    ? ['壇名', '人數', '乾', '坤', '童', '女']
    : ['壇名', '人數', '乾', '坤'];
  const headerY = y + groupTitleHeight;
  ctx.fillStyle = '#083d7c';
  ctx.fillRect(x, headerY, width, headerHeight);
  drawDutyActivityTableGridAndTextR15_(ctx, x, headerY, width, headerHeight, columns, headers, true);

  const rows = section.rows || [];
  for (let i = 0; i < maxRows; i++) {
    const rowY = headerY + headerHeight + i * rowHeight;
    ctx.fillStyle = i % 2 === 0 ? '#ffffff' : '#fbfdff';
    ctx.fillRect(x, rowY, width, rowHeight);
    const row = rows[i];
    const values = row
      ? (showChildColumns
          ? [
              row.temple,
              formatDutyActivityDisplayNumberR16_(row.total),
              formatDutyActivityDisplayNumberR16_(row.qian),
              formatDutyActivityDisplayNumberR16_(row.kun),
              formatDutyActivityDisplayNumberR16_(row.tong),
              formatDutyActivityDisplayNumberR16_(row.nv)
            ]
          : [
              row.temple,
              formatDutyActivityDisplayNumberR16_(row.total),
              formatDutyActivityDisplayNumberR16_(row.qian),
              formatDutyActivityDisplayNumberR16_(row.kun)
            ])
      : ['', '', '', '', '', ''].slice(0, headers.length);
    drawDutyActivityTableGridAndTextR15_(ctx, x, rowY, width, rowHeight, columns, values, false);
  }

  const subtotalY = y + height - subtotalHeight;
  const subtotalGradient = ctx.createLinearGradient(0, subtotalY, 0, subtotalY + subtotalHeight);
  subtotalGradient.addColorStop(0, '#fff8e7');
  subtotalGradient.addColorStop(1, '#fff0c9');
  ctx.fillStyle = subtotalGradient;
  ctx.fillRect(x, subtotalY, width, subtotalHeight);
  ctx.strokeStyle = '#d6a13a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, subtotalY);
  ctx.lineTo(x + width, subtotalY);
  ctx.stroke();

  const subtotal = section.subtotal || sumDutyActivityRowsR15_(rows);
  const subtotalValues = showChildColumns
    ? [
        '小計：' + String(section.templeCount || rows.length || 0),
        formatDutyActivityDisplayNumberR16_(subtotal.total),
        formatDutyActivityDisplayNumberR16_(subtotal.qian),
        formatDutyActivityDisplayNumberR16_(subtotal.kun),
        formatDutyActivityDisplayNumberR16_(subtotal.tong),
        formatDutyActivityDisplayNumberR16_(subtotal.nv)
      ]
    : [
        '小計：' + String(section.templeCount || rows.length || 0),
        formatDutyActivityDisplayNumberR16_(subtotal.total),
        formatDutyActivityDisplayNumberR16_(subtotal.qian),
        formatDutyActivityDisplayNumberR16_(subtotal.kun)
      ];

  drawDutyActivitySubtotalRowR16_(
    ctx,
    x,
    subtotalY,
    width,
    subtotalHeight,
    columns,
    subtotalValues
  );
  ctx.restore();
}

function drawDutyActivityTableGridAndTextR15_(ctx, x, y, width, height, columns, values, isHeader) {
  let currentX = x;
  ctx.save();
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.font = dutyActivityCanvasFontR15_(isHeader ? 24 : 23, isHeader ? 800 : 600);
  ctx.fillStyle = isHeader ? '#ffffff' : '#082c5d';
  ctx.strokeStyle = isHeader ? 'rgba(255,255,255,0.35)' : '#d8e4ef';
  ctx.lineWidth = 1;

  columns.forEach(function(ratio, index) {
    const cellWidth = width * ratio;
    if (index > 0) {
      ctx.beginPath();
      ctx.moveTo(currentX, y);
      ctx.lineTo(currentX, y + height);
      ctx.stroke();
    }
    const text = normalizeActivityListText_(values[index]);
    const maxWidth = cellWidth - 12;
    const baseSize = isHeader ? 24 : (index === 0 ? 23 : 24);
    fitDutyActivityCanvasTextR15_(ctx, text, maxWidth, baseSize, 16);
    ctx.fillText(text, currentX + cellWidth / 2, y + height / 2 + 1);
    currentX += cellWidth;
  });

  ctx.beginPath();
  ctx.moveTo(x, y + height);
  ctx.lineTo(x + width, y + height);
  ctx.stroke();
  ctx.restore();
}


function getDutyActivityShareLayoutR16_(count, width, marginX, gap) {
  const availableWidth = width - marginX * 2;

  if (count <= 1) {
    const cardWidth = Math.min(820, availableWidth);
    return {
      cardWidth: cardWidth,
      gap: 0,
      startX: (width - cardWidth) / 2
    };
  }

  if (count === 2) {
    const cardWidth = Math.min(620, (availableWidth - gap) / 2);
    const totalWidth = cardWidth * 2 + gap;
    return {
      cardWidth: cardWidth,
      gap: gap,
      startX: (width - totalWidth) / 2
    };
  }

  return {
    cardWidth: (availableWidth - gap * 2) / 3,
    gap: gap,
    startX: marginX
  };
}

function drawDutyActivitySubtotalRowR16_(ctx, x, y, width, height, columns, values) {
  let currentX = x;
  ctx.save();
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#8a5200';
  ctx.strokeStyle = '#e2c686';
  ctx.lineWidth = 1;

  columns.forEach(function(ratio, index) {
    const cellWidth = width * ratio;
    if (index > 0) {
      ctx.beginPath();
      ctx.moveTo(currentX, y);
      ctx.lineTo(currentX, y + height);
      ctx.stroke();
    }

    const text = normalizeActivityListText_(values[index]);
    const startSize = index === 0 ? 28 : 31;
    fitDutyActivityCanvasTextR15_(ctx, text, cellWidth - 12, startSize, 16);
    ctx.fillText(text, currentX + cellWidth / 2, y + height / 2 + 1);
    currentX += cellWidth;
  });

  ctx.restore();
}

function drawDutyActivityGrandTotalR15_(ctx, x, y, width, height, total, showChildColumns) {
  ctx.save();
  const gradient = ctx.createLinearGradient(x, y, x + width, y + height);
  gradient.addColorStop(0, '#0b4f98');
  gradient.addColorStop(1, '#062c63');
  ctx.fillStyle = gradient;
  roundRectDutyActivityR15_(ctx, x, y, width, height, 28, true, false);
  ctx.strokeStyle = '#d9a238';
  ctx.lineWidth = 4;
  roundRectDutyActivityR15_(ctx, x, y, width, height, 28, false, true);

  let items = showChildColumns
    ? [['總計', total.total], ['乾', total.qian], ['坤', total.kun], ['童', total.tong], ['女', total.nv]]
    : [['總計', total.total], ['乾', total.qian], ['坤', total.kun]];

  items = items.filter(function(item, index) {
    return index === 0 || Number(item[1] || 0) !== 0;
  });

  const itemWidth = width / Math.max(1, items.length);
  items.forEach(function(item, index) {
    const cx = x + itemWidth * index + itemWidth / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = item[0] === '乾' ? '#f1c45f' : '#ffffff';
    ctx.font = dutyActivityCanvasFontR15_(30, 800);
    ctx.fillText(item[0], cx, y + 38);
    ctx.font = dutyActivityCanvasFontR15_(56, 800);
    ctx.fillText(formatDutyActivityDisplayNumberR16_(item[1]) || '0', cx, y + 86);
    if (index > 0) {
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + itemWidth * index, y + 22);
      ctx.lineTo(x + itemWidth * index, y + height - 22);
      ctx.stroke();
    }
  });
  ctx.restore();
}

function getDutyActivityGrandTotalsR15_(grandTotalSection, sections) {
  if (grandTotalSection && grandTotalSection.subtotal) {
    return {
      total: Number(grandTotalSection.subtotal.total || 0),
      qian: Number(grandTotalSection.subtotal.qian || 0),
      kun: Number(grandTotalSection.subtotal.kun || 0),
      tong: Number(grandTotalSection.subtotal.tong || 0),
      nv: Number(grandTotalSection.subtotal.nv || 0)
    };
  }

  const total = { total: 0, qian: 0, kun: 0, tong: 0, nv: 0 };
  (sections || []).forEach(function(section) {
    const subtotal = section.subtotal || sumDutyActivityRowsR15_(section.rows || []);
    total.total += Number(subtotal.total || 0);
    total.qian += Number(subtotal.qian || 0);
    total.kun += Number(subtotal.kun || 0);
    total.tong += Number(subtotal.tong || 0);
    total.nv += Number(subtotal.nv || 0);
  });
  return total;
}

function sumDutyActivityRowsR15_(rows) {
  return (rows || []).reduce(function(total, row) {
    total.total += Number(row.total || 0);
    total.qian += Number(row.qian || 0);
    total.kun += Number(row.kun || 0);
    total.tong += Number(row.tong || 0);
    total.nv += Number(row.nv || 0);
    return total;
  }, { total: 0, qian: 0, kun: 0, tong: 0, nv: 0 });
}

function roundRectDutyActivityR15_(ctx, x, y, width, height, radius, fill, stroke) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}

function dutyActivityCanvasFontR15_(size, weight) {
  return String(weight || 600) + ' ' + String(size || 24) + 'px "Kaiti TC", "BiauKai", "DFKai-SB", "標楷體", "PingFang TC", "Microsoft JhengHei", serif';
}

function fitDutyActivityCanvasTextR15_(ctx, text, maxWidth, startSize, minSize) {
  let size = startSize;
  while (size > minSize) {
    ctx.font = dutyActivityCanvasFontR15_(size, 700);
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 1;
  }
  return size;
}

function drawWrappedDutyActivityTextR15_(ctx, text, x, y, maxWidth, lineHeight) {
  const characters = Array.from(String(text || ''));
  let line = '';
  let cursorY = y;
  characters.forEach(function(character) {
    if (character === '\n') {
      ctx.fillText(line, x, cursorY);
      line = '';
      cursorY += lineHeight;
      return;
    }
    const test = line + character;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, cursorY);
      line = character;
      cursorY += lineHeight;
    } else {
      line = test;
    }
  });
  if (line) ctx.fillText(line, x, cursorY);
}

async function shareCurrentDutyActivityImage_() {
  const detail = currentDutyActivityDetail_;

  if (!detail) return;

  if (!activityShareFile_) {
    prepareCurrentDutyActivityShareImage_();
    return;
  }

  const shareData = {
    title: detail.title || '道務活動統計',
    text: (detail.title || '道務活動統計') +
      (detail.dateRange ? '\n期間：' + detail.dateRange : ''),
    files: [activityShareFile_]
  };

  try {
    if (
      navigator.share &&
      (!navigator.canShare || navigator.canShare({ files: [activityShareFile_] }))
    ) {
      await navigator.share(shareData);
      return;
    }

    downloadDutyActivityShareFile_();
  } catch (error) {
    if (error && error.name === 'AbortError') {
      return;
    }

    console.error('shareCurrentDutyActivityImage_', error);
    downloadDutyActivityShareFile_();
  }
}

function downloadDutyActivityShareFile_() {
  if (!activityShareFile_) return;

  resetDutyActivityShareObjectUrlOnly_();
  activityShareObjectUrl_ = URL.createObjectURL(activityShareFile_);

  const link = document.createElement('a');
  link.href = activityShareObjectUrl_;
  link.download = activityShareFile_.name;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function resetDutyActivityShareObjectUrlOnly_() {
  if (activityShareObjectUrl_) {
    URL.revokeObjectURL(activityShareObjectUrl_);
    activityShareObjectUrl_ = '';
  }
}

function dutyActivityCanvasToBlob_(canvas, type, quality) {
  return new Promise(function(resolve) {
    if (canvas.toBlob) {
      canvas.toBlob(resolve, type, quality);
      return;
    }

    try {
      const dataUrl = canvas.toDataURL(type, quality);
      const parts = dataUrl.split(',');
      const byteString = atob(parts[1]);
      const bytes = new Uint8Array(byteString.length);

      for (let i = 0; i < byteString.length; i++) {
        bytes[i] = byteString.charCodeAt(i);
      }

      resolve(new Blob([bytes], { type: type }));
    } catch (error) {
      resolve(null);
    }
  });
}

function buildDutyActivityShareFileName_(detail) {
  const title = normalizeActivityListText_(detail && detail.title) || '道務活動統計';
  const period = normalizeActivityListText_(detail && detail.dateRange)
    .replace(/[^0-9]/g, '');
  const safeTitle = title.replace(/[\\/:*?"<>|]/g, '_');

  return safeTitle + (period ? '_' + period : '') + '.png';
}

function createDutyActivityShareReport_(detail) {
  const root = document.createElement('div');
  root.className = 'duty-share-report';
  root.setAttribute('aria-hidden', 'true');

  const parsed = parseReceiveByTempleNote_(detail.note || '');
  const title = escapeActivityListHtml_(detail.title || '道務活動統計');
  const dateRange = escapeActivityListHtml_(detail.dateRange || (parsed && parsed.period) || '');

  root.innerHTML = buildDutyActivityShareReportHtml_(title, dateRange, parsed, detail.note || '');
  return root;
}

function buildDutyActivityShareReportHtml_(title, dateRange, parsed, rawNote) {
  const header = '' +
    '<header class="duty-share-header">' +
      '<div class="duty-share-corner duty-share-corner-left">✦</div>' +
      '<div class="duty-share-corner duty-share-corner-right">✦</div>' +
      '<h1>' + title + '</h1>' +
      '<div class="duty-share-divider"><span>◆</span></div>' +
      (dateRange ? '<div class="duty-share-period">期間：' + dateRange + '</div>' : '') +
    '</header>';

  if (!parsed) {
    return header +
      '<main class="duty-share-plain-card">' +
        escapeActivityListHtml_(rawNote).replace(/\n/g, '<br>') +
      '</main>';
  }

  const showChildColumns = parsed.columnMode !== 'qianKunOnly';
  const sections = getDutyActivityVisibleSectionsR16_(
    buildActivityDetailGroupSections_(parsed.rows)
  );
  const regularSections = sections.filter(function(section) {
    return !section.isGrandTotal;
  });
  const grandTotalSection = sections.find(function(section) {
    return section.isGrandTotal;
  });

  const sectionsHtml = regularSections.map(function(section) {
    return renderDutyActivityShareGroup_(section, showChildColumns);
  }).join('');

  const grandTotalHtml = renderDutyActivityShareGrandTotal_(
    grandTotalSection,
    regularSections,
    showChildColumns
  );

  const sectionCount = Math.max(1, regularSections.length);
  const mainStyle = sectionCount === 1
    ? 'grid-template-columns:minmax(0,1fr);width:58%;margin-left:auto;margin-right:auto'
    : (sectionCount === 2
        ? 'grid-template-columns:repeat(2,minmax(0,1fr));width:82%;margin-left:auto;margin-right:auto'
        : 'grid-template-columns:repeat(3,minmax(0,1fr))');

  return header +
    '<main class="duty-share-main" style="' + mainStyle + '">' + sectionsHtml + '</main>' +
    grandTotalHtml;
}

function renderDutyActivityShareGroup_(section, showChildColumns) {
  const rowsHtml = (section.rows || []).map(function(row) {
    return '' +
      '<tr>' +
        '<td class="duty-share-temple">' + escapeActivityListHtml_(row.temple) + '</td>' +
        '<td>' + escapeActivityListHtml_(formatDutyActivityDisplayNumberR16_(row.total)) + '</td>' +
        '<td>' + escapeActivityListHtml_(formatDutyActivityDisplayNumberR16_(row.qian)) + '</td>' +
        '<td>' + escapeActivityListHtml_(formatDutyActivityDisplayNumberR16_(row.kun)) + '</td>' +
        (showChildColumns ? '<td>' + escapeActivityListHtml_(formatDutyActivityDisplayNumberR16_(row.tong)) + '</td>' : '') +
        (showChildColumns ? '<td>' + escapeActivityListHtml_(formatDutyActivityDisplayNumberR16_(row.nv)) + '</td>' : '') +
      '</tr>';
  }).join('');

  const subtotal = section.subtotal || sumDutyActivityRowsR15_(section.rows || []);
  const countLabel = '小計：' + String(section.templeCount || 0);
  const subtotalClass = showChildColumns ? ' has-child-columns' : '';

  return '' +
    '<section class="duty-share-group">' +
      '<div class="duty-share-group-heading"><span>✧</span><h2>' +
        escapeActivityListHtml_(section.title || '統計') +
      '</h2><span>✧</span></div>' +
      '<table class="duty-share-table">' +
        '<thead><tr>' +
          '<th class="duty-share-temple-header">壇名</th><th class="duty-share-people-header">人數</th><th>乾</th><th>坤</th>' +
          (showChildColumns ? '<th>童</th><th>女</th>' : '') +
        '</tr></thead>' +
        '<tbody>' + rowsHtml + '</tbody>' +
      '</table>' +
      '<div class="duty-share-subtotal' + subtotalClass + '">' +
        '<div class="duty-share-subtotal-label">' + countLabel + '</div>' +
        '<div><strong>' + escapeActivityListHtml_(formatDutyActivityDisplayNumberR16_(subtotal.total)) + '</strong></div>' +
        '<div><strong>' + escapeActivityListHtml_(formatDutyActivityDisplayNumberR16_(subtotal.qian)) + '</strong></div>' +
        '<div><strong>' + escapeActivityListHtml_(formatDutyActivityDisplayNumberR16_(subtotal.kun)) + '</strong></div>' +
        (showChildColumns ? '<div><strong>' + escapeActivityListHtml_(formatDutyActivityDisplayNumberR16_(subtotal.tong)) + '</strong></div>' : '') +
        (showChildColumns ? '<div><strong>' + escapeActivityListHtml_(formatDutyActivityDisplayNumberR16_(subtotal.nv)) + '</strong></div>' : '') +
      '</div>' +
    '</section>';
}

function renderDutyActivityShareGrandTotal_(grandTotalSection, sections, showChildColumns) {
  let total = { total: 0, qian: 0, kun: 0, tong: 0, nv: 0 };

  if (grandTotalSection && grandTotalSection.subtotal) {
    total = grandTotalSection.subtotal;
  } else {
    (sections || []).forEach(function(section) {
      const subtotal = section.subtotal || {};
      total.total += Number(subtotal.total || 0);
      total.qian += Number(subtotal.qian || 0);
      total.kun += Number(subtotal.kun || 0);
      total.tong += Number(subtotal.tong || 0);
      total.nv += Number(subtotal.nv || 0);
    });
  }

  let items = showChildColumns
    ? [['總計', total.total], ['乾', total.qian], ['坤', total.kun], ['童', total.tong], ['女', total.nv]]
    : [['總計', total.total], ['乾', total.qian], ['坤', total.kun]];

  items = items.filter(function(item, index) {
    return index === 0 || Number(item[1] || 0) !== 0;
  });

  const content = items.map(function(item, index) {
    const divider = index > 0 ? '<i></i>' : '';
    return divider + '<div><span>' + escapeActivityListHtml_(item[0]) + '</span><strong>' +
      escapeActivityListHtml_(formatDutyActivityDisplayNumberR16_(item[1]) || '0') +
      '</strong></div>';
  }).join('');

  return '' +
    '<footer class="duty-share-grand-total">' +
      '<div class="duty-share-lotus">✦</div>' +
      content +
    '</footer>';
}

function injectDutyActivityShareStyle_() {
  if (document.getElementById('dutyActivityShareStyle')) return;

  const style = document.createElement('style');
  style.id = 'dutyActivityShareStyle';
  style.textContent = `
    .duty-share-report {
      position: fixed;
      left: -20000px;
      top: 0;
      z-index: -1000;
      width: 1080px;
      box-sizing: border-box;
      padding: 48px 46px 48px;
      color: #0a2f63;
      background:
        radial-gradient(circle at 4% 4%, rgba(216, 162, 50, .12), transparent 18%),
        radial-gradient(circle at 96% 7%, rgba(44, 107, 184, .10), transparent 20%),
        linear-gradient(180deg, #fffefa 0%, #f7f4ec 100%);
      font-family: "Kaiti TC", BiauKai, "DFKai-SB", "標楷體", "PingFang TC", "Microsoft JhengHei", serif;
      -webkit-font-smoothing: antialiased;
      text-rendering: geometricPrecision;
    }

    .duty-share-report * {
      box-sizing: border-box;
    }

    .duty-share-header {
      position: relative;
      text-align: center;
      padding: 8px 36px 38px;
    }

    .duty-share-header h1 {
      margin: 0;
      color: #062f6d;
      font-size: 72px;
      line-height: 1.15;
      font-weight: 900;
      letter-spacing: 5px;
    }

    .duty-share-divider {
      display: flex;
      align-items: center;
      gap: 16px;
      width: 72%;
      margin: 24px auto 18px;
      color: #bf821b;
    }

    .duty-share-divider::before,
    .duty-share-divider::after {
      content: "";
      flex: 1;
      height: 2px;
      background: linear-gradient(90deg, transparent, #d7a340, transparent);
    }

    .duty-share-period {
      font-size: 34px;
      font-weight: 700;
      letter-spacing: 1px;
      color: #143967;
    }

    .duty-share-corner {
      position: absolute;
      top: 0;
      color: #d19a31;
      font-size: 44px;
    }

    .duty-share-corner-left { left: 0; }
    .duty-share-corner-right { right: 0; }

    .duty-share-main {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 18px;
      align-items: stretch;
    }

    .duty-share-group {
      display: flex;
      flex-direction: column;
      overflow: hidden;
      border: 2px solid #d29a31;
      border-radius: 24px;
      background: rgba(255, 255, 255, .96);
      box-shadow: 0 8px 24px rgba(20, 54, 97, .10);
    }

    .duty-share-group-heading {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      min-height: 94px;
      padding: 14px 10px 10px;
      color: #08336d;
      background: linear-gradient(180deg, #ffffff, #fffaf0);
    }

    .duty-share-group-heading h2 {
      margin: 0;
      font-size: 42px;
      line-height: 1.1;
      font-weight: 900;
      white-space: nowrap;
    }

    .duty-share-group-heading span {
      color: #ca8b23;
      font-size: 28px;
    }

    .duty-share-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      font-size: 24px;
      color: #082c5d;
    }

    .duty-share-table th,
    .duty-share-table td {
      padding: 11px 5px;
      text-align: center;
      border-right: 1px solid #c8d8ea;
      border-bottom: 1px solid #d8e4ef;
      line-height: 1.2;
    }

    .duty-share-table th:last-child,
    .duty-share-table td:last-child {
      border-right: 0;
    }

    .duty-share-table th {
      color: #ffffff;
      background: linear-gradient(180deg, #0b4b91, #07356f);
      font-size: 23px;
      font-weight: 900;
    }

    .duty-share-table th:first-child,
    .duty-share-table td:first-child,
    .duty-share-temple-header,
    .duty-share-temple {
      width: 40%;
      text-align: center !important;
      vertical-align: middle !important;
    }

    .duty-share-table th:nth-child(2),
    .duty-share-table td:nth-child(2),
    .duty-share-people-header {
      width: 20%;
      text-align: center !important;
    }

    .duty-share-table td {
      font-weight: 700;
      background: rgba(255, 255, 255, .96);
    }

    .duty-share-temple {
      text-align: center !important;
      padding-left: 5px !important;
      white-space: nowrap;
    }

    .duty-share-subtotal {
      display: grid;
      grid-template-columns: 44fr 22fr 17fr 17fr;
      margin-top: auto;
      border-top: 2px solid #d29a31;
      background: linear-gradient(180deg, #fff8e7, #fff3d3);
      color: #7f4b00;
    }

    .duty-share-subtotal.has-child-columns {
      grid-template-columns: 36fr 20fr 11fr 11fr 11fr 11fr;
    }

    .duty-share-subtotal > div {
      min-height: 70px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 3px;
      padding: 8px 5px;
      border-right: 1px solid #e2c686;
    }

    .duty-share-subtotal > div:last-child {
      border-right: 0;
    }

    .duty-share-subtotal-label {
      font-size: 28px;
      font-weight: 900;
      white-space: nowrap;
    }

    .duty-share-subtotal span {
      display: none;
    }

    .duty-share-subtotal strong {
      color: #0a3a79;
      font-size: 38px;
      line-height: 1;
    }

    .duty-share-grand-total {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 28px;
      margin-top: 26px;
      min-height: 132px;
      padding: 22px 30px;
      border: 3px solid #d9a238;
      border-radius: 26px;
      color: #ffffff;
      background: linear-gradient(135deg, #0b4f98 0%, #062c63 100%);
      box-shadow: 0 12px 28px rgba(4, 41, 90, .22);
    }

    .duty-share-grand-total > div {
      display: flex;
      align-items: baseline;
      gap: 12px;
      white-space: nowrap;
    }

    .duty-share-grand-total span {
      font-size: 34px;
      font-weight: 900;
    }

    .duty-share-grand-total strong {
      font-size: 70px;
      line-height: 1;
      font-weight: 900;
    }

    .duty-share-grand-total i {
      width: 2px;
      height: 66px;
      background: rgba(255, 255, 255, .45);
    }

    .duty-share-lotus {
      color: #f1c45f;
      font-size: 48px;
    }

    .duty-share-plain-card {
      min-height: 600px;
      padding: 42px;
      border: 2px solid #d29a31;
      border-radius: 24px;
      background: #ffffff;
      color: #173a65;
      font-size: 34px;
      line-height: 1.8;
      white-space: normal;
    }
  `;

  document.head.appendChild(style);
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
function renderActivityDetailNoteHtml_(note, fallbackDateRange) {
  injectActivityDetailNoteStyle_();

  const text = String(note || '').trim();

  if (!text) {
    return renderActivityDetailFallbackMetaR17_(fallbackDateRange) + '<div class="activity-detail-note-empty">無資料</div>';
  }

  const parsed = parseReceiveByTempleNote_(text);

  if (!parsed) {
    return renderActivityDetailFallbackMetaR17_(fallbackDateRange) + '<div class="activity-detail-note-text">' + escapeActivityListHtml_(text) + '</div>';
  }

  injectActivityDetailNoteStyle_();

  const showChildColumns = parsed.columnMode !== 'qianKunOnly';
  const sections = getDutyActivityVisibleSectionsR16_(
    buildActivityDetailGroupSections_(parsed.rows)
  );
  const sectionsHtml = sections.map(function(section) {
    return renderActivityDetailGroupSection_(section, showChildColumns);
  }).join('');

  return '' +
    '<div class="activity-detail-note-card">' +
      renderActivityDetailNoteMetaHtml_(parsed) +
      '<div class="activity-detail-groups">' + sectionsHtml + '</div>' +
    '</div>';
}

function renderActivityDetailFallbackMetaR17_(dateRange) {
  const value = normalizeActivityListText_(dateRange);
  if (!value) return '';
  return '<div class="activity-detail-note-meta activity-detail-note-meta-fallback">' +
    '<div><span>期間：</span><strong>' + escapeActivityListHtml_(value) + '</strong></div>' +
    '</div>';
}

function normalizeActivityDetailGroupTitle_(value) {
  const text = normalizeActivityListText_(value);

  if (text.indexOf('第一大組') === 0) return '第一大組';
  if (text.indexOf('第二大組') === 0) return '第二大組';
  if (text.indexOf('第三大組') === 0) return '第三大組';
  if (text.indexOf('其他') === 0) return '其他';

  return text || '統計';
}

function normalizeDutyActivityTempleKeyR15_(value) {
  return normalizeActivityListText_(value)
    .toUpperCase()
    .replace(/＿/g, '_')
    .replace(/\s+/g, '');
}

function sortDutyActivitySectionsByMasterOrderR15_(sections) {
  (sections || []).forEach(function(section) {
    if (!section || !Array.isArray(section.rows)) return;
    section.rows = section.rows.map(function(row, index) {
      return { row: row, originalIndex: index };
    }).sort(function(a, b) {
      const keyA = normalizeDutyActivityTempleKeyR15_(a.row && a.row.temple);
      const keyB = normalizeDutyActivityTempleKeyR15_(b.row && b.row.temple);
      const orderA = Object.prototype.hasOwnProperty.call(DUTY_ACTIVITY_TEMPLE_ORDER_INDEX_R15, keyA)
        ? DUTY_ACTIVITY_TEMPLE_ORDER_INDEX_R15[keyA]
        : 999999;
      const orderB = Object.prototype.hasOwnProperty.call(DUTY_ACTIVITY_TEMPLE_ORDER_INDEX_R15, keyB)
        ? DUTY_ACTIVITY_TEMPLE_ORDER_INDEX_R15[keyB]
        : 999999;
      if (orderA !== orderB) return orderA - orderB;
      return a.originalIndex - b.originalIndex;
    }).map(function(item) {
      return item.row;
    });
  });
  return sections;
}

function buildActivityDetailGroupSections_(rows) {
  const sections = [];
  let current = null;
  let finalTotal = null;

  (rows || []).forEach(function(row) {
    if (row.isGroupHeading) {
      current = {
        title: normalizeActivityDetailGroupTitle_(row.temple),
        rows: [],
        subtotal: null,
        templeCount: 0
      };
      sections.push(current);
      return;
    }

    if (row.temple === '總計' || row.temple === '合計') {
      finalTotal = row;
      return;
    }

    if (row.temple.indexOf('小計') >= 0) {
      if (!current) {
        current = {
          title: '統計',
          rows: [],
          subtotal: null,
          templeCount: 0
        };
        sections.push(current);
      }
      current.subtotal = row;
      return;
    }

    if (!current) {
      current = {
        title: '統計',
        rows: [],
        subtotal: null,
        templeCount: 0
      };
      sections.push(current);
    }

    current.rows.push(row);
    current.templeCount++;
  });

  sortDutyActivitySectionsByMasterOrderR15_(sections);

  if (finalTotal) {
    sections.push({
      title: '',
      rows: [],
      subtotal: finalTotal,
      templeCount: 0,
      isGrandTotal: true
    });
  }

  return sections;
}

function renderActivityDetailGroupSection_(section, showChildColumns) {
  const colgroup = showChildColumns
    ? '<colgroup><col style="width:36%"><col style="width:20%"><col style="width:11%"><col style="width:11%"><col style="width:11%"><col style="width:11%"></colgroup>'
    : '<colgroup><col style="width:44%"><col style="width:22%"><col style="width:17%"><col style="width:17%"></colgroup>';

  const headers = '' +
    '<tr>' +
      '<th class="temple-header">壇名</th>' +
      '<th class="people-header">人數</th>' +
      '<th>乾</th>' +
      '<th>坤</th>' +
      (showChildColumns ? '<th>童</th>' : '') +
      (showChildColumns ? '<th>女</th>' : '') +
    '</tr>';

  const bodyRows = (section.rows || []).map(function(row) {
    return renderActivityDetailDataRow_(row, showChildColumns, '');
  }).join('');

  let subtotalHtml = '';
  const subtotalSource = section.subtotal ||
    (!section.isGrandTotal ? sumDutyActivityRowsR15_(section.rows || []) : null);

  if (subtotalSource) {
    const label = section.isGrandTotal
      ? '總計'
      : '小計：' + String(section.templeCount || (section.rows || []).length || 0);

    const subtotal = {
      temple: label,
      total: subtotalSource.total,
      qian: subtotalSource.qian,
      kun: subtotalSource.kun,
      tong: subtotalSource.tong,
      nv: subtotalSource.nv
    };

    subtotalHtml = renderActivityDetailDataRow_(
      subtotal,
      showChildColumns,
      section.isGrandTotal ? 'is-total' : 'is-group-subtotal'
    );
  }

  if (section.isGrandTotal) {
    return '' +
      '<div class="activity-detail-grand-total">' +
        '<table class="activity-detail-note-table">' +
          colgroup +
          '<tbody>' + subtotalHtml + '</tbody>' +
        '</table>' +
      '</div>';
  }

  return '' +
    '<section class="activity-detail-group-section">' +
      '<div class="activity-detail-group-title">' +
        escapeActivityListHtml_(section.title) +
      '</div>' +
      '<div class="activity-detail-note-table-wrap">' +
        '<table class="activity-detail-note-table">' +
          colgroup +
          '<thead>' + headers + '</thead>' +
          '<tbody>' + bodyRows + subtotalHtml + '</tbody>' +
        '</table>' +
      '</div>' +
    '</section>';
}

function renderActivityDetailDataRow_(row, showChildColumns, className) {
  return '' +
    '<tr class="' + escapeActivityListHtml_(className || '') + '">' +
      '<td class="temple-cell">' + escapeActivityListHtml_(row.temple) + '</td>' +
      '<td>' + escapeActivityListHtml_(formatDutyActivityDisplayNumberR16_(row.total)) + '</td>' +
      '<td>' + escapeActivityListHtml_(formatDutyActivityDisplayNumberR16_(row.qian)) + '</td>' +
      '<td>' + escapeActivityListHtml_(formatDutyActivityDisplayNumberR16_(row.kun)) + '</td>' +
      (showChildColumns ? '<td>' + escapeActivityListHtml_(formatDutyActivityDisplayNumberR16_(row.tong)) + '</td>' : '') +
      (showChildColumns ? '<td>' + escapeActivityListHtml_(formatDutyActivityDisplayNumberR16_(row.nv)) + '</td>' : '') +
    '</tr>';
}

function renderActivityDetailNoteMetaHtml_(parsed) {
  const parts = [];

  if (parsed.settingPeriod) {
    parts.push('<div><span>設定期間：</span><strong>' + escapeActivityListHtml_(parsed.settingPeriod) + '</strong></div>');
  }

  if (parsed.dataPeriod) {
    parts.push('<div><span>目前資料：</span><strong>' + escapeActivityListHtml_(parsed.dataPeriod) + '</strong></div>');
  }

  if (!parsed.settingPeriod && parsed.period) {
    parts.push('<div><span>期間：</span><strong>' + escapeActivityListHtml_(parsed.period) + '</strong></div>');
  }

  if (parsed.location) {
    parts.push('<div><span>地點：</span><strong>' + escapeActivityListHtml_(parsed.location) + '</strong></div>');
  }

  if (parts.length === 0) {
    return '';
  }

  return '<div class="activity-detail-note-meta">' + parts.join('') + '</div>';
}


/* =========================
函式名稱：parseReceiveByTempleNote_
功能說明：
解析「求道統計+壇名」備註。
支援有換行 / tab 的新格式，也支援被瀏覽器壓成空白的一行格式。
========================= */
function parseReceiveByTempleNote_(note) {
  const text = String(note || '').trim();

  if (text.indexOf('所屬佛堂') < 0 && text.indexOf('壇名') < 0) {
    return null;
  }

  const modeMatch = text.match(/(求道統計\+壇名|求道統計|法會統計)/);
  const settingPeriodMatch = text.match(/設定期間：?\s*([^\n\t]+)/);
  const dataPeriodMatch = text.match(/(?:資料期間|目前資料)：?\s*([^\n\t]+)/);
  const periodMatch = text.match(/(?:期間|統計期間)：?\s*([0-9\/\-]+(?:～|~)[0-9\/\-]+)/);
  const locationMatch = text.match(/(?:地點|輸入地點)：?\s*([^\s\n\t]+)/);

  const modeText = modeMatch ? modeMatch[1] : '系統統計';
  const settingPeriod = settingPeriodMatch ? settingPeriodMatch[1].trim() : '';
  const dataPeriod = dataPeriodMatch ? dataPeriodMatch[1].trim() : '';
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
    modeText: modeText,
    period: period,
    settingPeriod: settingPeriod,
    dataPeriod: dataPeriod,
    location: location,
    columnMode: detectActivityNoteColumnMode_(text),
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
    if (cleanLine.indexOf('所屬佛堂') >= 0 || cleanLine.indexOf('壇名') >= 0) return;
    if (cleanLine.indexOf('求道統計+壇名') >= 0) return;
    if (cleanLine.indexOf('期間：') >= 0) return;
    if (cleanLine.indexOf('地點：') >= 0) return;

    if (/^(第一大組|第二大組|第三大組|其他)(?:（[^）]*）)?$/.test(cleanLine)) {
      rows.push({
        temple: cleanLine,
        total: '',
        qian: '',
        kun: '',
        tong: '',
        nv: '',
        isGroupHeading: true
      });
      return;
    }

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

    if (parts.length >= 4 && isActivityNoteNumber_(parts[1])) {
      rows.push({
        temple: parts[0],
        total: parts[1],
        qian: parts[2],
        kun: parts[3],
        tong: '',
        nv: ''
      });
      return;
    }

    let match = cleanLine.match(/^(.+?)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$/);

    if (match) {
      rows.push({
        temple: match[1].trim(),
        total: match[2],
        qian: match[3],
        kun: match[4],
        tong: match[5],
        nv: match[6]
      });
      return;
    }

    match = cleanLine.match(/^(.+?)\s+(\d+)\s+(\d+)\s+(\d+)$/);

    if (match) {
      rows.push({
        temple: match[1].trim(),
        total: match[2],
        qian: match[3],
        kun: match[4],
        tong: '',
        nv: ''
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
  const oldHeaderIndex = text.indexOf('所屬佛堂');
  const newHeaderIndex = text.indexOf('壇名');
  const headerIndex = oldHeaderIndex >= 0 ? oldHeaderIndex : newHeaderIndex;

  if (headerIndex < 0) return rows;

  let body = text.substring(headerIndex);
  const columnMode = detectActivityNoteColumnMode_(text);

  body = body.replace(/^(?:所屬佛堂|壇名)\s*人數\s*乾\s*坤\s*童\s*女\s*/, '');
  body = body.replace(/^(?:所屬佛堂|壇名)\s*人數\s*乾\s*坤\s*/, '');
  body = body.replace(/說明：[\s\S]*$/, '');
  body = body.replace(/^設定期間：[^\s]+\s*/, '');
  body = body.replace(/^資料期間：[^\s]+\s*/, '');
  body = body.replace(/^目前資料：[^\s]+\s*/, '');
  body = body.trim();

  const regex = columnMode === 'qianKunOnly'
    ? /([^\s]+)\s+(\d+)\s+(\d+)\s+(\d+)/g
    : /([^\s]+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/g;

  let match;

  while ((match = regex.exec(body)) !== null) {
    rows.push({
      temple: match[1],
      total: match[2],
      qian: match[3],
      kun: match[4],
      tong: columnMode === 'qianKunOnly' ? '' : match[5],
      nv: columnMode === 'qianKunOnly' ? '' : match[6]
    });
  }

  return rows;
}


/* =========================
函式名稱：detectActivityNoteColumnMode_
功能說明：
判斷備註表格欄位模式。
法會統計只顯示乾坤；求道統計與求道統計+壇名顯示乾坤童女。
========================= */
function detectActivityNoteColumnMode_(text) {
  const value = String(text || '');

  if ((value.indexOf('所屬佛堂') >= 0 || value.indexOf('壇名') >= 0) && value.indexOf('童') < 0 && value.indexOf('女') < 0) {
    return 'qianKunOnly';
  }

  if (value.indexOf('法會統計') >= 0 && value.indexOf('求道統計') < 0) {
    return 'qianKunOnly';
  }

  return 'qianKunTongNv';
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


function formatDutyActivityDisplayNumberR16_(value) {
  // R17_ZERO_VALUES_RENDER_AS_BLANK
  const text = normalizeActivityListText_(value);

  if (!text || /^0(?:\.0+)?$/.test(text)) {
    return '';
  }

  return text;
}

function getDutyActivityVisibleSectionsR16_(sections) {
  return (sections || []).filter(function(section) {
    if (!section) return false;
    if (section.isGrandTotal) return true;

    const rows = Array.isArray(section.rows) ? section.rows : [];
    const subtotal = section.subtotal || sumDutyActivityRowsR15_(rows);

    return rows.length > 0 ||
      Number(section.templeCount || 0) > 0 ||
      Number(subtotal.total || 0) > 0;
  });
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
    html.activity-detail-open,
    body.activity-detail-open {
      overflow: hidden !important;
      height: 100% !important;
      overscroll-behavior: none !important;
    }

    .activity-detail-modal {
      position: fixed !important;
      inset: 0 !important;
      width: 100vw !important;
      height: var(--activity-detail-viewport-height, 100vh) !important;
      max-height: var(--activity-detail-viewport-height, 100vh) !important;
      padding:
        max(32px, env(safe-area-inset-top))
        max(8px, env(safe-area-inset-right))
        max(8px, env(safe-area-inset-bottom))
        max(8px, env(safe-area-inset-left)) !important;
      display: block !important;
      overflow-x: hidden !important;
      overflow-y: auto !important;
      overscroll-behavior-y: contain !important;
      -webkit-overflow-scrolling: touch !important;
      touch-action: pan-y !important;
    }

    .activity-detail-mask {
      position: fixed !important;
      inset: 0 !important;
      z-index: 0 !important;
    }

    .activity-detail-box {
      position: relative !important;
      z-index: 1 !important;
      pointer-events: auto !important;
      display: block !important;
      width: min(100%, 430px) !important;
      height: auto !important;
      max-height: none !important;
      min-height: 0 !important;
      margin: 0 auto !important;
      overflow: visible !important;
      padding:
        30px
        14px
        max(18px, env(safe-area-inset-bottom)) !important;
    }

    .activity-detail-title,
    .activity-detail-date,
    .activity-detail-close-btn {
      min-height: 0;
    }

    .activity-detail-date {
      position: static !important;
      margin: 0 0 14px !important;
      text-align: center !important;
      font-size: 14px !important;
      line-height: 1.55 !important;
    }

    .activity-detail-title {
      margin-bottom: 8px !important;
      text-align: center !important;
      color: #07365f !important;
      font-family: "Kaiti TC", BiauKai, "DFKai-SB", "標楷體", "PingFang TC", "Microsoft JhengHei", serif !important;
      font-size: 30px !important;
      line-height: 1.25 !important;
      font-weight: 900 !important;
    }

    .activity-detail-actions {
      display: grid !important;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) !important;
      gap: 12px !important;
      width: 100% !important;
      height: 48px !important;
      min-height: 48px !important;
      max-height: 48px !important;
      align-items: stretch !important;
      position: relative !important;
      z-index: 6 !important;
      overflow: visible !important;
    }

    .activity-detail-close-btn,
    .activity-detail-share-btn {
      position: static !important;
      inset: auto !important;
      flex: none !important;
      align-self: stretch !important;
      width: 100% !important;
      height: 48px !important;
      min-height: 48px !important;
      max-height: 48px !important;
      margin: 0 !important;
      padding: 0 10px !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      line-height: 1 !important;
      overflow: hidden !important;
      border-radius: 12px !important;
      font-size: 18px !important;
      font-weight: 900 !important;
    }

    .activity-detail-close-btn {
      color: #1976e8 !important;
      background: #ffffff !important;
      border: 1px solid #1976e8 !important;
    }

    .activity-detail-share-btn {
      color: #ffffff !important;
      background: linear-gradient(180deg, #2f87f5, #1976e8) !important;
      border: 1px solid #1976e8 !important;
    }

    .activity-detail-share-btn:disabled {
      opacity: .65 !important;
    }

    .activity-detail-share-btn.is-error {
      background: #b96a00 !important;
      border-color: #b96a00 !important;
    }

    .activity-detail-bottom-spacer {
      display: none !important;
      height: 0 !important;
      min-height: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
    }

    .activity-detail-note {
      flex: 0 0 auto !important;
      min-height: 0 !important;
      height: auto !important;
      overflow-x: visible !important;
      overflow-y: visible !important;
      margin-bottom: 18px !important;
      padding: 0 2px 0 0 !important;
    }

    .activity-detail-close-btn {
      position: relative;
      z-index: 5;
      flex: none !important;
      margin-top: 0 !important;
    }

    .activity-detail-note-card {
      margin-top: 0;
      line-height: 1.38;
      color: #1f2d3d;
    }

    .activity-detail-note-meta {
      display: grid;
      gap: 5px;
      margin-bottom: 10px;
      font-size: 16px;
      color: #34495e;
      justify-items: center;
      text-align: center;
    }

    .activity-detail-note-meta div {
      display: flex;
      align-items: baseline;
      flex-wrap: nowrap;
      justify-content: center;
    }

    .activity-detail-note-meta span {
      display: inline;
      min-width: 0;
      margin-right: 0;
      font-weight: 800;
      color: #07365f;
      white-space: nowrap;
    }

    .activity-detail-note-meta strong {
      font-weight: 500;
      color: #34495e;
      white-space: nowrap;
    }

    .activity-detail-groups {
      display: grid;
      gap: 14px;
    }

    .activity-detail-group-section {
      display: block;
    }

    .activity-detail-group-title {
      padding: 8px 10px;
      background: #e8f1fb;
      color: #07365f;
      font-size: 20px;
      font-weight: 900;
      text-align: center;
      font-family: "Kaiti TC", BiauKai, "DFKai-SB", "標楷體", "PingFang TC", "Microsoft JhengHei", serif;
      border: 1px solid #d8e2ee;
      border-bottom: 0;
      border-radius: 10px 10px 0 0;
    }

    .activity-detail-group-section .activity-detail-note-table-wrap {
      border-radius: 0 0 10px 10px;
    }

    .activity-detail-grand-total {
      border: 1px solid #d8e2ee;
      border-radius: 10px;
      overflow: hidden;
    }

    .activity-detail-note-table-wrap {
      display: block;
      width: 100%;
      overflow-x: auto;
      overflow-y: visible;
      -webkit-overflow-scrolling: touch;
      touch-action: pan-x pan-y;
      border: 1px solid #d8e2ee;
      border-radius: 10px;
      background: #ffffff;
    }

    .activity-detail-note-table {
      width: 100%;
      min-width: 0;
      max-width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      font-size: 15px;
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

    .activity-detail-note-table th:first-child,
    .activity-detail-note-table .temple-header,
    .activity-detail-note-table .temple-cell {
      text-align: center !important;
      vertical-align: middle !important;
      font-weight: 700;
      min-width: 0;
    }

    .activity-detail-note-table .people-header,
    .activity-detail-note-table th:nth-child(2),
    .activity-detail-note-table td:nth-child(2) {
      text-align: center !important;
    }

    .activity-detail-note-table td:not(.temple-cell),
    .activity-detail-note-table th:not(:first-child) {
      min-width: 34px;
    }


    .activity-detail-note-table tr.is-group-heading td {
      background: #e8f1fb;
      color: #07365f;
      font-weight: 900;
      text-align: left;
      padding: 8px 10px;
      border-right: 0;
    }

    .activity-detail-note-table tr.is-group-subtotal td {
      background: #fff8e8;
      font-weight: 900;
      color: #8a5200;
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
      .activity-detail-note-meta {
        font-size: 13px;
      }

      .activity-detail-note-table {
        font-size: 14px;
      }

      .activity-detail-note-table th,
      .activity-detail-note-table td {
        padding: 5px 6px;
      }

      .activity-detail-note-table th:first-child,
      .activity-detail-note-table .temple-header,
      .activity-detail-note-table .temple-cell {
        min-width: 0;
        text-align: center !important;
        vertical-align: middle !important;
      }

      .activity-detail-actions {
        height: 48px !important;
        min-height: 48px !important;
        max-height: 48px !important;
      }

      .activity-detail-note-table td:not(.temple-cell),
      .activity-detail-note-table th:not(:first-child) {
        min-width: 30px;
      }

      .activity-detail-modal {
        padding-top: max(6px, env(safe-area-inset-top)) !important;
        padding-bottom: max(6px, env(safe-area-inset-bottom)) !important;
      }

      .activity-detail-box {
        width: 100% !important;
        border-radius: 18px !important;
        padding-left: 10px !important;
        padding-right: 10px !important;
      }

      .activity-detail-note-table-wrap {
        overflow-x: visible !important;
      }

      .activity-detail-note-table {
        width: 100% !important;
        font-size: 14px !important;
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

