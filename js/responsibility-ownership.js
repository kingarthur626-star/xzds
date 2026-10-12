/* =========================
程式名稱：responsibility-ownership.js
功能：
1. 顯示「責任點傳師 忠字班道務歸屬」唯讀資料。
2. 以後端回傳的 Excel D 欄正式佛堂名稱為唯一對應鍵。
3. 每間佛堂顯示求道／法會兩列；同時僅可展開一間佛堂。
4. 達成率採綠、黃、紅與 10 格比例圖。
========================= */

let responsibilityCurrentData_ = null;
let responsibilityExpandedTempleKey_ = '';
let responsibilityRequestSerial_ = 0;
let responsibilityContributionMode_ = '';
let responsibilityContributionLandscape_ = null;
let responsibilityRankingCategory_ = '';

document.addEventListener('DOMContentLoaded', function () {
  const user = requireLogin();
  if (!user) return;

  bindResponsibilityActions_();
  loadResponsibilityOwnership_(0);
});

function bindResponsibilityActions_() {
  const logoutButton = document.getElementById('responsibilityLogoutBtn');
  const homeButton = document.getElementById('responsibilityHomeBtn');
  const reloadButton = document.getElementById('responsibilityReloadBtn');
  const monthSelect = document.getElementById('responsibilityMonthSelect');
  const groupSelect = document.getElementById('responsibilityGroupSelect');
  const groups = document.getElementById('responsibilityGroups');
  const batchButton = document.getElementById('responsibilityBatchExportBtn');
  document.querySelectorAll('[data-responsibility-contribution-mode]').forEach(function (button) {
    button.addEventListener('click', function () {
      const mode = button.dataset.responsibilityContributionMode;
      if (window.ResponsibilityShare) window.ResponsibilityShare.close();
      responsibilityContributionMode_ = responsibilityRankingCategory_ ? mode : responsibilityContributionMode_ === mode ? '' : mode;
      syncResponsibilityContributionMode_();
      if (responsibilityCurrentData_) renderResponsibilityOwnership_(responsibilityCurrentData_);
    });
  });
  document.querySelectorAll('[data-responsibility-ranking-category]').forEach(function (button) {
    button.addEventListener('click', function () {
      if (window.ResponsibilityShare) window.ResponsibilityShare.close();
      const category = button.dataset.responsibilityRankingCategory;
      responsibilityRankingCategory_ = responsibilityRankingCategory_ === category ? '' : category;
      if (responsibilityRankingCategory_ && !responsibilityContributionMode_) responsibilityContributionMode_ = 'combined';
      responsibilityExpandedTempleKey_ = '';
      syncResponsibilityMode_();
      syncResponsibilityContributionMode_();
      if (responsibilityCurrentData_) renderResponsibilityOwnership_(responsibilityCurrentData_);
    });
  });
  if (window.matchMedia) {
    responsibilityContributionLandscape_ = window.matchMedia('(orientation: landscape) and (min-width: 480px)');
    if (responsibilityContributionLandscape_.addEventListener) {
      responsibilityContributionLandscape_.addEventListener('change', syncResponsibilityContributionAccessibility_);
    } else if (responsibilityContributionLandscape_.addListener) {
      responsibilityContributionLandscape_.addListener(syncResponsibilityContributionAccessibility_);
    }
  }
  syncResponsibilityContributionMode_();
  if (batchButton) {
    batchButton.addEventListener('click', function () {
      if (!responsibilityCurrentData_ || isResponsibilityCompactMode_() || responsibilityRankingCategory_) return;
      const selectedGroups = getResponsibilityVisibleGroups_(responsibilityCurrentData_);
      if (selectedGroups.length && window.ResponsibilityShare) {
        window.ResponsibilityShare.openAll(selectedGroups, responsibilityCurrentData_, getResponsibilitySelectedGroup_(), batchButton);
      }
    });
  }

  if (logoutButton) {
    logoutButton.addEventListener('click', function () { logout(); });
  }

  if (homeButton) {
    homeButton.addEventListener('click', function () { location.href = 'home.html'; });
  }

  if (reloadButton) {
    reloadButton.addEventListener('click', function () {
      loadResponsibilityOwnership_(getResponsibilitySelectedMonth_());
    });
  }

  if (monthSelect) {
    monthSelect.addEventListener('change', function () {
      loadResponsibilityOwnership_(getResponsibilitySelectedMonth_());
    });
  }

  if (groups) {
    groups.addEventListener('click', function (event) {
      const exportButton = event.target.closest('[data-responsibility-export]');
      if (exportButton && groups.contains(exportButton)) {
        const model = getResponsibilityChunkModel_(responsibilityCurrentData_);
        const group = model.chunks[Number(exportButton.dataset.responsibilityExport)];
        if (group && window.ResponsibilityShare) {
          window.ResponsibilityShare.open(group, responsibilityCurrentData_, getResponsibilitySelectedGroup_(), exportButton);
        }
        return;
      }
      const button = event.target.closest('[data-responsibility-temple-key]');
      if (!button || !groups.contains(button)) return;
      toggleResponsibilityTemple_(String(button.dataset.responsibilityTempleKey || ''));
    });

    // 原生 button 自動支援 Enter／空白鍵，避免重複觸發。
  }

  if (groupSelect) {
    groupSelect.addEventListener('change', function () {
      if (window.ResponsibilityShare) window.ResponsibilityShare.close();
      responsibilityExpandedTempleKey_ = '';
      responsibilityRankingCategory_ = '';
      syncResponsibilityMode_();

      if (responsibilityCurrentData_) renderResponsibilityOwnership_(responsibilityCurrentData_);
    });
  }
}

