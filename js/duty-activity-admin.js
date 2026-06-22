/* =========================
程式名稱：duty-activity-admin.js
功能說明：
道務活動設定後台頁面專用程式。

主要用途：
1. 檢查登入狀態
2. 讀取道務活動設定資料
3. 新增道務活動
4. 修改道務活動
5. 啟用 / 停用道務活動
6. 控制活動名稱、地點、規劃、人數模式欄位

注意事項：
1. 前端只負責畫面操作。
2. 後端仍會再次檢查 DUTY_ACTIVITY_ADMIN 權限。
3. 本頁需要後端 action：
   - getDutyActivityAdminData
   - saveDutyActivity
   - setDutyActivityStatus
========================= */

let dutyActivityItems = [];
let dutyActivityOptions = [];
let dutyLocationOptions = [];

const DUTY_ACTIVITY_FALLBACK_ACTIVITY_OPTIONS = [
  '孝親活動',
  '報恩法會',
  '樂活養生嘉年華',
  '親其親班務法會',
  '護經闖關',
  '觀音孝親祈福',
  '觀音辦道週'
];

const DUTY_ACTIVITY_FALLBACK_LOCATION_OPTIONS = [
  '崇慧',
  '耕德'
];

document.addEventListener('DOMContentLoaded', function () {
  const user = requireLogin();

  if (!user) return;

  bindDutyActivityButtons_();
  loadDutyActivityAdminData_();
});

/* =========================
函式名稱：bindDutyActivityButtons_
功能說明：
綁定頁面按鈕與表單事件。
========================= */
function bindDutyActivityButtons_() {
  const backBtn = document.getElementById('backBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const reloadBtn = document.getElementById('reloadActivityBtn');
  const clearBtn = document.getElementById('clearActivityBtn');
  const form = document.getElementById('dutyActivityForm');
  const peopleMode = document.getElementById('peopleMode');
  const activityName = document.getElementById('activityName');
  const activityNameCustom = document.getElementById('activityNameCustom');
  const location = document.getElementById('location');
  const locationCustom = document.getElementById('locationCustom');

if (backBtn) {
  backBtn.addEventListener('click', function () {
    location.href = 'duty-activity-list.html';
  });
}

  if (logoutBtn) {
    logoutBtn.addEventListener('click', function () {
      logout();
    });
  }

  if (reloadBtn) {
    reloadBtn.addEventListener('click', function () {
      loadDutyActivityAdminData_();
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', function () {
      resetDutyActivityForm_();
    });
  }

  if (form) {
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      saveDutyActivityFromForm_();
    });
  }

  if (peopleMode) {
    peopleMode.addEventListener('change', function () {
      updatePeopleCountState_();
    });
  }

  if (activityName) {
    activityName.addEventListener('change', function () {
      updateDutyActivityCustomInputState_('activityName');
    });
  }

  if (activityNameCustom) {
    activityNameCustom.addEventListener('input', function () {});
  }

  if (location) {
    location.addEventListener('change', function () {
      updateDutyActivityCustomInputState_('location');
    });
  }

  if (locationCustom) {
    locationCustom.addEventListener('input', function () {});
  }
}

/* =========================
函式名稱：loadDutyActivityAdminData_
功能說明：
讀取道務活動設定後台資料。
========================= */
async function loadDutyActivityAdminData_() {
  const listEl = document.getElementById('dutyActivityList');
  const statsEl = document.getElementById('dutyActivityStats');
  const reloadBtn = document.getElementById('reloadActivityBtn');

  showDutyActivityMessage_('', '');

  if (listEl) {
    listEl.innerHTML = '<div class="small-text">讀取道務活動中...</div>';
  }

  if (statsEl) {
    statsEl.textContent = '讀取中...';
  }

  if (reloadBtn) {
    reloadBtn.disabled = true;
  }

  try {
    const result = await callApi({
      action: 'getDutyActivityAdminData'
    });

    if (!result.success) {
      throw new Error(result.message || '讀取失敗');
    }

    dutyActivityItems = result.activities || [];
    dutyActivityOptions = result.activityOptions || [];
    dutyLocationOptions = result.locationOptions || [];

    renderDutyDatalist_();
    renderDutyActivityList_();
    updatePeopleCountState_();

  } catch (err) {
    if (listEl) {
      listEl.innerHTML = '<div class="small-text">讀取失敗</div>';
    }

    if (statsEl) {
      statsEl.textContent = '讀取失敗';
    }

    showDutyActivityMessage_(err.message || '系統連線失敗，請稍後再試', 'error');

  } finally {
    if (reloadBtn) {
      reloadBtn.disabled = false;
    }
  }
}

