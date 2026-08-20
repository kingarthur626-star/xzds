/*
 * 程式名稱：member-search.js
 * 版本：v1.0.0R1F6
 * 功能：姓名／道親編號搜尋、完整資料顯示、道親編號 QR Code 與 LINE 分享。
 */

let memberSearchCurrentMember_ = null;
let memberSearchRequestSerial_ = 0;
let memberSearchMode_ = 'name';

document.addEventListener('DOMContentLoaded', function () {
  const user = requireLogin();
  if (!user) return;

  bindMemberSearchEvents_();
  const input = document.getElementById('memberSearchInput');
  if (input) input.focus();
});

function bindMemberSearchEvents_() {
  const homeBtn = document.getElementById('memberSearchHomeBtn');
  const logoutBtn = document.getElementById('memberSearchLogoutBtn');
  const submitBtn = document.getElementById('memberSearchSubmitBtn');
  const input = document.getElementById('memberSearchInput');
  const modeButtons = document.querySelectorAll('[data-search-mode]');
  const list = document.getElementById('memberSearchResultList');
  const idBtn = document.getElementById('memberSearchMemberIdBtn');
  const detailGroups = document.getElementById('memberSearchDetailGroups');
  const qrClose = document.getElementById('memberSearchQrCloseBtn');
  const qrShare = document.getElementById('memberSearchQrShareBtn');
  const modal = document.getElementById('memberSearchQrModal');

  if (homeBtn) homeBtn.addEventListener('click', function () { location.href = 'home.html'; });
  if (logoutBtn) logoutBtn.addEventListener('click', function () { logout(); });
  if (submitBtn) submitBtn.addEventListener('click', runMemberSearch_);
  modeButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      setMemberSearchMode_(button.getAttribute('data-search-mode'));
    });
  });

  if (input) {
    input.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        runMemberSearch_();
      }
    });
  }

  if (list) {
    list.addEventListener('click', function (event) {
      const button = event.target.closest('[data-member-id]');
      if (!button) return;
      const memberId = button.getAttribute('data-member-id') || '';
      if (memberId) loadMemberDetail_(memberId);
    });
  }

  if (idBtn) idBtn.addEventListener('click', openMemberQr_);
  if (detailGroups) {
    detailGroups.addEventListener('click', function (event) {
      if (event.target.closest('[data-open-member-qr="1"]')) openMemberQr_();
    });
  }
  if (qrClose) qrClose.addEventListener('click', closeMemberQr_);
  if (qrShare) qrShare.addEventListener('click', shareMemberQr_);

  if (modal) {
    modal.addEventListener('click', function (event) {
      if (event.target && event.target.getAttribute('data-close-qr') === '1') closeMemberQr_();
    });
  }

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') closeMemberQr_();
  });
}

async function runMemberSearch_() {
  const input = document.getElementById('memberSearchInput');
  const query = String(input ? input.value : '').trim();

  showMemberSearchError_('');
  clearMemberDetail_();

  if (!query) {
    showMemberSearchError_(memberSearchMode_ === 'memberId' ? '請輸入道親編號。' : '請輸入姓名。');
    if (input) input.focus();
    return;
  }

  const serial = ++memberSearchRequestSerial_;
  setMemberSearchLoading_(true);

  try {
    const result = await callApi({
      action: 'taoMemberSearch',
      query: query,
      mode: memberSearchMode_
    });

    if (serial !== memberSearchRequestSerial_) return;
    if (!result.success) throw new Error(result.message || '搜尋失敗');

    renderMemberSearchResults_(result);

    if (result.member) {
      memberSearchCurrentMember_ = result.member;
      renderMemberDetail_(result.member);
    } else if (result.results && result.results.length === 1 && Number(result.count) === 1) {
      await loadMemberDetail_(result.results[0].memberId, serial);
    }
  } catch (error) {
    if (serial !== memberSearchRequestSerial_) return;
    showMemberSearchError_(error && error.message ? error.message : '搜尋失敗，請稍後再試。');
  } finally {
    if (serial === memberSearchRequestSerial_) setMemberSearchLoading_(false);
  }
}

