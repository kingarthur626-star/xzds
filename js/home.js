document.addEventListener('DOMContentLoaded', function() {
  const user = requireLogin();

  if (!user) return;

  document.getElementById('homeContent').innerHTML = `
    <div class="menu-area">
      <a class="menu-btn" href="annual.html">${escapeHtml(user.temple)} 今年道務</a>
      <a class="menu-btn" href="history.html">近年道務</a>

      <div class="small-text" id="taoReportLastUpdate">
        即時報表最後更新：讀取中...
      </div>

      <button class="btn" id="updateTaoReportBtn" type="button">更新即時報表</button>
    </div>
  `;

  loadTaoReportLastUpdate();

  const updateBtn = document.getElementById('updateTaoReportBtn');
  if (updateBtn) {
    updateBtn.addEventListener('click', updateTaoReport);
  }

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', logout);
  }
});

async function loadTaoReportLastUpdate() {
  const area = document.getElementById('taoReportLastUpdate');

  if (!area) return;

  try {
    const result = await callApi({
      action: 'getTaoReportLastUpdate'
    });

    if (result.success && result.lastUpdate) {
      area.textContent = '即時報表最後更新：' + result.lastUpdate;
    } else {
      area.textContent = '即時報表最後更新：尚未更新';
    }

  } catch (err) {
    area.textContent = '即時報表最後更新：讀取失敗';
  }
}

async function updateTaoReport() {
  const ok = confirm('是否更新即時道務報表？');

  if (!ok) return;

  const btn = document.getElementById('updateTaoReportBtn');

  if (btn) {
    btn.disabled = true;
    btn.textContent = '更新中...';
  }

  try {
    const result = await callApi({
      action: 'updateTaoReport01Stored'
    });

    if (result.success) {
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
    if (btn) {
      btn.disabled = false;
      btn.textContent = '更新即時報表';
    }
  }
}