async function loadResponsibilityOwnership_(requestedMonth) {
  if (window.ResponsibilityShare) window.ResponsibilityShare.close();
  const serial = ++responsibilityRequestSerial_;
  const month = normalizeResponsibilityMonth_(requestedMonth);
  // 僅保留此頁記憶體中的同月份資料，不將跨壇責任資料寫入瀏覽器儲存空間。
  const cached = responsibilityCurrentData_ &&
    (!month || responsibilityCurrentData_.month === month) ? responsibilityCurrentData_ : null;

  if (cached) {
    responsibilityCurrentData_ = cached;
    responsibilityExpandedTempleKey_ = '';
    syncResponsibilityMonth_(cached);
    renderResponsibilityOwnership_(cached);
    setResponsibilityWarning_('目前先顯示上次成功資料，正在重新確認最新資料…');
  } else {
    // 清除不同月份的記憶體資料，避免讀取期間切換組別重畫舊月份。
    responsibilityCurrentData_ = null;
    responsibilityExpandedTempleKey_ = '';
    setResponsibilityLoading_(true);
    setResponsibilityError_('');
    setResponsibilityWarning_('');
    document.getElementById('responsibilityGroups').innerHTML = '';
  }

  try {
    const payload = { action: 'getResponsibilityOwnership' };
    if (month) payload.month = month;

    const result = await callApi(payload, {
      timeoutMs: 12000,
      retryTimeoutMs: 15000,
      maxAttempts: 3,
      onRetry: function () {
        if (serial === responsibilityRequestSerial_) {
          setResponsibilityWarning_('第一次連線未完成，正在自動重新確認…');
        }
      }
    });

    if (serial !== responsibilityRequestSerial_) return;
    if (!result || !result.success || !Array.isArray(result.groups)) {
      const failure = new Error(result && result.message ? result.message : '責任公壇資料讀取失敗');
      failure.serverRejected = true;
      throw failure;
    }

    responsibilityCurrentData_ = result;
    responsibilityExpandedTempleKey_ = '';
    syncResponsibilityMonth_(result);
    renderResponsibilityOwnership_(result);
    setResponsibilityError_('');
    setResponsibilityWarning_(buildResponsibilityWarning_(result));

  } catch (error) {
    if (serial !== responsibilityRequestSerial_) return;

    if (error && (error.serverRejected || error.code === 'AUTH_REQUIRED')) {
      responsibilityCurrentData_ = null;
      document.getElementById('responsibilityGroups').innerHTML = '';
      setResponsibilityWarning_('');
      setResponsibilityError_(error.message);
    } else if (cached) {
      responsibilityCurrentData_ = cached;
      renderResponsibilityOwnership_(cached);
      setResponsibilityWarning_('連線暫時不穩，目前顯示上次成功資料；稍後可再重新讀取。');
    } else {
      const message = String(error && error.message ? error.message : '系統連線失敗，請稍後再試');
      setResponsibilityError_(
        message === '未知的操作'
          ? '後端尚未啟用責任公壇資料 API，請完成 Apps Script 發布後再試。'
          : message
      );
    }
  } finally {
    if (serial === responsibilityRequestSerial_) {
      setResponsibilityLoading_(false);
    }
  }
}

