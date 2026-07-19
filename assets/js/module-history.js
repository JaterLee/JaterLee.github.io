/**
 * module-history.js
 * 五代十国史 Module — 读书笔记列表
 * 通过 JaterMod 注册，首次激活时懒加载数据。
 *
 * 依赖：core.js (Jater), module-registry.js (JaterMod)
 */
(function () {
  'use strict';

  var $ = window.Jater.$;
  var formatDate = window.Jater.formatDate;
  var escapeHtml = window.Jater.escapeHtml;

  /* ==========================================================
     State
     ========================================================== */
  var STATE = {
    notes: [],
    loaded: false,
  };

  /* ==========================================================
     DOM Refs
     ========================================================== */
  var dom = {};

  /* ==========================================================
     Data Loading
     ========================================================== */
  async function loadNotes() {
    try {
      var resp = await fetch('data/history-notes.json');
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      var data = await resp.json();
      STATE.notes = data.notes || [];
      render();
    } catch (err) {
      console.warn('History module: failed to load history-notes.json', err.message);
      // Show empty state instead of error (data file may not exist yet)
      STATE.notes = [];
      render();
    }
  }

  /* ==========================================================
     Stats
     ========================================================== */
  function renderStats() {
    var statChapters = $('#stat-history-chapters');
    var statNotes = $('#stat-history-notes');

    var withDates = STATE.notes.filter(function (n) { return n.date; });
    var readCount = withDates.length;
    var totalCount = STATE.notes.length;

    if (statChapters) statChapters.textContent = readCount + ' / ' + totalCount;
    if (statNotes) statNotes.textContent = totalCount + ' 篇';
  }

  /* ==========================================================
     Rendering
     ========================================================== */
  function render() {
    if (dom.loading) dom.loading.classList.add('hidden');

    if (!STATE.notes.length) {
      if (dom.empty) dom.empty.classList.remove('hidden');
      renderStats();
      return;
    }

    if (dom.empty) dom.empty.classList.add('hidden');
    if (dom.list) dom.list.classList.remove('hidden');

    renderStats();

    // Map chapter numbers to Chinese numerals
    var numerals = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十',
      '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十'];

    dom.list.innerHTML = STATE.notes.map(function (note) {
      var chapterLabel = note.chapter ? numerals[note.chapter] || note.chapter : '?';
      var dateText = note.date ? formatDate(note.date) : '即将到来...';

      var eventsHTML = '';
      if (note.events && note.events.length) {
        eventsHTML = '<div class="history-events">' +
          note.events.map(function (ev) {
            return '<span class="history-event-tag">' + escapeHtml(ev) + '</span>';
          }).join('') +
        '</div>';
      }

      var tagsHTML = '';
      if (note.tags && note.tags.length) {
        tagsHTML = '<div class="history-events" style="margin-top:8px">' +
          note.tags.map(function (t) {
            return '<span class="history-event-tag" style="background:rgba(219,180,44,0.06);border-color:rgba(219,180,44,0.08);font-size:0.65rem;">#' + escapeHtml(t) + '</span>';
          }).join('') +
        '</div>';
      }

      return '<article class="history-chapter-card' + (note.date ? '' : ' history-chapter-upcoming') + '">' +
        '<div class="history-chapter-header">' +
          '<span class="history-chapter-number">' + chapterLabel + '</span>' +
          '<span class="history-chapter-title">' + escapeHtml(note.title) + '</span>' +
          '<span class="history-chapter-date">' + dateText + '</span>' +
        '</div>' +
        '<div class="history-chapter-summary">' + escapeHtml(note.summary) + '</div>' +
        eventsHTML +
        tagsHTML +
      '</article>';
    }).join('');
  }

  /* ==========================================================
     Init — called by JaterMod on first activation
     ========================================================== */
  function init() {
    if (STATE.loaded) return;

    // Collect DOM refs
    dom = {
      loading: $('#history-loading'),
      error: $('#history-error'),
      empty: $('#history-empty'),
      list: $('#history-notes-list'),
    };

    STATE.loaded = true;
    loadNotes();
  }

  /* ==========================================================
     Register with module registry
     ========================================================== */
  if (window.JaterMod) {
    window.JaterMod.register('history', { init: init });
  } else {
    document.addEventListener('DOMContentLoaded', function () {
      if (window.JaterMod) {
        window.JaterMod.register('history', { init: init });
      }
    });
  }
})();