/* =========================
函式名稱：renderDutyDatalist_
功能說明：
渲染活動名稱與地點原生下拉選單。
========================= */
function renderDutyDatalist_() {
  const currentActivityName = getDutyActivityFieldValue_('activityName');
  const currentLocation = getDutyActivityFieldValue_('location');

  renderDutyActivityNativeSelect_(
    'activityName',
    mergeDutyActivityOptions_(dutyActivityOptions, getDutyActivityNamesFromItems_(), DUTY_ACTIVITY_FALLBACK_ACTIVITY_OPTIONS),
    '請選擇',
    true
  );

  renderDutyActivityNativeSelect_(
    'location',
    mergeDutyActivityOptions_(dutyLocationOptions, getDutyActivityLocationsFromItems_(), DUTY_ACTIVITY_FALLBACK_LOCATION_OPTIONS),
    '可空白',
    true
  );

  setDutyActivityFieldValue_('activityName', currentActivityName);
  setDutyActivityFieldValue_('location', currentLocation);
}

/* =========================
函式名稱：renderDutyActivityNativeSelect_
功能說明：
將選項渲染到原生 select。
========================= */
function renderDutyActivityNativeSelect_(selectId, options, emptyText, allowCustom) {
  const select = document.getElementById(selectId);

  if (!select) return;

  const htmlParts = [];

  htmlParts.push('<option value="">' + escapeDutyActivityHtml_(emptyText || '請選擇') + '</option>');

  (options || []).forEach(function (name) {
    const cleanName = normalizeDutyActivityText_(name);

    if (!cleanName) return;

    htmlParts.push(
      '<option value="' +
      escapeDutyActivityHtml_(cleanName) +
      '">' +
      escapeDutyActivityHtml_(cleanName) +
      '</option>'
    );
  });

  if (allowCustom) {
    htmlParts.push('<option value="__CUSTOM__">自行輸入</option>');
  }

  select.innerHTML = htmlParts.join('');
}

/* =========================
函式名稱：mergeDutyActivityOptions_
功能說明：
合併後端選項、既有資料與預設選項。
========================= */
function mergeDutyActivityOptions_() {
  const result = [];
  const seen = {};

  for (let a = 0; a < arguments.length; a++) {
    const list = arguments[a] || [];

    for (let i = 0; i < list.length; i++) {
      const text = normalizeDutyActivityText_(list[i]);

      if (!text || seen[text]) continue;

      seen[text] = true;
      result.push(text);
    }
  }

  return result;
}

/* =========================
函式名稱：getDutyActivityNamesFromItems_
功能說明：
從既有活動設定補活動名稱。
========================= */
function getDutyActivityNamesFromItems_() {
  const result = [];

  for (let i = 0; i < dutyActivityItems.length; i++) {
    const name = normalizeDutyActivityText_(dutyActivityItems[i].activityName);

    if (name) {
      result.push(name);
    }
  }

  return result;
}

/* =========================
函式名稱：getDutyActivityLocationsFromItems_
功能說明：
從既有活動設定補地點。
========================= */
function getDutyActivityLocationsFromItems_() {
  const result = [];

  for (let i = 0; i < dutyActivityItems.length; i++) {
    const location = normalizeDutyActivityText_(dutyActivityItems[i].location);

    if (location) {
      result.push(location);
    }
  }

  return result;
}

/* =========================
函式名稱：getDutyActivityFieldValue_
功能說明：
取得原生 select 或自行輸入欄位的實際值。
========================= */
function getDutyActivityFieldValue_(fieldId) {
  const select = document.getElementById(fieldId);
  const custom = document.getElementById(fieldId + 'Custom');

  if (!select) return '';

  if (select.value === '__CUSTOM__') {
    return normalizeDutyActivityText_(custom && custom.value);
  }

  return normalizeDutyActivityText_(select.value);
}