function renderResponsibilityOwnership_(data) {
  syncResponsibilityMode_();
  syncResponsibilityContributionMode_();
  const area = document.getElementById('responsibilityGroups');
  const subtitle = document.getElementById('responsibilitySubtitle');
  if (!area) return;
  const model = getResponsibilityChunkModel_(data);
  const month = Number(data && data.month || 0);
  if (subtitle) subtitle.textContent = (data && data.year ? data.year + ' 年 ' : '') +
    (month ? month + ' 月資料' : '年度資料') +
    (responsibilityRankingCategory_ ? '｜全區・共' + model.totalTemples + '壇・分母：' + getResponsibilityContributionModeLabel_(responsibilityContributionMode_) : isResponsibilityCompactMode_() ? '' : '｜' + getResponsibilityGroupLabel_(getResponsibilitySelectedGroup_()) + '・' + model.chunks.length + ' 個責任區塊');
  if (!model.chunks.length) {
    area.innerHTML = '<div class="responsibility-message">' + (responsibilityRankingCategory_ ? '目前沒有可排名的佛堂資料。' : '目前沒有可顯示的責任公壇資料。') + '</div>';
    return;
  }
  area.innerHTML = model.chunks.map(function (chunk, index) {
    return chunk.ranking ? buildResponsibilityRankingGroupHtml_(chunk, index, month) : isResponsibilityCompactMode_() ? buildResponsibilityGroupHtml_(chunk, month, index) : buildResponsibilityLegacyGroupHtml_(chunk, month, index);
  }).join('');
}

function getResponsibilityChunkModel_(data) {
  if (responsibilityRankingCategory_) return getResponsibilityRankingModel_(data, responsibilityRankingCategory_, responsibilityContributionMode_);
  // 三大組完整保留責任分區；只有四種五常德選項使用五壇集中版面。
  if (!isResponsibilityCompactMode_()) {
    const groups = getResponsibilityVisibleGroups_(data);
    return { chunks: groups, totalTemples: groups.reduce(function (count, group) { return count + group.temples.length; }, 0) };
  }
  // 畫面與圖片共用篩選後的來源順序；僅建立新陣列，不改動後端資料。
  const temples = getResponsibilityVisibleGroups_(data).reduce(function (all, group) {
    return all.concat(group.temples);
  }, []);
  const totalTemples = temples.length;
  const chunks = [];
  for (let start = 0; start < totalTemples; start += 5) {
    chunks.push({
      temples: temples.slice(start, start + 5),
      caption: start === 0 ? '依  ' + getResponsibilityGroupLabel_(getResponsibilitySelectedGroup_()) + '｜共' + totalTemples + '壇' : '',
      index: chunks.length,
      start: start + 1,
      end: Math.min(start + 5, totalTemples),
      totalTemples: totalTemples
    });
  }
  return { chunks: chunks, totalTemples: totalTemples };
}

function getResponsibilitySelectedGroup_() {
  const select = document.getElementById('responsibilityGroupSelect');
  return select && /^(?:[123]|virtue-[義禮智信])$/.test(select.value) ? select.value : '1';
}

function isResponsibilityCompactMode_() {
  return /^virtue-[義禮智信]$/.test(getResponsibilitySelectedGroup_());
}

function syncResponsibilityMode_() {
  const compact = isResponsibilityCompactMode_();
  const ranking = Boolean(responsibilityRankingCategory_);
  if (document.body) {
    document.body.classList.toggle('responsibility-compact-mode', compact && !ranking);
    document.body.classList.toggle('responsibility-ranking-mode', ranking);
    document.body.classList.toggle('responsibility-ranking-qiu', responsibilityRankingCategory_ === '求道');
    document.body.classList.toggle('responsibility-ranking-fahui', responsibilityRankingCategory_ === '法會');
  }
  const heading = document.getElementById('responsibilityLegacyTitle');
  const hint = document.getElementById('responsibilityShareHint');
  if (heading) heading.hidden = compact || ranking;
  if (hint) hint.textContent = '分享選單可選 LINE；找不到 LINE 時，請下載後自行傳送。' + (compact || ranking ? '' : '圖片含責任歸屬資料，請確認接收對象。');
  document.title = ranking ? responsibilityRankingCategory_ + '貢獻度排名｜新莊區道務檢視' : compact ? '責任公壇檢視｜新莊區道務檢視' : '責任點傳師 忠字班道務歸屬｜新莊區道務檢視';
  syncResponsibilityBatchButton_();
}

function syncResponsibilityBatchButton_() {
  const button = document.getElementById('responsibilityBatchExportBtn');
  if (!button) return;
  const compact = isResponsibilityCompactMode_();
  button.hidden = compact || Boolean(responsibilityRankingCategory_);
  const label = getResponsibilityGroupLabel_(getResponsibilitySelectedGroup_());
  button.textContent = label + '圖片';
  button.setAttribute('aria-label', '產生' + label + '全部分享圖片');
  button.disabled = compact || Boolean(responsibilityRankingCategory_) || !responsibilityCurrentData_ || !getResponsibilityVisibleGroups_(responsibilityCurrentData_).length;
}

