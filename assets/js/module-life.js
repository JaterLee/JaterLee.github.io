/**
 * module-life.js
 * 生活小记 Module — 日历主页 + 图文混编详情
 * 通过 JaterMod 注册，首次激活时懒加载。
 *
 * 依赖：core.js (Jater), module-registry.js (JaterMod)
 */
(function () {
  'use strict';

  var $ = window.Jater.$;
  var escapeHtml = window.Jater.escapeHtml;
  var formatDate = window.Jater.formatDate;

  /* ==========================================================
     State
     ========================================================== */
  var STATE = {
    entries: [],          // [{ id, title, date, body, images? }]
    entriesByDate: {},    // { '2026-07-24': entry }
    loaded: false,
    currentYear: 0,
    currentMonth: 0,     // 1-12
    selectedDate: null,  // '2026-07-24'
  };

  /* ==========================================================
     DOM Refs
     ========================================================== */
  var dom = {};

  /* ==========================================================
     Lightweight Markdown Renderer (supports images)
     ========================================================== */
  function renderMarkdown(md) {
    if (!md) return '';

    var html = md
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    html = html.replace(/\r\n/g, '\n');
    var lines = html.split('\n');
    var blocks = [];
    var i = 0;

    while (i < lines.length) {
      var line = lines[i];
      if (line.trim() === '') { i++; continue; }

      // Heading
      var hMatch = line.match(/^(#{1,4})\s+(.+)$/);
      if (hMatch) {
        var level = hMatch[1].length + 1;
        var tag = 'h' + Math.min(level, 5);
        blocks.push('<' + tag + '>' + applyInline(line.slice(hMatch[0].indexOf(hMatch[2]))) + '</' + tag + '>');
        i++; continue;
      }

      // Image on its own line (block-level image)
      var imgMatch = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
      if (imgMatch) {
        blocks.push('<div class="life-img-block"><img src="' + escapeAttr(imgMatch[2]) + '" alt="' + escapeAttr(imgMatch[1]) + '" loading="lazy"></div>');
        i++; continue;
      }

      // Blockquote
      if (line.match(/^>\s/)) {
        var quoteLines = [];
        while (i < lines.length && lines[i].match(/^>\s/)) {
          quoteLines.push(lines[i].replace(/^>\s?/, ''));
          i++;
        }
        var quoteBody = quoteLines.join('\n').split('\n').map(function (ql) { return applyInline(ql); }).join('<br>');
        blocks.push('<blockquote><p>' + quoteBody + '</p></blockquote>');
        continue;
      }

      // Unordered list
      if (line.match(/^[-*]\s/)) {
        var listItems = [];
        while (i < lines.length && lines[i].match(/^[-*]\s/)) {
          listItems.push('<li>' + applyInline(lines[i].replace(/^[-*]\s/, '')) + '</li>');
          i++;
        }
        blocks.push('<ul>' + listItems.join('') + '</ul>');
        continue;
      }

      // Ordered list
      if (line.match(/^\d+\.\s/)) {
        var olItems = [];
        while (i < lines.length && lines[i].match(/^\d+\.\s/)) {
          olItems.push('<li>' + applyInline(lines[i].replace(/^\d+\.\s/, '')) + '</li>');
          i++;
        }
        blocks.push('<ol>' + olItems.join('') + '</ol>');
        continue;
      }

      // Paragraph
      var paraLines = [];
      while (i < lines.length && lines[i].trim() !== '' &&
             !lines[i].match(/^(#{1,4}\s|!\[.*\]\(.*\)$|>\s|[-*]\s|\d+\.\s)/)) {
        paraLines.push(lines[i]);
        i++;
      }
      if (paraLines.length > 0) {
        blocks.push('<p>' + paraLines.map(function (pl) { return applyInline(pl); }).join('<br>') + '</p>');
      }
    }

    return '<div class="life-md-body">\n' + blocks.join('\n') + '\n</div>';
  }

  function applyInline(text) {
    // Images first (before link handling)
    text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" loading="lazy" class="life-inline-img">');
    return text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  }

  function escapeAttr(s) {
    return (s || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* ==========================================================
     Data Loading
     ========================================================== */
  async function loadEntries() {
    if (dom.loading) dom.loading.classList.remove('hidden');
    if (dom.calendar) dom.calendar.style.display = 'none';
    if (dom.empty) dom.empty.classList.add('hidden');

    try {
      var resp = await fetch('data/life-notes.json');
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      var data = await resp.json();
      STATE.entries = data.notes || [];
    } catch (err) {
      console.warn('Life module: failed to load life-notes.json', err.message);
      STATE.entries = [];
    }

    // Build date index
    STATE.entriesByDate = {};
    STATE.entries.forEach(function (e) {
      if (e.date) STATE.entriesByDate[e.date] = e;
    });

    if (dom.loading) dom.loading.classList.add('hidden');

    if (!STATE.entries.length) {
      if (dom.empty) dom.empty.classList.remove('hidden');
      if (dom.calendar) dom.calendar.style.display = 'none';
      return;
    }

    // Determine initial month from latest entry
    var dates = STATE.entries.map(function (e) { return e.date; }).filter(Boolean).sort();
    var latest = dates[dates.length - 1];
    if (latest) {
      var parts = latest.split('-');
      STATE.currentYear = parseInt(parts[0], 10);
      STATE.currentMonth = parseInt(parts[1], 10);
    } else {
      var now = new Date();
      STATE.currentYear = now.getFullYear();
      STATE.currentMonth = now.getMonth() + 1;
    }

    if (dom.calendar) dom.calendar.style.display = '';
    renderCalendar();
    updateStats();
  }

  /* ==========================================================
     Stats
     ========================================================== */
  function updateStats() {
    var elTotal = $('#stat-life-notes');
    var elRange = $('#stat-life-range');
    if (elTotal) elTotal.textContent = STATE.entries.length + ' 篇';
    if (elRange) {
      if (STATE.entries.length) {
        var dates = STATE.entries.map(function (e) { return e.date; }).filter(Boolean).sort();
        if (dates.length) {
          var first = formatDate(dates[0]);
          var last = formatDate(dates[dates.length - 1]);
          elRange.textContent = first === last ? first : first + ' — ' + last;
        } else {
          elRange.textContent = '--';
        }
      } else {
        elRange.textContent = '--';
      }
    }
  }

  /* ==========================================================
     Calendar Engine
     ========================================================== */

  var WEEKDAY_CN = ['日', '一', '二', '三', '四', '五', '六'];

  function daysInMonth(year, month) {
    return new Date(year, month, 0).getDate();
  }

  function firstDayOfMonth(year, month) {
    // 0=Sun, 1=Mon, ..., 6=Sat
    return new Date(year, month - 1, 1).getDay();
  }

  function formatYYYYMM(year, month) {
    return year + '-' + String(month).padStart(2, '0');
  }

  function padDay(d) {
    return String(d).padStart(2, '0');
  }

  function renderCalendar() {
    if (!dom.calendarGrid) return;

    var y = STATE.currentYear;
    var m = STATE.currentMonth;
    var ymKey = formatYYYYMM(y, m);

    // Update header
    if (dom.monthTitle) {
      dom.monthTitle.textContent = y + ' 年 ' + m + ' 月';
    }

    var totalDays = daysInMonth(y, m);
    var startDow = firstDayOfMonth(y, m); // 0=Sun

    var cells = '';

    // Weekday headers
    WEEKDAY_CN.forEach(function (wd) {
      cells += '<div class="life-cal-wd">' + wd + '</div>';
    });

    // Empty cells before first day
    for (var e = 0; e < startDow; e++) {
      cells += '<div class="life-cal-cell life-cal-empty"></div>';
    }

    // Day cells
    for (var d = 1; d <= totalDays; d++) {
      var dateStr = ymKey + '-' + padDay(d);
      var entry = STATE.entriesByDate[dateStr];
      var hasContent = !!entry;
      var classes = 'life-cal-cell';
      if (hasContent) classes += ' life-cal-has-content';
      if (dateStr === STATE.selectedDate) classes += ' life-cal-selected';

      var label = hasContent
        ? '<span class="life-cal-dot"></span>'
        : '';

      cells += '<div class="' + classes + '" data-date="' + dateStr + '" tabindex="0">' +
        '<span class="life-cal-day-num">' + d + '</span>' +
        label +
      '</div>';
    }

    dom.calendarGrid.innerHTML = cells;

    // Bind click
    dom.calendarGrid.querySelectorAll('.life-cal-cell').forEach(function (cell) {
      cell.addEventListener('click', function () {
        var date = cell.dataset.date;
        if (date && STATE.entriesByDate[date]) {
          selectDate(date);
        }
      });
      cell.addEventListener('keydown', function (e) {
        if ((e.key === 'Enter' || e.key === ' ') && cell.dataset.date && STATE.entriesByDate[cell.dataset.date]) {
          e.preventDefault();
          selectDate(cell.dataset.date);
        }
      });
    });

    // If no date selected, select latest or first available
    if (!STATE.selectedDate || !STATE.entriesByDate[STATE.selectedDate]) {
      var dates = STATE.entries.map(function (e) { return e.date; }).filter(Boolean).sort();
      if (dates.length) {
        selectDate(dates[dates.length - 1]);
      }
    } else {
      // Re-select to update content
      showEntry(STATE.selectedDate);
    }
  }

  /* ==========================================================
     Date Selection & Entry Display
     ========================================================== */
  function selectDate(dateStr) {
    STATE.selectedDate = dateStr;

    // Update calendar cell highlighting
    dom.calendarGrid.querySelectorAll('.life-cal-cell').forEach(function (cell) {
      cell.classList.toggle('life-cal-selected', cell.dataset.date === dateStr);
    });

    showEntry(dateStr);
  }

  function showEntry(dateStr) {
    var entry = STATE.entriesByDate[dateStr];
    if (!entry) {
      if (dom.entryPanel) dom.entryPanel.classList.add('hidden');
      return;
    }

    if (dom.entryPanel) dom.entryPanel.classList.remove('hidden');

    // Date
    if (dom.entryDate) dom.entryDate.textContent = '📅 ' + formatDate(entry.date);

    // Title
    if (dom.entryTitle) dom.entryTitle.textContent = entry.title;

    // Tags
    if (dom.entryTags) {
      if (entry.tags && entry.tags.length) {
        dom.entryTags.innerHTML = entry.tags.map(function (t) {
          return '<span class="life-entry-tag">#' + escapeHtml(t) + '</span>';
        }).join('');
        dom.entryTags.classList.remove('hidden');
      } else {
        dom.entryTags.classList.add('hidden');
      }
    }

    // Body
    if (dom.entryBody) {
      dom.entryBody.innerHTML = renderMarkdown(entry.body || '');
    }

    // Scroll entry panel to top
    if (dom.entryPanel) dom.entryPanel.scrollTop = 0;
  }

  /* ==========================================================
     Month Navigation
     ========================================================== */
  function goPrevMonth() {
    STATE.currentMonth--;
    if (STATE.currentMonth < 1) {
      STATE.currentMonth = 12;
      STATE.currentYear--;
    }
    renderCalendar();
  }

  function goNextMonth() {
    STATE.currentMonth++;
    if (STATE.currentMonth > 12) {
      STATE.currentMonth = 1;
      STATE.currentYear++;
    }
    renderCalendar();
  }

  function goToday() {
    var now = new Date();
    STATE.currentYear = now.getFullYear();
    STATE.currentMonth = now.getMonth() + 1;
    renderCalendar();
  }

  /* ==========================================================
     Event Bindings
     ========================================================== */
  function bindEvents() {
    if (dom.btnPrev) dom.btnPrev.addEventListener('click', goPrevMonth);
    if (dom.btnNext) dom.btnNext.addEventListener('click', goNextMonth);
    if (dom.btnToday) dom.btnToday.addEventListener('click', goToday);
  }

  /* ==========================================================
     Init
     ========================================================== */
  function init() {
    if (STATE.loaded) return;

    dom = {
      loading: $('#life-loading'),
      empty: $('#life-empty'),
      calendar: $('#life-calendar'),
      monthTitle: $('#life-month-title'),
      calendarGrid: $('#life-cal-grid'),
      btnPrev: $('#life-cal-prev'),
      btnNext: $('#life-cal-next'),
      btnToday: $('#life-cal-today'),
      entryPanel: $('#life-entry-panel'),
      entryDate: $('#life-entry-date'),
      entryTitle: $('#life-entry-title'),
      entryTags: $('#life-entry-tags'),
      entryBody: $('#life-entry-body'),
    };

    STATE.loaded = true;
    bindEvents();
    loadEntries();
  }

  /* ==========================================================
     Register
     ========================================================== */
  if (window.JaterMod) {
    window.JaterMod.register('life', { init: init });
  } else {
    document.addEventListener('DOMContentLoaded', function () {
      if (window.JaterMod) {
        window.JaterMod.register('life', { init: init });
      }
    });
  }
})();