/* =========================
函式名稱：setDutyActivityFieldValue_
功能說明：
設定原生 select 或自行輸入欄位。
========================= */
function setDutyActivityFieldValue_(fieldId, value) {
  const select = document.getElementById(fieldId);
  const custom = document.getElementById(fieldId + 'Custom');
  const cleanValue = normalizeDutyActivityText_(value);

  if (!select) return;

  if (!cleanValue) {
    select.value = '';

    if (custom) {
      custom.value = '';
      custom.style.display = 'none';
    }

    return;
  }

  let exists = false;

  for (let i = 0; i < select.options.length; i++) {
    if (select.options[i].value === cleanValue) {
      exists = true;
      break;
    }
  }

  if (exists) {
    select.value = cleanValue;

    if (custom) {
      custom.value = '';
      custom.style.display = 'none';
    }

    return;
  }

  select.value = '__CUSTOM__';

  if (custom) {
    custom.value = cleanValue;
    custom.style.display = '';
  }
}

/* =========================
函式名稱：updateDutyActivityCustomInputState_
功能說明：
控制自行輸入欄位顯示。
========================= */
function updateDutyActivityCustomInputState_(fieldId) {
  const select = document.getElementById(fieldId);
  const custom = document.getElementById(fieldId + 'Custom');

  if (!select || !custom) return;

  if (select.value === '__CUSTOM__') {
    custom.style.display = '';
    custom.focus();
  } else {
    custom.value = '';
    custom.style.display = 'none';
  }
}

/* =========================
函式名稱：renderDutyActivityList_
功能說明：
渲染道務活動設定卡片列表。
========================= */
function renderDutyActivityList_() {
  const listEl = document.getElementById('dutyActivityList');
  const statsEl = document.getElementById('dutyActivityStats');

  if (!listEl) return;

  if (statsEl) {
    statsEl.textContent = '共 ' + dutyActivityItems.length + ' 筆道務活動設定';
  }

  if (dutyActivityItems.length === 0) {
    listEl.innerHTML = '<div class="small-text">目前尚無道務活動設定</div>';
    return;
  }

  const htmlParts = [];

  for (let i = 0; i < dutyActivityItems.length; i++) {
    htmlParts.push(createDutyActivityCardHtml_(dutyActivityItems[i]));
  }

  listEl.innerHTML = htmlParts.join('');

  bindDutyActivityCardButtons_();
}

/* =========================
函式名稱：createDutyActivityCardHtml_
功能說明：
產生單一道務活動設定卡片。
========================= */
function createDutyActivityCardHtml_(item) {
  const id = escapeDutyActivityHtml_(item.id || '');
  const title = escapeDutyActivityHtml_(item.activityName || '');
  const dateRange = escapeDutyActivityHtml_((item.dateStart || '') + ' ～ ' + (item.dateEnd || ''));
  const peopleMode = escapeDutyActivityHtml_(item.peopleMode || '');
  const peopleCount = escapeDutyActivityHtml_(item.peopleCount || '');
  const peopleCountDisplay = peopleCount || (item.peopleMode === '手動' ? '—' : '由系統自動計算');
  const location = escapeDutyActivityHtml_(item.location || '—');
  const planning = escapeDutyActivityHtml_(item.planning || '—');
  const status = escapeDutyActivityHtml_(item.status || '啟用');
  const updatedAt = escapeDutyActivityHtml_(item.updatedAt || '—');
  const updatedBy = escapeDutyActivityHtml_(item.updatedBy || '—');

  const statusClass = status === '啟用' ? 'enabled' : 'disabled';
  const toggleText = status === '啟用' ? '停用' : '啟用';
  const nextStatus = status === '啟用' ? '停用' : '啟用';

  return '' +
    '<div class="duty-activity-item" data-id="' + id + '">' +
      '<div class="duty-item-head">' +
        '<div>' +
          '<div class="duty-item-title">' + title + '</div>' +
          '<div class="duty-item-sub">' + dateRange + '</div>' +
        '</div>' +
        '<div class="duty-item-id">#' + id + '</div>' +
      '</div>' +

      '<div class="duty-item-meta">' +
        '<span>模式：' + peopleMode + '</span>' +
        '<span>人數：' + peopleCountDisplay + '</span>' +
        '<span>地點：' + location + '</span>' +
        '<span>規劃：' + planning + '</span>' +
      '</div>' +

      '<div class="duty-item-footer">' +
        '<span class="duty-status-pill ' + statusClass + '">' + status + '</span>' +
        '<span class="duty-updated-text">更新：' + updatedAt + '｜' + updatedBy + '</span>' +
      '</div>' +

      '<div class="duty-card-actions">' +
        '<button class="duty-edit-btn" type="button">編輯</button>' +
        '<button class="duty-toggle-btn" type="button" data-next-status="' + nextStatus + '">' + toggleText + '</button>' +
      '</div>' +
    '</div>';
}