function getResponsibilityGroupLabel_(value) {
  return ({
    '1': '第一組', '2': '第二組', '3': '第三組',
    'virtue-義': '義字壇', 'virtue-禮': '禮字壇',
    'virtue-智': '智字壇', 'virtue-信': '信字壇'
  })[value] || '第一組';
}

function getResponsibilityVisibleGroups_(data) {
  const selected = getResponsibilitySelectedGroup_();
  const virtue = selected.indexOf('virtue-') === 0 ? selected.slice(7) : '';
  return (Array.isArray(data && data.groups) ? data.groups : []).map(function (group) {
    const temples = (Array.isArray(group.temples) ? group.temples : []).filter(function (temple) {
      // 五常德選項依既有欄位跨組篩選，保留責任歸屬與來源順序。
      if (virtue) return String(temple.virtue || '').trim() === virtue;
      // 只依正式名稱的數字組別篩選，不猜測姓名或別名，也不修改後端資料。
      const match = /^([123])[A-Z]_/.exec(String(temple.formalTempleName || '').trim());
      return match && match[1] === selected;
    });
    return Object.assign({}, group, { temples: temples });
  }).filter(function (group) { return group.temples.length > 0; });
}

function buildResponsibilityGroupHtml_(group, month, index) {
  const temples = Array.isArray(group && group.temples) ? group.temples : [];
  return (
    '<section class="responsibility-group">' +
      (group.caption ? '<div class="responsibility-classification">' + escapeResponsibilityHtml_(group.caption) + '</div>' : '') +
      (responsibilityContributionMode_ === 'combined' ? '<div class="responsibility-report-scroll"><div class="responsibility-report-table">' : '') +
      buildResponsibilityTableHeadHtml_(month) +
      temples.map(function (temple) { return buildResponsibilityTempleHtml_(temple, month); }).join('') +
      (responsibilityContributionMode_ === 'combined' ? '</div></div>' : '') +
      '<div class="responsibility-group-actions"><button type="button" data-responsibility-export="' + index +
        '" aria-label="分享第 ' + group.start + ' 至 ' + group.end + ' 壇的圖片">圖片分享</button></div>' +
    '</section>'
  );
}

function buildResponsibilityLegacyGroupHtml_(group, month, index) {
  const temples = Array.isArray(group && group.temples) ? group.temples : [];
  return (
    '<section class="responsibility-group">' +
      '<div class="responsibility-group-head">' +
        '<span>責任點傳師：' + escapeResponsibilityHtml_(group.responsibleTransmitter || '—') + '</span>' +
        '<span>責任忠字班：' + escapeResponsibilityHtml_(group.responsibleZhongZiClass || '—') + '</span>' +
      '</div>' +
      '<div class="responsibility-group-gap" aria-hidden="true"></div>' +
      (responsibilityContributionMode_ === 'combined' ? '<div class="responsibility-report-scroll"><div class="responsibility-report-table">' : '') +
      buildResponsibilityTableHeadHtml_(month) +
      temples.map(function (temple) { return buildResponsibilityTempleHtml_(temple, month); }).join('') +
      (responsibilityContributionMode_ === 'combined' ? '</div></div>' : '') +
      '<div class="responsibility-group-actions"><button type="button" data-responsibility-export="' + index +
        '" aria-label="產生' + escapeResponsibilityAttribute_(group.responsibleZhongZiClass || '此責任區塊') +
        '的分享圖片">圖片分享／下載</button></div>' +
    '</section>'
  );
}

function buildResponsibilityTableHeadHtml_(month) {
  return (
    '<div class="responsibility-table-head">' +
      '<span>佛堂</span><span>類別</span><span>去年<br>實績</span><span>年度<br>目標</span>' +
      '<span>' + escapeResponsibilityHtml_(month ? month + '月' : '本月') + '</span><span>本年<br>累計</span><span>' + getResponsibilityRateLabel_(month) + '</span>' +
      '<span class="responsibility-staff-header responsibility-virtue-header">五常德</span><span class="responsibility-staff-header">講師</span>' +
      (responsibilityContributionMode_ === 'combined' ? '<span class="responsibility-staff-header">貢獻度</span>' : '') +
      '<span class="responsibility-staff-header">在職<br>壇主</span><span class="responsibility-staff-header">在職<br>副壇主</span>' +
      (responsibilityContributionMode_ === 'combined' ? '<span class="responsibility-staff-header">合計</span>' : '') +
    '</div>'
  );
}

