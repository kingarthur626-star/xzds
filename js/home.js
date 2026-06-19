document.addEventListener('DOMContentLoaded', function () {
  const user = requireLogin();

  if (!user) return;

  initHomePage(user);
});

function initHomePage(user) {
  const templeEl = document.getElementById('homeTempleName');

  if (templeEl) {
    templeEl.textContent = user.temple || '未取得壇名';
  }

  bindHomeButtons();
  loadHomePermissions();
  loadTaoReportLastUpdate();
}

function bindHomeButtons() {
  const btnAnnual = document.getElementById('btnAnnual');
  const btnHistory = document.getElementById('btnHistory');
  const btnUpdate = document.getElementById('btnUpdate');
  const btnLogout = document.getElementById('btnLogout');

  if (btnAnnual) {
    btnAnnual.addEventListener('click', function () {
      location.href = 'annual.html';
    });
  }

  if (btnHistory) {
    btnHistory.addEventListener('click', function () {
      location.href = 'history.html';
    });
  }

  if (btnUpdate) {
    btnUpdate.addEventListener('click', updateTaoReport);
  }

  if (btnLogout) {
    btnLogout.addEventListener('click', logout);
  }
}

async function loadHomePermissions() {
  const btnUpdate = document.getElementById('btnUpdate');
  const btnMore = document.getElementById('btnMore');

  // 預設全部隱藏，避免沒有權限的人先看到按鈕
  if (btnUpdate) {
    btnUpdate.style.display = 'none';
  }

  if (btnMore) {
    btnMore.style.display = 'none';
  }

  try {
    const result = await callApi({
      action: 'getMyPermissions'
    });

    if (!result.success) {
      return;
    }

    const permissions = result.permissions || {};

    // 有「更新即時報表」權限的人，才顯示更新報表
    if (btnUpdate && permissions.updateTaoReport) {
      btnUpdate.style.display = 'flex';
    }

    // 有「系統後台」權限的人，才顯示系統後台
    if (btnMore && permissions.adminPanel) {
      btnMore.style.display = 'flex';
      btnMore.classList.remove('disabled');

      btnMore.innerHTML = `
        <span class="home-menu-main">系統後台</span>
        <span class="home-menu-sub">權限管理</span>
      `;

      btnMore.onclick = function () {
        location.href = 'admin.html';
      };
    }

  } catch (err) {
    if (btnUpdate) {
      btnUpdate.style.display = 'none';
    }

    if (btnMore) {
      btnMore.style.display = 'none';
    }
  }
}

async function loadTaoReportLastUpdate() {
  const area = document.getElementById('lastUpdateText');

  if (!area) return;

  const cachedLastUpdate = localStorage.getItem('taoReportLastUpdate');

  if (cachedLastUpdate) {
    area.textContent = '最後更新：' + cachedLastUpdate;
  } else {
    area.textContent = '最後更新：讀取中...';
  }

  try {
    const result = await callApi({
      action: 'getTaoReportLastUpdate'
    });

    if (result.success && result.lastUpdate) {
      area.textContent = '最後更新：' + result.lastUpdate;
      localStorage.setItem('taoReportLastUpdate', result.lastUpdate);
    } else {
      if (!cachedLastUpdate) {
        area.textContent = '最後更新：尚未更新';
      }
    }

  } catch (err) {
    if (!cachedLastUpdate) {
      area.textContent = '最後更新：讀取失敗';
    }
  }
}

async function updateTaoReport() {
  const ok = confirm('是否更新即時道務報表？');

  if (!ok) return;

  const btn = document.getElementById('btnUpdate');

  setUpdateButtonLoading(btn, true);

  try {
    const result = await callApi({
      action: 'updateTaoReport01Stored'
    });

    if (result.success) {
      if (result.updatedAt) {
        localStorage.setItem('taoReportLastUpdate', result.updatedAt);

        const area = document.getElementById('lastUpdateText');
        if (area) {
          area.textContent = '最後更新：' + result.updatedAt;
        }
      }

      alert(
        '更新完成\n\n' +
        '求道筆數：' + result.qiudaoRows + '\n' +
        '法會筆數：' + result.fahuiRows + '\n' +
        '更新時間：' + result.updatedAt
      );

      loadTaoReportLastUpdate();

    } else {
      alert(result.message || '更新失敗');
    }

  } catch (err) {
    alert(err.message || '系統連線失敗，請稍後再試');

  } finally {
    setUpdateButtonLoading(btn, false);
  }
}

function setUpdateButtonLoading(btn, isLoading) {
  if (!btn) return;

  btn.disabled = isLoading;

  if (isLoading) {
    btn.classList.add('disabled');
    btn.innerHTML = `
      <span class="home-menu-main">更新中</span>
      <span class="home-menu-sub">請稍候...</span>
    `;
  } else {
    btn.classList.remove('disabled');
    btn.innerHTML = `
      <span class="home-menu-main">更新報表</span>
      <span class="home-menu-sub">即時同步</span>
    `;
  }
}