/* =========================
函式名稱：bindDutyActivityCardButtons_
功能說明：
綁定活動卡片上的編輯與啟停按鈕。
========================= */
function bindDutyActivityCardButtons_() {
  const cards = document.querySelectorAll('.duty-activity-item');

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    const editBtn = card.querySelector('.duty-edit-btn');
    const toggleBtn = card.querySelector('.duty-toggle-btn');

    if (editBtn) {
      editBtn.addEventListener('click', function () {
        editDutyActivity_(card.getAttribute('data-id'));
      });
    }

    if (toggleBtn) {
      toggleBtn.addEventListener('click', function () {
        toggleDutyActivityStatus_(
          card.getAttribute('data-id'),
          toggleBtn.getAttribute('data-next-status')
        );
      });
    }
  }
}

/* =========================
函式名稱：editDutyActivity_
功能說明：
把既有活動資料帶回表單，提供修改。
========================= */
function editDutyActivity_(id) {
  const item = findDutyActivityById_(id);

  if (!item) {
    showDutyActivityMessage_('找不到活動資料。', 'error');
    return;
  }

  setInputValue_('activityId', item.id);
  setInputValue_('dateStart', toHtmlDateValue_(item.dateStart));
  setInputValue_('dateEnd', toHtmlDateValue_(item.dateEnd));
  setDutyActivityFieldValue_('activityName', item.activityName);
  setInputValue_('peopleMode', item.peopleMode || '手動');
  setInputValue_('peopleCount', item.peopleCount);
  setDutyActivityFieldValue_('location', item.location);
  setInputValue_('planning', item.planning);
  setInputValue_('activityStatus', item.status || '啟用');
  setInputValue_('activityNote', item.note);

  const saveBtn = document.getElementById('saveActivityBtn');
  if (saveBtn) {
    saveBtn.textContent = '儲存修改';
  }

  updatePeopleCountState_();

  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });
}

/* =========================
函式名稱：saveDutyActivityFromForm_
功能說明：
讀取表單資料並送到後端儲存。
========================= */
async function saveDutyActivityFromForm_() {
  const saveBtn = document.getElementById('saveActivityBtn');

  const payload = {
    action: 'saveDutyActivity',
    id: getInputValue_('activityId'),
    dateStart: getInputValue_('dateStart'),
    dateEnd: getInputValue_('dateEnd'),
    activityName: getDutyActivityFieldValue_('activityName'),
    peopleMode: getInputValue_('peopleMode'),
    peopleCount: getInputValue_('peopleCount'),
    location: getDutyActivityFieldValue_('location'),
    planning: getInputValue_('planning'),
    status: getInputValue_('activityStatus'),
    note: getInputValue_('activityNote')
  };

  if (!payload.dateStart) {
    showDutyActivityMessage_('請選擇日期起。', 'error');
    return;
  }

  if (!payload.dateEnd) {
    showDutyActivityMessage_('請選擇日期訖。', 'error');
    return;
  }

  if (!payload.activityName) {
    showDutyActivityMessage_('請輸入道務活動。', 'error');
    return;
  }

  if (!payload.planning) {
    showDutyActivityMessage_('請選擇規劃。', 'error');
    return;
  }

  if (payload.peopleMode === '手動' && !payload.peopleCount) {
    showDutyActivityMessage_('人數模式為手動時，請輸入人數。', 'error');
    return;
  }

  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = payload.peopleMode === '手動' ? '儲存中...' : '儲存並統計中...';
  }

  try {
    const result = await callApi(payload);

    if (!result.success) {
      throw new Error(result.message || '儲存失敗');
    }

    let successMessage = result.message || '儲存完成';

    if (payload.peopleMode !== '手動') {
      const calculatedCount =
        result.peopleCount ||
        result.calculatedCount ||
        (result.stats && result.stats.totalCount);

      if (calculatedCount !== undefined && calculatedCount !== null && calculatedCount !== '') {
        successMessage += '，系統統計人數：' + calculatedCount;
      }
    }

    showDutyActivityMessage_(successMessage, 'success');

    resetDutyActivityForm_();
    loadDutyActivityAdminData_();

  } catch (err) {
    showDutyActivityMessage_(err.message || '儲存失敗，請稍後再試', 'error');

  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = getInputValue_('activityId') ? '儲存修改' : '新增活動';
    }
  }
}