function buildResponsibilityTempleHtml_(temple, month, rankingEntry) {
  const key = String(temple && temple.templeKey || '');
  const expanded = key && key === responsibilityExpandedTempleKey_;
  const metrics = Array.isArray(temple && temple.metrics) ? temple.metrics : [];
  const qiu = metrics[0] || {};
  const fahui = metrics[1] || {};
  const templeName = escapeResponsibilityHtml_(temple && temple.formalTempleName || '—');
  const contribution = getResponsibilityContribution_(temple, responsibilityContributionMode_);
  const rankLabel = rankingEntry ? (rankingEntry.rank === null ? '貢獻度尚待確認；' : '第' + rankingEntry.rank + '名；') : '';
  const baseLabel = rankLabel + '展開 ' + String(temple && temple.formalTempleName || '—') + (rankingEntry ? ' 的人數資料；五常德 ' : ' 的責任資料；五常德 ') + String(temple && temple.virtue || '—') +
    '；講師 ' + formatResponsibilityStaffCount_(temple, 'lecturers') + ' 人，在職壇主 ' + formatResponsibilityStaffCount_(temple, 'activeAltarMasters') +
    ' 人，在職副壇主 ' + formatResponsibilityStaffCount_(temple, 'activeViceAltarMasters') + ' 人';
  const contributionLabel = contribution ? '；' + contribution.label + '合計 ' + formatResponsibilityNumber_(contribution.denominator) + ' 人；貢獻度：求道 ' + contribution.qiu + '，法會 ' + contribution.fahui : '';
  const ariaLabel = baseLabel + (responsibilityContributionLandscape_ && responsibilityContributionLandscape_.matches ? contributionLabel : '');

  return (
    '<article class="responsibility-temple' + (rankingEntry ? ' responsibility-ranking-temple' : '') + (expanded ? ' is-expanded' : '') + '">' +
      '<button class="responsibility-temple-toggle" type="button" data-responsibility-temple-key="' +
        escapeResponsibilityAttribute_(key) + '" aria-expanded="' + (expanded ? 'true' : 'false') +
        '" data-responsibility-base-label="' + escapeResponsibilityAttribute_(baseLabel) +
        '" data-responsibility-contribution-label="' + escapeResponsibilityAttribute_(contributionLabel) +
        '" aria-label="' + escapeResponsibilityAttribute_(ariaLabel) + '">' +
        '<span class="responsibility-temple-name">' + (rankingEntry ? '<small class="responsibility-ranking-badge" aria-hidden="true">' + (rankingEntry.rank === null ? '—' : rankingEntry.rank) + '</small>' : '') + '<span>' + templeName + '</span><b class="responsibility-chevron" aria-hidden="true">⌄</b></span>' +
        buildResponsibilityMetricRowHtml_(qiu, month) +
        buildResponsibilityMetricRowHtml_(fahui, month) +
        '<span class="responsibility-staff-count responsibility-staff-virtue">' + escapeResponsibilityHtml_(temple && temple.virtue || '—') + '</span>' +
        buildResponsibilityStaffCountHtml_('lecturers', getResponsibilityStaffDisplayValue_(temple, 'lecturers'), null) +
        (contribution ? '<span class="responsibility-contribution-values responsibility-staff-contribution" aria-hidden="true"><span class="responsibility-contribution-qiu">' +
          escapeResponsibilityHtml_(contribution.qiu) + '</span><span class="responsibility-contribution-fahui">' + escapeResponsibilityHtml_(contribution.fahui) + '</span></span>' : '') +
        buildResponsibilityStaffCountHtml_('masters', getResponsibilityStaffDisplayValue_(temple, 'activeAltarMasters'), null) +
        '<span class="responsibility-staff-count responsibility-staff-vice-masters">' + formatResponsibilityStaffCount_(temple, 'activeViceAltarMasters') + '</span>' +
        (contribution ? '<span class="responsibility-staff-count responsibility-staff-total">' + formatResponsibilityNumber_(contribution.denominator) + '</span>' : '') +
      '</button>' +
      (expanded ? buildResponsibilityDetailHtml_(temple) : '') +
    '</article>'
  );
}

