/**
 * module-life.js
 * 生活小记 Module — 时间线列表 + 详情弹窗
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
    entries: [],
    loading: false,
    loaded: false,
  };

  /* ==========================================================
     DOM Refs
     ========================================================== */
  var dom = {};

  /* ==========================================================
     Lightweight Markdown Renderer
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

      var hMatch = line.match(/^(#{1,4})\s+(.+)$/);
      if (hMatch) {
        var level = hMatch[1].length + 1;
        var tag = 'h' + Math.min(level, 5);
        blocks.push('<' + tag + '>' + applyInline(line.slice(hMatch[0].indexOf(hMatch[2]))) + '</' + tag + '>');
        i++; continue;
      }

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

      if (line.match(/^[-*]\s/)) {
        var listItems = [];
        while (i < lines.length && lines[i].match(/^[-*]\s/)) {
          listItems.push('<li>' + applyInline(lines[i].replace(/^[-*]\s/, '')) + '</li>');
          i++;
        }
        blocks.push('<ul>' + listItems.join('') + '</ul>');
        continue;
      }

      if (line.match(/^\d+\.\s/)) {
        var olItems = [];
        while (i < lines.length && lines[i].match(/^\d+\.\s/)) {
          olItems.push('<li>' + applyInline(lines[i].replace(/^\d+\.\s/, '')) + '</li>');
          i++;
        }
        blocks.push('<ol>' + olItems.join('') + '</ol>');
        continue;
      }

      var paraLines = [];
      while (i < lines.length && lines[i].trim() !== '' &&
             !lines[i].match(/^(#{1,4}\s|>\s|[-*]\s|\d+\.\s)/)) {
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
    return text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  }

  /* ==========================================================
     Data Loading
     ========================================================== */
  async function loadEntries() {
    STATE.loading = true;
    if (dom.loading) dom.loading.classList.remove('hidden');
    if (dom.empty) dom.empty.classList.add('hidden');
    if (dom.timeline) dom.timeline.innerHTML = '';

    try {
      var resp = await fetch('data/life-notes.json');
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      var data = await resp.json();
      STATE.entries = data.notes || [];
    } catch (err) {
      console.warn('Life module: failed to load life-notes.json', err.message);
      STATE.entries = [];
    }

    STATE.loading = false;
    if (dom.loading) dom.loading.classList.add('hidden');
    renderAll();
  }

  /* ==========================================================
     Rendering
     ========================================================== */
  function renderAll() {
    updateStats();

    if (!STATE.entries.length) {
      if (dom.empty) dom.empty.classList.remove('hidden');
      if (dom.timeline) dom.timeline.innerHTML = '';
      return;
    }

    if (dom.empty) dom.empty.classList.add('hidden');
    renderTimeline();
  }

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

  function renderTimeline() {
    if (!dom.timeline) return;

    dom.timeline.innerHTML = STATE.entries.map(function (entry) {
      var excerpt = entry.body
        ? entry.body.replace(/[#*>`\[\]\(\)]/g, '').replace(/\n+/g, ' ').trim().slice(0, 120)
        : '';
      if (excerpt.length >= 120) excerpt += '...';

      return '<article class="life-entry" data-entry-id="' + escapeHtml(entry.id) + '" tabindex="0">' +
        '<div class="life-entry-date">📅 ' + formatDate(entry.date) + '</div>' +
        '<h3 class="life-entry-title">' + escapeHtml(entry.title) + '</h3>' +
        (excerpt ? '<p class="life-entry-excerpt">' + escapeHtml(excerpt) + '</p>' : '') +
        '<div class="life-entry-footer">' +
          '<span class="life-entry-readmore">阅读全文 →</span>' +
        '</div>' +
      '</article>';
    }).join('');

    dom.timeline.querySelectorAll('.life-entry').forEach(function (card) {
      card.addEventListener('click', function () {
        var id = card.dataset.entryId;
        if (id) openModal(id);
      });
      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          var id = card.dataset.entryId;
          if (id) openModal(id);
        }
      });
    });
  }

  /* ==========================================================
     Detail Modal
     ========================================================== */
  function openModal(entryId) {
    var entry = STATE.entries.find(function (e) { return e.id === entryId; });
    if (!entry) return;

    if (dom.modalTitle) dom.modalTitle.textContent = entry.title;
    if (dom.modalDate) dom.modalDate.textContent = '📅 ' + formatDate(entry.date);

    if (dom.modalBody) {
      dom.modalBody.innerHTML = renderMarkdown(entry.body || '');
    }

    if (dom.modalOverlay) {
      dom.modalOverlay.classList.remove('hidden');
      dom.modalOverlay.setAttribute('aria-hidden', 'false');
    }
    document.documentElement.style.overflow = 'hidden';
    if (dom.modalClose) dom.modalClose.focus();
  }

  function closeModal() {
    if (dom.modalOverlay) {
      dom.modalOverlay.classList.add('hidden');
      dom.modalOverlay.setAttribute('aria-hidden', 'true');
    }
    document.documentElement.style.overflow = '';
  }

  /* ==========================================================
     Event Bindings
     ========================================================== */
  function bindEvents() {
    if (dom.modalClose) {
      dom.modalClose.addEventListener('click', closeModal);
    }
    if (dom.modalOverlay) {
      dom.modalOverlay.addEventListener('click', function (e) {
        if (e.target === dom.modalOverlay) closeModal();
      });
    }
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && dom.modalOverlay && !dom.modalOverlay.classList.contains('hidden')) {
        closeModal();
      }
    });
  }

  /* ==========================================================
     Init
     ========================================================== */
  function init() {
    if (STATE.loaded) return;

    dom = {
      loading: $('#life-loading'),
      empty: $('#life-empty'),
      timeline: $('#life-timeline'),
      modalOverlay: $('#life-modal-overlay'),
      modalTitle: $('#life-modal-title'),
      modalDate: $('#life-modal-date'),
      modalBody: $('#life-modal-body'),
      modalClose: $('#life-modal-close'),
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
