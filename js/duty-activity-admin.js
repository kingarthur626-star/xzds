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
渲染活動名稱與地點 datalist。
========================= */
function renderDutyDatalist_() {
  const activityList = document.getElementById('activityNameList');
  const locationList = document.getElementById('locationList');

  if (activityList) {
    activityList.innerHTML = dutyActivityOptions.map(function (name) {
      return '<option value="' + escapeDutyActivityHtml_(name) + '"></option>';
    }).join('');
  }

  if (locationList) {
    locationList.innerHTML = dutyLocationOptions.map(function (name) {
      return '<option value="' + escapeDutyActivityHtml_(name) + '"></option>';
    }).join('');
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
  setInputValue_('activityName', item.activityName);
  setInputValue_('peopleMode', item.peopleMode || '手動');
  setInputValue_('peopleCount', item.peopleCount);
  setInputValue_('location', item.location);
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
    activityName: getInputValue_('activityName'),
    peopleMode: getInputValue_('peopleMode'),
    peopleCount: getInputValue_('peopleCount'),
    location: getInputValue_('location'),
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
  setInputValue_('activityName', '');
  setInputValue_('peopleMode', '手動');
  setInputValue_('peopleCount', '');
  setInputValue_('location', '');
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
求道統計 / 法會統計：不可輸入，由系統自動計算。
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
