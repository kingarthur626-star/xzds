/* =========================
程式名稱：duty-activity-list.js
功能說明：
道務活動列表頁專用程式。

主要用途：
1. 檢查登入狀態。
2. 顯示啟用中的道務活動列表。
3. admin 可從上方按鈕進入「道務活動設定」。
4. 一般 user 只會看到「首頁」與「登出」。
5. R14：新增完整統計圖片產生與 iPhone 分享功能；關閉與 LINE分享同列。

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
let activityShareLibraryPromise_ = null;

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

function showActivityDetailModal_(title, dateRange, note) {
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
noteEl.innerHTML = renderActivityDetailNoteHtml_(note);
noteEl.style.whiteSpace = 'normal';
}

modal.style.display = 'flex';
lockActivityDetailPageScroll_();
prepareActivityDetailIOSScroll_();

if (noteEl) {
  noteEl.scrollTop = 0;
}

window.requestAnimationFrame(function() {
  updateActivityDetailViewportHeight_();
  if (noteEl) {
    noteEl.scrollTop = 0;
  }
});

prepareCurrentDutyActivityShareImage_();
}

function closeActivityDetailModal_() {
const modal = document.getElementById('activityDetailModal');

if (modal) {
modal.style.display = 'none';
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

async function ensureDutyActivityHtml2Canvas_() {
  if (typeof window.html2canvas === 'function') {
    return window.html2canvas;
  }

  if (activityShareLibraryPromise_) {
    return activityShareLibraryPromise_;
  }

  activityShareLibraryPromise_ = new Promise(function(resolve, reject) {
    const existing = document.querySelector('script[data-duty-html2canvas="1"]');

    if (existing) {
      existing.addEventListener('load', function() {
        if (typeof window.html2canvas === 'function') {
          resolve(window.html2canvas);
        } else {
          reject(new Error('圖片元件載入失敗'));
        }
      }, { once: true });

      existing.addEventListener('error', function() {
        reject(new Error('圖片元件載入失敗'));
      }, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
    script.async = true;
    script.dataset.dutyHtml2canvas = '1';

    script.onload = function() {
      if (typeof window.html2canvas === 'function') {
        resolve(window.html2canvas);
      } else {
        reject(new Error('圖片元件載入失敗'));
      }
    };

    script.onerror = function() {
      reject(new Error('圖片元件載入失敗'));
    };

    document.head.appendChild(script);
  });

  try {
    return await activityShareLibraryPromise_;
  } catch (error) {
    activityShareLibraryPromise_ = null;
    throw error;
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
    const html2canvasFn = await ensureDutyActivityHtml2Canvas_();

    if (token !== activitySharePrepareToken_ || detail !== currentDutyActivityDetail_) {
      return;
    }

    injectDutyActivityShareStyle_();

    const report = createDutyActivityShareReport_(detail);
    document.body.appendChild(report);

    if (document.fonts && document.fonts.ready) {
      try {
        await document.fonts.ready;
      } catch (ignore) {}
    }

    await new Promise(function(resolve) {
      window.requestAnimationFrame(function() {
        window.requestAnimationFrame(resolve);
      });
    });

    const canvas = await html2canvasFn(report, {
      backgroundColor: '#f8f4ec',
      scale: 1,
      useCORS: true,
      allowTaint: false,
      logging: false,
      scrollX: 0,
      scrollY: 0,
      windowWidth: 1080,
      width: report.scrollWidth,
      height: report.scrollHeight
    });

    report.remove();

    if (token !== activitySharePrepareToken_ || detail !== currentDutyActivityDetail_) {
      return;
    }

    const blob = await dutyActivityCanvasToBlob_(canvas, 'image/png', 0.95);

    if (!blob) {
      throw new Error('圖片產生失敗');
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
  const sections = buildActivityDetailGroupSections_(parsed.rows);
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

  return header +
    '<main class="duty-share-main">' + sectionsHtml + '</main>' +
    grandTotalHtml;
}

function renderDutyActivityShareGroup_(section, showChildColumns) {
  const rowsHtml = (section.rows || []).map(function(row) {
    return '' +
      '<tr>' +
        '<td class="duty-share-temple">' + escapeActivityListHtml_(row.temple) + '</td>' +
        '<td>' + escapeActivityListHtml_(row.total) + '</td>' +
        '<td>' + escapeActivityListHtml_(row.qian) + '</td>' +
        '<td>' + escapeActivityListHtml_(row.kun) + '</td>' +
        (showChildColumns ? '<td>' + escapeActivityListHtml_(row.tong) + '</td>' : '') +
        (showChildColumns ? '<td>' + escapeActivityListHtml_(row.nv) + '</td>' : '') +
      '</tr>';
  }).join('');

  const subtotal = section.subtotal || {};
  const countLabel = '小計：' + String(section.templeCount || 0) + '間';

  return '' +
    '<section class="duty-share-group">' +
      '<div class="duty-share-group-heading"><span>✧</span><h2>' +
        escapeActivityListHtml_(section.title || '統計') +
      '</h2><span>✧</span></div>' +
      '<table class="duty-share-table">' +
        '<thead><tr>' +
          '<th>所屬佛堂</th><th>人數</th><th>乾</th><th>坤</th>' +
          (showChildColumns ? '<th>童</th><th>女</th>' : '') +
        '</tr></thead>' +
        '<tbody>' + rowsHtml + '</tbody>' +
      '</table>' +
      '<div class="duty-share-subtotal">' +
        '<div class="duty-share-subtotal-label">' + countLabel + '</div>' +
        '<div><span>人數</span><strong>' + escapeActivityListHtml_(subtotal.total || '') + '</strong></div>' +
        '<div><span>乾</span><strong>' + escapeActivityListHtml_(subtotal.qian || '') + '</strong></div>' +
        '<div><span>坤</span><strong>' + escapeActivityListHtml_(subtotal.kun || '') + '</strong></div>' +
        (showChildColumns ? '<div><span>童</span><strong>' + escapeActivityListHtml_(subtotal.tong || '') + '</strong></div>' : '') +
        (showChildColumns ? '<div><span>女</span><strong>' + escapeActivityListHtml_(subtotal.nv || '') + '</strong></div>' : '') +
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

  return '' +
    '<footer class="duty-share-grand-total">' +
      '<div class="duty-share-lotus">✦</div>' +
      '<div><span>總計</span><strong>' + escapeActivityListHtml_(total.total) + '</strong></div>' +
      '<i></i>' +
      '<div><span>乾</span><strong>' + escapeActivityListHtml_(total.qian) + '</strong></div>' +
      '<i></i>' +
      '<div><span>坤</span><strong>' + escapeActivityListHtml_(total.kun) + '</strong></div>' +
      (showChildColumns ? '<i></i><div><span>童</span><strong>' + escapeActivityListHtml_(total.tong) + '</strong></div>' : '') +
      (showChildColumns ? '<i></i><div><span>女</span><strong>' + escapeActivityListHtml_(total.nv) + '</strong></div>' : '') +
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
      padding: 54px 46px 48px;
      color: #0a2f63;
      background:
        radial-gradient(circle at 4% 4%, rgba(216, 162, 50, .12), transparent 18%),
        radial-gradient(circle at 96% 7%, rgba(44, 107, 184, .10), transparent 20%),
        linear-gradient(180deg, #fffefa 0%, #f7f4ec 100%);
      font-family: BiauKai, "Kaiti TC", "DFKai-SB", "Noto Serif TC", serif;
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
    .duty-share-table td:first-child {
      width: 44%;
    }

    .duty-share-table td {
      font-weight: 700;
      background: rgba(255, 255, 255, .96);
    }

    .duty-share-temple {
      text-align: left !important;
      padding-left: 14px !important;
      white-space: nowrap;
    }

    .duty-share-subtotal {
      display: grid;
      grid-template-columns: 1.55fr repeat(3, 1fr);
      margin-top: auto;
      border-top: 2px solid #d29a31;
      background: linear-gradient(180deg, #fff8e7, #fff3d3);
      color: #7f4b00;
    }

    .duty-share-subtotal > div {
      min-height: 88px;
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
      font-size: 20px;
      font-weight: 800;
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
function renderActivityDetailNoteHtml_(note) {
  const text = String(note || '').trim();

  if (!text) {
    return '<div class="activity-detail-note-empty">無資料</div>';
  }

  const parsed = parseReceiveByTempleNote_(text);

  if (!parsed) {
    return '<div class="activity-detail-note-text">' + escapeActivityListHtml_(text) + '</div>';
  }

  injectActivityDetailNoteStyle_();

  const showChildColumns = parsed.columnMode !== 'qianKunOnly';
  const sections = buildActivityDetailGroupSections_(parsed.rows);
  const sectionsHtml = sections.map(function(section) {
    return renderActivityDetailGroupSection_(section, showChildColumns);
  }).join('');

  return '' +
    '<div class="activity-detail-note-card">' +
      renderActivityDetailNoteMetaHtml_(parsed) +
      '<div class="activity-detail-groups">' + sectionsHtml + '</div>' +
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
  const headers = '' +
    '<tr>' +
      '<th>所屬佛堂</th>' +
      '<th>人數</th>' +
      '<th>乾</th>' +
      '<th>坤</th>' +
      (showChildColumns ? '<th>童</th>' : '') +
      (showChildColumns ? '<th>女</th>' : '') +
    '</tr>';

  const bodyRows = (section.rows || []).map(function(row) {
    return renderActivityDetailDataRow_(row, showChildColumns, '');
  }).join('');

  let subtotalHtml = '';

  if (section.subtotal) {
    const label = section.isGrandTotal
      ? '總計'
      : '小計：' + String(section.templeCount || 0) + '間';

    const subtotal = {
      temple: label,
      total: section.subtotal.total,
      qian: section.subtotal.qian,
      kun: section.subtotal.kun,
      tong: section.subtotal.tong,
      nv: section.subtotal.nv
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
      '<td>' + escapeActivityListHtml_(row.total) + '</td>' +
      '<td>' + escapeActivityListHtml_(formatActivityNoteZeroBlank_(row.qian)) + '</td>' +
      '<td>' + escapeActivityListHtml_(formatActivityNoteZeroBlank_(row.kun)) + '</td>' +
      (showChildColumns ? '<td>' + escapeActivityListHtml_(formatActivityNoteZeroBlank_(row.tong)) + '</td>' : '') +
      (showChildColumns ? '<td>' + escapeActivityListHtml_(formatActivityNoteZeroBlank_(row.nv)) + '</td>' : '') +
    '</tr>';
}


/* =========================
函式名稱：renderActivityDetailNoteMetaHtml_
功能說明：
備註表格上方資訊列。
沒有日期時不顯示日期；有地點才顯示地點。
========================= */
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

  if (text.indexOf('所屬佛堂') < 0) {
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
    if (cleanLine.indexOf('所屬佛堂') >= 0) return;
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
  const headerIndex = text.indexOf('所屬佛堂');

  if (headerIndex < 0) return rows;

  let body = text.substring(headerIndex);
  const columnMode = detectActivityNoteColumnMode_(text);

  body = body.replace(/^所屬佛堂\s*人數\s*乾\s*坤\s*童\s*女\s*/, '');
  body = body.replace(/^所屬佛堂\s*人數\s*乾\s*坤\s*/, '');
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

  if (value.indexOf('所屬佛堂') >= 0 && value.indexOf('童') < 0 && value.indexOf('女') < 0) {
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
        max(8px, env(safe-area-inset-top))
        max(8px, env(safe-area-inset-right))
        max(8px, env(safe-area-inset-bottom))
        max(8px, env(safe-area-inset-left)) !important;
      align-items: stretch !important;
      justify-content: center !important;
      overflow: hidden !important;
      overscroll-behavior: none !important;
      touch-action: none;
    }

    .activity-detail-box {
      position: relative !important;
      display: grid !important;
      grid-template-rows: auto auto minmax(0, 1fr) auto !important;
      width: min(100%, 430px) !important;
      height: 100% !important;
      max-height: none !important;
      min-height: 0 !important;
      margin: 0 auto !important;
      overflow: hidden !important;
      padding:
        18px
        14px
        max(12px, env(safe-area-inset-bottom)) !important;
    }

    .activity-detail-title,
    .activity-detail-date,
    .activity-detail-close-btn {
      min-height: 0;
    }

    .activity-detail-title {
      margin-bottom: 8px !important;
      text-align: center !important;
      color: #07365f !important;
      font-family: BiauKai, "Kaiti TC", "DFKai-SB", "Noto Serif TC", serif !important;
      font-size: 30px !important;
      line-height: 1.25 !important;
      font-weight: 900 !important;
    }

    .activity-detail-actions {
      display: grid !important;
      grid-template-columns: 1fr 1fr !important;
      gap: 12px !important;
      position: relative !important;
      z-index: 6 !important;
    }

    .activity-detail-close-btn,
    .activity-detail-share-btn {
      width: 100% !important;
      min-height: 54px !important;
      margin: 0 !important;
      border-radius: 15px !important;
      font-size: 20px !important;
      font-weight: 900 !important;
    }

    .activity-detail-close-btn {
      color: #1976e8 !important;
      background: #ffffff !important;
      border: 2px solid #1976e8 !important;
    }

    .activity-detail-share-btn {
      color: #ffffff !important;
      background: linear-gradient(180deg, #2f87f5, #1976e8) !important;
      border: 2px solid #1976e8 !important;
    }

    .activity-detail-share-btn:disabled {
      opacity: .65 !important;
    }

    .activity-detail-share-btn.is-error {
      background: #b96a00 !important;
      border-color: #b96a00 !important;
    }

    .activity-detail-note {
      min-height: 0 !important;
      height: 100% !important;
      overflow-x: hidden !important;
      overflow-y: scroll !important;
      overscroll-behavior-y: contain !important;
      -webkit-overflow-scrolling: touch !important;
      touch-action: pan-y !important;
      margin-bottom: 10px !important;
      padding: 0 2px 18px 0 !important;
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
      font-family: BiauKai, "Kaiti TC", "DFKai-SB", "Noto Serif TC", serif;
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
      width: auto;
      min-width: 0;
      max-width: none;
      border-collapse: collapse;
      table-layout: auto;
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

    .activity-detail-note-table .temple-cell {
      text-align: center;
      font-weight: 700;
      min-width: 110px;
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

      .activity-detail-note-table .temple-cell {
        min-width: 102px;
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
