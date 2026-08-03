/* =========================
Program: duty-activity-admin-r19.js
Version: 2026-08-03 R19
Purpose:
1. Add and order the people modes:
   Manual, Receive Statistics, Receive Statistics + Temple,
   Seminar Statistics, Seminar Statistics + Temple.
2. Keep status and note on one row through the R19 HTML layout.
3. Compress each activity card:
   title + date on the first row;
   mode + count + location + planning on the second row.
4. Preserve all existing save, edit, status and permission behavior.
========================= */

(function () {
  'use strict';

  const R19_PEOPLE_MODES = [
    '手動',
    '求道統計',
    '求道統計+壇名',
    '法會統計',
    '法會統計+壇名'
  ];

  injectDutyActivityR19Style_();

  window.ensureDutyActivityPeopleModeOptions_ = function () {
    const select = document.getElementById('peopleMode');

    if (!select) return;

    const currentValue = normalizeR19Text_(select.value);
    const html = [];

    for (let i = 0; i < R19_PEOPLE_MODES.length; i++) {
      const mode = R19_PEOPLE_MODES[i];
      html.push(
        '<option value="' + escapeR19Html_(mode) + '">' +
        escapeR19Html_(mode) +
        '</option>'
      );
    }

    select.innerHTML = html.join('');

    if (R19_PEOPLE_MODES.indexOf(currentValue) >= 0) {
      select.value = currentValue;
    } else {
      select.value = '手動';
    }
  };

  window.createDutyActivityCardHtml_ = function (item) {
    item = item || {};

    const id = escapeR19Html_(item.id || '');
    const title = escapeR19Html_(item.activityName || '');
    const dateRange = escapeR19Html_(formatR19DateRange_(item.dateStart, item.dateEnd));
    const peopleModeRaw = normalizeR19Text_(item.peopleMode || '');
    const peopleMode = escapeR19Html_(peopleModeRaw || '—');
    const peopleCountRaw = normalizeR19Text_(item.peopleCount);
    const peopleCountDisplay = escapeR19Html_(
      peopleCountRaw || (peopleModeRaw === '手動' ? '—' : '由系統計算')
    );
    const location = escapeR19Html_(item.location || '—');
    const planning = escapeR19Html_(item.planning || '—');
    const status = escapeR19Html_(item.status || '啟用');
    const updatedAt = escapeR19Html_(item.updatedAt || '—');
    const updatedBy = escapeR19Html_(item.updatedBy || '—');
    const statusClass = status === '啟用' ? 'enabled' : 'disabled';
    const toggleText = status === '啟用' ? '停用' : '啟用';
    const nextStatus = status === '啟用' ? '停用' : '啟用';

    return '' +
      '<div class="duty-activity-item duty-activity-item-r19" data-id="' + id + '">' +
        '<div class="duty-item-head duty-item-head-r19">' +
          '<div class="duty-item-main-r19">' +
            '<div class="duty-item-title-line-r19">' +
              '<span class="duty-item-title">' + title + '</span>' +
              '<span class="duty-item-date-inline-r19">' + dateRange + '</span>' +
            '</div>' +
          '</div>' +
          '<div class="duty-item-id">#' + id + '</div>' +
        '</div>' +

        '<div class="duty-item-meta duty-item-meta-r19" aria-label="活動摘要">' +
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
  };

  document.addEventListener('DOMContentLoaded', function () {
    window.ensureDutyActivityPeopleModeOptions_();
  });

  function injectDutyActivityR19Style_() {
    if (document.getElementById('dutyActivityR19Style')) return;

    const style = document.createElement('style');
    style.id = 'dutyActivityR19Style';
    style.textContent = `
      .duty-activity-item-r19 .duty-item-head-r19 {
        align-items: flex-start;
      }

      .duty-activity-item-r19 .duty-item-main-r19 {
        min-width: 0;
        flex: 1 1 auto;
      }

      .duty-item-title-line-r19 {
        display: flex;
        align-items: baseline;
        flex-wrap: nowrap;
        gap: 8px;
        min-width: 0;
        overflow: hidden;
      }

      .duty-item-title-line-r19 .duty-item-title {
        flex: 0 0 auto;
        white-space: nowrap;
      }

      .duty-item-date-inline-r19 {
        min-width: 0;
        overflow: hidden;
        color: #71839a;
        font-size: 14px;
        font-weight: 500;
        line-height: 1.35;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .duty-item-meta-r19 {
        display: flex !important;
        align-items: center;
        flex-wrap: nowrap !important;
        gap: 10px;
        overflow-x: auto;
        padding-bottom: 2px;
        font-size: 13px;
        line-height: 1.45;
        white-space: nowrap;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
      }

      .duty-item-meta-r19::-webkit-scrollbar {
        display: none;
      }

      .duty-item-meta-r19 > span {
        flex: 0 0 auto;
      }

      @media (max-width: 520px) {
        .duty-item-title-line-r19 {
          gap: 6px;
          padding-right: 2px;
        }

        .duty-item-title-line-r19 .duty-item-title {
          font-size: 17px;
        }

        .duty-item-date-inline-r19 {
          font-size: 12px;
        }

        .duty-item-meta-r19 {
          gap: 7px;
          font-size: 12px;
          letter-spacing: -0.15px;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function formatR19DateRange_(startValue, endValue) {
    const start = formatR19Date_(startValue);
    const end = formatR19Date_(endValue);

    if (!start) return end;
    if (!end || start === end) return start;

    return start + '～' + end;
  }

  function formatR19Date_(value) {
    const text = normalizeR19Text_(value);

    if (!text) return '';

    const match = text.match(/(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);

    if (!match) return text;

    return match[1] + '/' + padR19_(match[2]) + '/' + padR19_(match[3]);
  }

  function padR19_(value) {
    const text = String(value || '');
    return text.length < 2 ? '0' + text : text;
  }

  function normalizeR19Text_(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/\u3000/g, ' ')
      .trim();
  }

  function escapeR19Html_(value) {
    return normalizeR19Text_(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
})();