function setMemberSearchMode_(mode) {
  memberSearchMode_ = mode === 'memberId' ? 'memberId' : 'name';
  const isMemberId = memberSearchMode_ === 'memberId';
  const input = document.getElementById('memberSearchInput');
  const hint = document.getElementById('memberSearchHint');
  document.querySelectorAll('[data-search-mode]').forEach(function (button) {
    const active = button.getAttribute('data-search-mode') === memberSearchMode_;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  if (input) {
    input.placeholder = isMemberId ? '輸入完整道親編號' : '輸入姓名';
    input.setAttribute('aria-label', isMemberId ? '道親編號' : '姓名');
    input.focus();
  }
  if (hint) hint.textContent = isMemberId
    ? '請輸入完整道親編號，可快速精準查詢。'
    : '可輸入完整姓名或姓名前幾個字。';
  showMemberSearchError_('');
}

function renderMemberSearchResults_(result) {
  const section = document.getElementById('memberSearchResults');
  const list = document.getElementById('memberSearchResultList');
  const count = document.getElementById('memberSearchResultsCount');
  if (!section || !list) return;

  const results = Array.isArray(result.results) ? result.results : [];
  const total = Number(result.count || 0);

  if (count) {
    const serverMs = Number(result.timing && result.timing.totalMs);
    const timingText = Number.isFinite(serverMs) && serverMs >= 0
      ? '・後端 ' + (serverMs / 1000).toFixed(1) + ' 秒'
      : '';
    count.textContent = total > 0
      ? '共 ' + total + ' 筆' + (result.truncated ? '（顯示前 ' + results.length + ' 筆）' : '') + timingText
      : '0 筆' + timingText;
  }

  if (!results.length) {
    list.innerHTML = '<div class="member-search-message">找不到符合資料</div>';
    section.hidden = false;
    return;
  }

  list.innerHTML = results.map(function (item) {
    const personMeta = [item.gender, item.age ? item.age + '歲' : '', item.identity]
      .filter(Boolean)
      .join('　');

    return (
      '<button class="member-search-result-item" type="button" data-member-id="' + escapeMemberHtml_(item.memberId) + '">' +
        '<span>' +
          '<span class="member-search-result-name">' +
            '<strong>' + escapeMemberHtml_(item.name || '未命名') + '</strong>' +
            '<span>' + escapeMemberHtml_(item.temple || '') + '</span>' +
          '</span>' +
          '<span class="member-search-result-meta">' + escapeMemberHtml_(personMeta) + '</span>' +
        '</span>' +
        '<span class="member-search-result-id">' + escapeMemberHtml_(item.memberId || '') + '</span>' +
      '</button>'
    );
  }).join('');

  section.hidden = false;
}

async function loadMemberDetail_(memberId, existingSerial) {
  if (!memberId) return;
  const serial = existingSerial || ++memberSearchRequestSerial_;
  setMemberSearchLoading_(true);
  showMemberSearchError_('');

  try {
    const result = await callApi({
      action: 'taoMemberGetDetail',
      memberId: memberId
    });

    if (serial !== memberSearchRequestSerial_) return;
    if (!result.success || !result.member) throw new Error(result.message || '資料讀取失敗');

    memberSearchCurrentMember_ = result.member;
    renderMemberDetail_(result.member);
  } catch (error) {
    if (serial !== memberSearchRequestSerial_) return;
    showMemberSearchError_(error && error.message ? error.message : '資料讀取失敗。');
  } finally {
    if (serial === memberSearchRequestSerial_) setMemberSearchLoading_(false);
  }
}

function renderMemberDetail_(member) {
  const section = document.getElementById('memberSearchDetail');
  const groupsArea = document.getElementById('memberSearchDetailGroups');
  if (!section || !groupsArea) return;

  setMemberText_('memberSearchPersonName', member.name || '未命名');
  setMemberText_('memberSearchPersonId', member.memberId || '--');

  const meta = [member.temple, member.gender, member.age ? member.age + '歲' : '', member.identity]
    .filter(Boolean)
    .join('　');
  setMemberText_('memberSearchPersonMeta', meta);

  const groups = Array.isArray(member.groups) ? member.groups : [];
  groupsArea.innerHTML = groups.map(function (group) {
    const items = Array.isArray(group.items) ? group.items : [];
    return (
      '<section class="member-search-group-card">' +
        '<div class="member-search-group-title">' + escapeMemberHtml_(group.title || '') + '</div>' +
        '<div class="member-search-field-grid">' +
          items.map(function (item) {
            const clickableId = item.label === '道親編號';
            const valueHtml = clickableId
              ? '<button type="button" class="member-search-field-id-btn" data-open-member-qr="1">' + escapeMemberHtml_(item.value || '') + '</button>'
              : '<strong>' + escapeMemberHtml_(item.value || '') + '</strong>';
            return (
              '<div class="member-search-field">' +
                '<label>' + escapeMemberHtml_(item.label || '') + '</label>' +
                valueHtml +
              '</div>'
            );
          }).join('') +
        '</div>' +
      '</section>'
    );
  }).join('');

  section.hidden = false;
  section.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function clearMemberDetail_() {
  memberSearchCurrentMember_ = null;
  const section = document.getElementById('memberSearchDetail');
  const modal = document.getElementById('memberSearchQrModal');
  if (section) section.hidden = true;
  if (modal) modal.hidden = true;
}

function openMemberQr_() {
  const member = memberSearchCurrentMember_;
  if (!member || !member.memberId) return;

  try {
    if (!window.XZDSLocalQR) throw new Error('QR 模組尚未載入。');
    const matrix = window.XZDSLocalQR.createMatrix(member.memberId);
    const canvas = document.getElementById('memberSearchQrCanvas');
    window.XZDSLocalQR.drawMatrix(canvas, matrix, { size: 480, quiet: 4 });

    setMemberText_('memberSearchQrName', member.name || '');
    setMemberText_('memberSearchQrId', member.memberId);

    const modal = document.getElementById('memberSearchQrModal');
    if (modal) modal.hidden = false;
  } catch (error) {
    showMemberSearchError_(error && error.message ? error.message : 'QR Code 產生失敗。');
  }
}

function closeMemberQr_() {
  const modal = document.getElementById('memberSearchQrModal');
  if (modal) modal.hidden = true;
}

async function shareMemberQr_() {
  const member = memberSearchCurrentMember_;
  if (!member || !member.memberId) return;

  const shareBtn = document.getElementById('memberSearchQrShareBtn');
  if (shareBtn) {
    shareBtn.disabled = true;
    shareBtn.textContent = '產生圖片中...';
  }

  try {
    const shareCanvas = buildMemberQrShareCanvas_(member);
    const blob = await canvasToBlob_(shareCanvas);
    const safeId = String(member.memberId).replace(/[^A-Za-z0-9_-]+/g, '_');
    const file = new File([blob], '道親QR_' + safeId + '.png', { type: 'image/png' });

    if (
      navigator.share &&
      navigator.canShare &&
      navigator.canShare({ files: [file] })
    ) {
      await navigator.share({
        title: '道親 QR Code',
        text: (member.name || '') + '　' + member.memberId,
        files: [file]
      });
      return;
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    alert('此裝置不支援直接分享，QR 圖片已產生。');
  } catch (error) {
    if (error && error.name === 'AbortError') return;
    showMemberSearchError_(error && error.message ? error.message : 'QR 圖片分享失敗。');
  } finally {
    if (shareBtn) {
      shareBtn.disabled = false;
      shareBtn.textContent = 'LINE 分享 QR 圖片';
    }
  }
}

function buildMemberQrShareCanvas_(member) {
  if (!window.XZDSLocalQR) throw new Error('QR 模組尚未載入。');

  // 分享圖片只保留：姓名、道親編號、QR Code。
  // 不顯示「道親 QR Code」與「掃描內容：...」，讓版面更乾淨。
  const width = 900;
  const height = 930;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#f5f7fb';
  ctx.fillRect(0, 0, width, height);

  drawRoundedRect_(ctx, 45, 45, width - 90, height - 90, 34, '#ffffff', '#dbe3ed');

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#173f63';
  ctx.font = '900 44px "Microsoft JhengHei", "Noto Sans TC", sans-serif';
  ctx.fillText(member.name || '', width / 2, 120);

  ctx.fillStyle = '#1769aa';
  ctx.font = '900 34px Arial, sans-serif';
  ctx.fillText(member.memberId, width / 2, 178);

  const qrCanvas = document.createElement('canvas');
  const matrix = window.XZDSLocalQR.createMatrix(member.memberId);
  window.XZDSLocalQR.drawMatrix(qrCanvas, matrix, { size: 600, quiet: 4 });
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(qrCanvas, 150, 235, 600, 600);

  return canvas;
}

function drawRoundedRect_(ctx, x, y, width, height, radius, fill, stroke) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
}

function canvasToBlob_(canvas) {
  return new Promise(function (resolve, reject) {
    canvas.toBlob(function (blob) {
      if (blob) resolve(blob);
      else reject(new Error('PNG 產生失敗。'));
    }, 'image/png');
  });
}

function setMemberSearchLoading_(loading) {
  const area = document.getElementById('memberSearchLoading');
  const btn = document.getElementById('memberSearchSubmitBtn');
  if (area) area.hidden = !loading;
  if (btn) {
    btn.disabled = !!loading;
    btn.textContent = loading ? '搜尋中' : '搜尋';
  }
}

function showMemberSearchError_(message) {
  const area = document.getElementById('memberSearchError');
  if (!area) return;
  const text = String(message || '').trim();
  area.textContent = text;
  area.hidden = !text;
}

function setMemberText_(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value == null ? '' : String(value);
}

function escapeMemberHtml_(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