function syncResponsibilityContributionMode_() {
  document.querySelectorAll('[data-responsibility-ranking-category]').forEach(function (button) {
    const selected = button.dataset.responsibilityRankingCategory === responsibilityRankingCategory_;
    button.setAttribute('aria-pressed', String(selected));
    button.classList.toggle('is-active', selected);
  });
  if (document.body) {
    document.body.classList.toggle('responsibility-contribution-on', Boolean(responsibilityContributionMode_));
    document.body.classList.toggle('responsibility-contribution-combined', responsibilityContributionMode_ === 'combined');
  }
  document.querySelectorAll('[data-responsibility-contribution-mode]').forEach(function (button) {
    const selected = button.dataset.responsibilityContributionMode === responsibilityContributionMode_;
    button.setAttribute('aria-pressed', String(selected));
    button.classList.toggle('is-active', selected);
  });
}

function syncResponsibilityContributionAccessibility_() {
  const visible = responsibilityContributionLandscape_ && responsibilityContributionLandscape_.matches;
  document.querySelectorAll('[data-responsibility-base-label]').forEach(function (button) {
    button.setAttribute('aria-label', button.dataset.responsibilityBaseLabel + (visible ? button.dataset.responsibilityContributionLabel : ''));
  });
}

function getResponsibilityContributionNumber_(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !/^\d+(?:\.\d+)?$/.test(value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function getResponsibilityContributionModeLabel_(mode) {
  return mode === 'combined' ? '在職壇主＋在職副壇主' : '';
}

function getResponsibilityContributionValues_(temple, mode, category) {
  const masters = getResponsibilityContributionNumber_(temple && temple.activeAltarMasters);
  const viceMasters = getResponsibilityContributionNumber_(temple && temple.activeViceAltarMasters);
  const denominator = mode === 'combined' && masters !== null && viceMasters !== null ? masters + viceMasters : null;
  const metrics = Array.isArray(temple && temple.metrics) ? temple.metrics : [];
  const matched = metrics.filter(function (metric) { return metric && String(metric.category || '').trim() === category; });
  const numerator = matched.length === 1 ? getResponsibilityContributionNumber_(matched[0].cumulative) : null;
  const rawScore = numerator === null || denominator === null || denominator <= 0 ? null : numerator / denominator;
  return { numerator: numerator, denominator: denominator, rawScore: Number.isFinite(rawScore) ? rawScore : null };
}

function formatResponsibilityContributionScore_(value) {
  return value === null || !Number.isFinite(value) ? '—' : value.toLocaleString('zh-TW', { useGrouping: false, maximumFractionDigits: 2 });
}

function getResponsibilityContribution_(temple, mode) {
  if (mode !== 'combined') return null;
  return {
    label: getResponsibilityContributionModeLabel_(mode),
    denominator: getResponsibilityContributionValues_(temple, mode, '求道').denominator,
    qiu: formatResponsibilityContributionScore_(getResponsibilityContributionValues_(temple, mode, '求道').rawScore),
    fahui: formatResponsibilityContributionScore_(getResponsibilityContributionValues_(temple, mode, '法會').rawScore)
  };
}

function getResponsibilityRankingModel_(data, category, mode) {
  if ((category !== '求道' && category !== '法會') || mode !== 'combined') return { chunks: [], totalTemples: 0 };
  const seen = new Set();
  const entries = [];
  (Array.isArray(data && data.groups) ? data.groups : []).forEach(function (group) {
    (Array.isArray(group && group.temples) ? group.temples : []).forEach(function (temple) {
      if (!temple) return;
      // 只去除相同正式鍵，不以名稱、別名或責任姓名推測合併。
      const key = String(temple.templeKey || '');
      if (key && seen.has(key)) return;
      if (key) seen.add(key);
      const values = getResponsibilityContributionValues_(temple, mode, category);
      entries.push({
        temple: temple, numerator: values.numerator, denominator: values.denominator,
        rawScore: values.rawScore, displayScore: formatResponsibilityContributionScore_(values.rawScore),
        rank: null, sourceIndex: entries.length
      });
    });
  });
  entries.sort(function (left, right) {
    if (left.rawScore === null) return right.rawScore === null ? left.sourceIndex - right.sourceIndex : 1;
    if (right.rawScore === null) return -1;
    return right.rawScore - left.rawScore || left.sourceIndex - right.sourceIndex;
  });
  entries.forEach(function (entry, index) {
    if (entry.rawScore !== null) entry.rank = index > 0 && entries[index - 1].rawScore === entry.rawScore ? entries[index - 1].rank : index + 1;
  });
  const totalTemples = entries.length;
  const chunks = [];
  for (let start = 0; start < totalTemples; start += 10) {
    const part = entries.slice(start, start + 10);
    chunks.push({
      ranking: true, category: category, contributionMode: mode,
      denominatorLabel: getResponsibilityContributionModeLabel_(mode),
      caption: start === 0 ? '全區' + category + '貢獻度排名｜共' + totalTemples + '壇' : '',
      entries: part, temples: part.map(function (entry) { return entry.temple; }),
      index: chunks.length, start: start + 1, end: Math.min(start + 10, totalTemples), totalTemples: totalTemples
    });
  }
  return { chunks: chunks, totalTemples: totalTemples };
}

function buildResponsibilityRankingGroupHtml_(chunk, index, month) {
  return '<section class="responsibility-group responsibility-ranking-group">' +
    (chunk.caption ? '<div class="responsibility-ranking-caption">' + escapeResponsibilityHtml_(chunk.caption) + '</div>' : '') +
    '<div class="responsibility-ranking-scroll" role="region" tabindex="0" aria-label="' + escapeResponsibilityAttribute_(chunk.category + '貢獻度，第' + chunk.start + '至' + chunk.end + '壇；分母：' + chunk.denominatorLabel) + '">' +
      '<div class="responsibility-ranking-table">' +
        buildResponsibilityTableHeadHtml_(month) +
        chunk.entries.map(function (entry) { return buildResponsibilityTempleHtml_(entry.temple, month, entry); }).join('') +
      '</div>' +
    '</div>' +
    '<div class="responsibility-group-actions"><button type="button" data-responsibility-export="' + index +
      '" aria-label="分享' + escapeResponsibilityAttribute_(chunk.category) + '貢獻度第' + chunk.start + '至' + chunk.end + '壇圖片">圖片分享</button></div>' +
  '</section>';
}

function buildResponsibilityStaffCountHtml_(kind, value) {
  return '<span class="responsibility-staff-count responsibility-staff-' + kind + '">' +
    '<span class="responsibility-staff-number">' + formatResponsibilityStaffValue_(value) + '</span></span>';
}

function buildResponsibilityMetricRowHtml_(metric, month) {
  const tone = getResponsibilityTone_(metric && metric.ratePercent, month);
  return (
    '<div class="responsibility-metric-row' + (responsibilityRankingCategory_ && String(metric && metric.category || '').trim() !== responsibilityRankingCategory_ ? ' is-ranking-muted' : '') + '">' +
      '<span class="temple" aria-hidden="true"></span>' +
      '<span class="category">' + escapeResponsibilityHtml_(metric && metric.category || '—') + '</span>' +
      '<span class="number">' + formatResponsibilityNumber_(metric && metric.previousActual) + '</span>' +
      '<span class="number">' + formatResponsibilityNumber_(metric && metric.annualTarget) + '</span>' +
      '<span class="number">' + formatResponsibilityMonthValue_(metric && metric.monthValue) + '</span>' +
      '<span class="number">' + formatResponsibilityNumber_(metric && metric.cumulative) + '</span>' +
      '<span class="responsibility-rate ' + tone + '"><strong>' +
        formatResponsibilityNumber_(metric && metric.ratePercent) + (metric.ratePercent == null ? '' : '%') + '</strong>' +
        buildResponsibilitySegmentTrackHtml_(metric && metric.ratePercent, tone) +
      '</span>' +
    '</div>'
  );
}

function buildResponsibilityDetailHtml_(temple) {
  return (
    '<div class="responsibility-detail">' +
      '<span>五常德：<b>' + escapeResponsibilityHtml_(temple && temple.virtue || '—') + '</b></span>' +
      '<span>講師：<b>' + formatResponsibilityStaffCount_(temple, 'lecturers') + '</b></span>' +
      '<span>在職壇主：<b>' + formatResponsibilityStaffCount_(temple, 'activeAltarMasters') + '</b></span>' +
      '<span>在職副壇主：<b>' + formatResponsibilityStaffCount_(temple, 'activeViceAltarMasters') + '</b></span>' +
    '</div>'
  );
}

function toggleResponsibilityTemple_(templeKey) {
  if (!templeKey || !responsibilityCurrentData_) return;
  responsibilityExpandedTempleKey_ = responsibilityExpandedTempleKey_ === templeKey ? '' : templeKey;
  renderResponsibilityOwnership_(responsibilityCurrentData_);
  const buttons = document.querySelectorAll('[data-responsibility-temple-key]');
  Array.from(buttons).find(function (button) {
    if (button.dataset.responsibilityTempleKey !== templeKey) return false;
    button.focus({ preventScroll: true });
    return true;
  });
}

function getResponsibilityTargetPercent_(month) {
  const selectedMonth = normalizeResponsibilityMonth_(month);
  return selectedMonth ? Math.round(selectedMonth / 12 * 100) : null;
}

function getResponsibilityRateLabel_(month) {
  const target = getResponsibilityTargetPercent_(month);
  return '達成率' + (target === null ? '' : '（' + target + '%）');
}

function getResponsibilityTone_(ratePercent, month) {
  const rate = Number(ratePercent);
  const target = getResponsibilityTargetPercent_(month);
  if (target === null || ratePercent == null || !Number.isFinite(rate)) return 'red';
  // 依資料所屬月份判色：8 月 67%、9 月 75%；差距剛好 10 個百分點仍為黃色。
  if (rate >= target) return 'green';
  if (target - rate <= 10) return 'yellow';
  return 'red';
}

function getResponsibilityProgressSegments_(ratePercent) {
  const rate = Number(ratePercent);
  if (!Number.isFinite(rate) || rate <= 0) return 0;
  return Math.min(10, Math.ceil(rate / 10));
}

function buildResponsibilitySegmentTrackHtml_(ratePercent, tone) {
  const activeCount = getResponsibilityProgressSegments_(ratePercent);
  let segments = '';
  for (let index = 1; index <= 10; index += 1) {
    segments += '<b' + (index <= activeCount ? ' class="active"' : '') + '></b>';
  }
  return '<span class="responsibility-segments ' + tone + '" aria-hidden="true">' + segments + '</span>';
}

function buildResponsibilityWarning_(data) {
  const unmatched = Array.isArray(data && data.unmatchedTemples) ? data.unmatchedTemples : [];
  if (!unmatched.length) return '';
  return '有 ' + unmatched.length + ' 間佛堂尚待核對今年月報資料；未取得的數字以「—」顯示。';
}

function setResponsibilityLoading_(loading) {
  syncResponsibilityMode_();

  const area = document.getElementById('responsibilityLoading');
  if (!area) return;
  area.hidden = !loading;
}

function setResponsibilityError_(message) {
  const area = document.getElementById('responsibilityError');
  if (!area) return;
  area.textContent = message || '';
  area.hidden = !message;
}

function setResponsibilityWarning_(message) {
  const area = document.getElementById('responsibilityWarning');
  if (!area) return;
  area.textContent = message || '';
  area.hidden = !message;
}

function getResponsibilitySelectedMonth_() {
  const select = document.getElementById('responsibilityMonthSelect');
  return normalizeResponsibilityMonth_(select && select.value);
}

function syncResponsibilityMonth_(data) {
  const select = document.getElementById('responsibilityMonthSelect');
  if (!select) return;
  const sourceMonth = normalizeResponsibilityMonth_(data && (data.sourceMonth || data.month)) || 1;
  const selectedMonth = normalizeResponsibilityMonth_(data && data.month) || sourceMonth;
  Array.from(select.options).forEach(function (option) {
    option.disabled = Number(option.value) > sourceMonth;
  });
  select.value = String(selectedMonth);
}

function normalizeResponsibilityMonth_(value) {
  const month = Number(value || 0);
  return Number.isInteger(month) && month >= 1 && month <= 12 ? month : 0;
}

function formatResponsibilityMonthValue_(value) {
  // 只隱藏已知零值；未知值仍顯示「—」，其他數值欄位維持原規則。
  if (value !== null && value !== undefined && Number(value) === 0) return '';
  return formatResponsibilityNumber_(value);
}

function getResponsibilityStaffDisplayValue_(temple, key) {
  const raw = temple && temple.staffCountsRaw && temple.staffCountsRaw[key];
  if (raw === '-' || raw === '－' || raw === '—') return raw;
  if (typeof raw === 'number' && Number.isSafeInteger(raw) && raw >= 0) return raw;
  if (typeof raw === 'string' && /^\d+$/.test(raw.trim()) && Number.isSafeInteger(Number(raw))) return Number(raw);
  return temple && temple[key];
}

function formatResponsibilityStaffValue_(value) {
  return value === '-' || value === '－' || value === '—' ? value : formatResponsibilityNumber_(value);
}

function formatResponsibilityStaffCount_(temple, key) {
  return formatResponsibilityStaffValue_(getResponsibilityStaffDisplayValue_(temple, key));
}

function formatResponsibilityNumber_(value) {
  if (value === null || value === undefined) return '—';
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.round(number).toLocaleString('zh-TW') : '0';
}

function escapeResponsibilityHtml_(value) {
  return String(value === undefined || value === null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeResponsibilityAttribute_(value) {
  return escapeResponsibilityHtml_(value).replace(/`/g, '&#096;');
}