/* =========================
函式名稱：toggleDutyActivityStatus_
功能說明：
啟用或停用指定活動。
========================= */
async function toggleDutyActivityStatus_(id, nextStatus) {
  const item = findDutyActivityById_(id);

  if (!item) {
    showDutyActivityMessage_('找不到活動資料。', 'error');
    return;
  }

  const ok = confirm(
    '確認將「' + item.activityName + '」改為' + nextStatus + '？'
  );

  if (!ok) return;

  try {
    const result = await callApi({
      action: 'setDutyActivityStatus',
      id: id,
      status: nextStatus
    });

    if (!result.success) {
      throw new Error(result.message || '狀態更新失敗');
    }

    showDutyActivityMessage_(result.message || '狀態已更新', 'success');
    loadDutyActivityAdminData_();

  } catch (err) {
    showDutyActivityMessage_(err.message || '狀態更新失敗，請稍後再試', 'error');
  }
}

/* =========================
函式名稱：resetDutyActivityForm_
功能說明：
清空表單，切回新增模式。
========================= */
function resetDutyActivityForm_() {
  setInputValue_('activityId', '');
  setInputValue_('dateStart', '');
  setInputValue_('dateEnd', '');
  setDutyActivityFieldValue_('activityName', '');
  setInputValue_('peopleMode', '手動');
  setInputValue_('peopleCount', '');
  setDutyActivityFieldValue_('location', '');
  setInputValue_('planning', '');
  setInputValue_('activityStatus', '啟用');
  setInputValue_('activityNote', '');

  const saveBtn = document.getElementById('saveActivityBtn');
  if (saveBtn) {
    saveBtn.textContent = '新增活動';
  }

  updatePeopleCountState_();
  showDutyActivityMessage_('', '');
}

/* =========================
函式名稱：updatePeopleCountState_
功能說明：
依照人數模式控制人數欄位。
手動：可輸入。
求道統計 / 法會統計：先不可輸入，下一階段由系統統計。
========================= */
function updatePeopleCountState_() {
  const peopleMode = getInputValue_('peopleMode');
  const peopleCount = document.getElementById('peopleCount');

  if (!peopleCount) return;

  if (peopleMode === '手動') {
    peopleCount.disabled = false;
    peopleCount.placeholder = '手動輸入';
  } else {
    peopleCount.disabled = true;
    peopleCount.value = '';
    peopleCount.placeholder = '由系統自動計算';
  }
}

/* =========================
函式名稱：findDutyActivityById_
功能說明：
依照活動編號尋找資料。
========================= */
function findDutyActivityById_(id) {
  const targetId = normalizeDutyActivityText_(id);

  for (let i = 0; i < dutyActivityItems.length; i++) {
    if (normalizeDutyActivityText_(dutyActivityItems[i].id) === targetId) {
      return dutyActivityItems[i];
    }
  }

  return null;
}

/* =========================
函式名稱：getInputValue_
功能說明：
取得指定欄位的值。
========================= */
function getInputValue_(id) {
  const el = document.getElementById(id);

  if (!el) return '';

  return normalizeDutyActivityText_(el.value);
}

/* =========================
函式名稱：setInputValue_
功能說明：
設定指定欄位的值。
========================= */
function setInputValue_(id, value) {
  const el = document.getElementById(id);

  if (!el) return;

  el.value = value || '';
}

/* =========================
函式名稱：toHtmlDateValue_
功能說明：
將 yyyy/MM/dd 或 yyyy-MM-dd 轉成 input date 可用格式 yyyy-MM-dd。
========================= */
function toHtmlDateValue_(value) {
  const text = normalizeDutyActivityText_(value);

  if (!text) return '';

  const compact = text.replace(/[\/\.]/g, '-');

  if (/^\d{4}-\d{2}-\d{2}$/.test(compact)) {
    return compact;
  }

  return '';
}

/* =========================
函式名稱：showDutyActivityMessage_
功能說明：
顯示成功或錯誤訊息。
========================= */
function showDutyActivityMessage_(text, type) {
  const el = document.getElementById('dutyActivityMessage');

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

/* =========================
函式名稱：normalizeDutyActivityText_
功能說明：
清理文字中的全形空白與前後空白。
========================= */
function normalizeDutyActivityText_(value) {
  return String(value || '')
    .replace(/\u3000/g, ' ')
    .trim();
}

/* =========================
函式名稱：escapeDutyActivityHtml_
功能說明：
避免資料內容影響 HTML 結構。
========================= */
function escapeDutyActivityHtml_(value) {
  return normalizeDutyActivityText_(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
