/**
 * module-marketing.js
 * 营销管理 Module — 卡片瀑布流 + 筛选 + 详情弹窗 + markdown 渲染
 * 通过 JaterMod 注册，首次激活时懒加载数据。
 *
 * 依赖：core.js (Jater), module-registry.js (JaterMod)
 */
(function () {
  'use strict';

  var $ = window.Jater.$;
  var escapeHtml = window.Jater.escapeHtml;
  var formatDate = window.Jater.formatDate;

  var STATE = {
    notes: [],
    activeFilter: 'all',
    activeNoteId: null,
    loaded: false,
  };

  var dom = {};

  function renderMarkdown(md) {
    if (!md) return '';
    var html = md
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
        while (i < lines.length && lines[i].match(/^>\s/)) { quoteLines.push(lines[i].replace(/^>\s?/, '')); i++; }
        var quoteBody = quoteLines.join('\n');
        quoteBody = quoteBody.split('\n').map(function (ql) { return applyInline(ql); }).join('<br>');
        blocks.push('<blockquote><p>' + quoteBody + '</p></blockquote>');
        continue;
      }
      if (line.match(/^[-*]\s/)) {
        var listItems = [];
        while (i < lines.length && lines[i].match(/^[-*]\s/)) { listItems.push('<li>' + applyInline(lines[i].replace(/^[-*]\s/, '')) + '</li>'); i++; }
        blocks.push('<ul>' + listItems.join('') + '</ul>');
        continue;
      }
      if (line.match(/^\d+\.\s/)) {
        var olItems = [];
        while (i < lines.length && lines[i].match(/^\d+\.\s/)) { olItems.push('<li>' + applyInline(lines[i].replace(/^\d+\.\s/, '')) + '</li>'); i++; }
        blocks.push('<ol>' + olItems.join('') + '</ol>');
        continue;
      }
      var paraLines = [];
      while (i < lines.length && lines[i].trim() !== '' &&
             !lines[i].match(/^(#{1,4}\s|>\s|[-*]\s|\d+\.\s)/)) {
        paraLines.push(lines[i]); i++;
      }
      if (paraLines.length > 0) {
        blocks.push('<p>' + paraLines.map(function (pl) { return applyInline(pl); }).join('<br>') + '</p>');
      }
    }
    return '<div class="marketing-md-body">\n' + blocks.join('\n') + '\n</div>';
  }

  function applyInline(text) {
    return text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  }

  async function loadNotes() {
    try {
      var resp = await fetch('data/marketing-notes.json');
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      var data = await resp.json();
      STATE.notes = data.notes || [];
      renderAll();
    } catch (err) {
      console.warn('Marketing module: failed to load', err.message);
      STATE.notes = [];
      renderAll();
    }
  }

  function renderStats() {
    var elTotal = $('#stat-marketing-notes');
    var elRange = $('#stat-marketing-range');
    if (elTotal) elTotal.textContent = STATE.notes.length + ' 篇';
    if (elRange) {
      if (STATE.notes.length) {
        var dates = STATE.notes.map(function (n) { return n.date; }).filter(Boolean).sort();
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

  function renderAll() {
    if (dom.loading) dom.loading.classList.add('hidden');
    if (!STATE.notes.length) {
      if (dom.empty) dom.empty.classList.remove('hidden');
      if (dom.masonry) dom.masonry.innerHTML = '';
      renderStats();
      return;
    }
    if (dom.empty) dom.empty.classList.add('hidden');
    if (dom.masonry) dom.masonry.classList.remove('hidden');
    renderStats();
    renderMasonry();
  }

  function getFilteredNotes() {
    if (STATE.activeFilter === 'all') return STATE.notes;
    return STATE.notes.filter(function (n) { return n.type === STATE.activeFilter; });
  }

  function renderMasonry() {
    if (!dom.masonry) return;
    var filtered = getFilteredNotes();
    if (!filtered.length) {
      dom.masonry.innerHTML = '<div class="marketing-empty-filter"><p>没有符合条件的笔记</p></div>';
      return;
    }
    dom.masonry.innerHTML = filtered.map(function (note) {
      var excerpt = note.excerpt || '';
      excerpt = excerpt.replace(/[#*>`\[\]\(\)]/g, '').trim();
      if (!excerpt && note.body) {
        excerpt = note.body.replace(/[#*>`\[\]\(\)]/g, '').replace(/\n+/g, ' ').trim().slice(0, 150);
        if (excerpt.length >= 150) excerpt += '...';
      }
      var tagsHTML = '';
      if (note.tags && note.tags.length) {
        tagsHTML = '<div class="marketing-card-tags">' +
          note.tags.map(function (t) { return '<span class="marketing-card-tag">#' + escapeHtml(t) + '</span>'; }).join('') +
        '</div>';
      }
      var chapterRow = '';
      if (note.chapter) {
        chapterRow = '<div class="marketing-card-chapter">📂 ' + escapeHtml(note.chapter) + '</div>';
      }
      return '<article class="marketing-card" data-note-id="' + escapeHtml(note.id) + '" tabindex="0">' +
        '<div class="marketing-card-type-badge">📝 笔记</div>' +
        '<h3 class="marketing-card-title">' + escapeHtml(note.title) + '</h3>' +
        chapterRow +
        '<p class="marketing-card-excerpt">' + escapeHtml(excerpt) + '</p>' +
        tagsHTML +
        '<div class="marketing-card-footer">' +
          '<span class="marketing-card-date">' + formatDate(note.date) + '</span>' +
          '<span class="marketing-card-detail-btn">阅读全文 →</span>' +
        '</div>' +
      '</article>';
    }).join('');
    dom.masonry.querySelectorAll('.marketing-card').forEach(function (card) {
      card.addEventListener('click', function () { var id = card.dataset.noteId; if (id) openModal(id); });
      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); var id = card.dataset.noteId; if (id) openModal(id); }
      });
    });
  }

  function openModal(noteId) {
    var note = STATE.notes.find(function (n) { return n.id === noteId; });
    if (!note) return;
    STATE.activeNoteId = noteId;
    if (dom.modalTitle) dom.modalTitle.textContent = note.title;
    if (dom.modalTypeBadge) {
      dom.modalTypeBadge.textContent = note.source ? '📖 ' + escapeHtml(note.source) : '📝 笔记';
    }
    if (dom.modalMeta) {
      var metaParts = [];
      metaParts.push('<div class="marketing-modal-date">📅 ' + formatDate(note.date) + '</div>');
      if (note.chapter) metaParts.push('<div class="marketing-modal-source">📂 ' + escapeHtml(note.chapter) + '</div>');
      if (note.tags && note.tags.length) {
        metaParts.push('<div class="marketing-modal-tags">' +
          note.tags.map(function (t) { return '<span class="marketing-modal-tag">#' + escapeHtml(t) + '</span>'; }).join('') +
        '</div>');
      }
      dom.modalMeta.innerHTML = metaParts.join('\n');
    }
    if (dom.modalBody) dom.modalBody.innerHTML = renderMarkdown(note.body || '');
    if (dom.modalOverlay) {
      dom.modalOverlay.classList.remove('hidden');
      dom.modalOverlay.setAttribute('aria-hidden', 'false');
    }
    document.documentElement.style.overflow = 'hidden';
    if (dom.modalClose) dom.modalClose.focus();
  }

  function closeModal() {
    var closingId = STATE.activeNoteId;
    STATE.activeNoteId = null;
    if (dom.modalOverlay) {
      dom.modalOverlay.classList.add('hidden');
      dom.modalOverlay.setAttribute('aria-hidden', 'true');
    }
    document.documentElement.style.overflow = '';
    if (closingId && dom.masonry) {
      var trigger = dom.masonry.querySelector('[data-note-id="' + closingId + '"]');
      if (trigger) trigger.focus();
    }
  }

  function bindEvents() {
    if (dom.filterBtns && dom.filterBtns.length) {
      dom.filterBtns.forEach(function (btn) {
        btn.addEventListener('click', function () {
          dom.filterBtns.forEach(function (b) { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
          btn.classList.add('active');
          btn.setAttribute('aria-selected', 'true');
          STATE.activeFilter = btn.dataset.filter;
          renderMasonry();
        });
      });
    }
    if (dom.modalClose) dom.modalClose.addEventListener('click', closeModal);
    if (dom.modalOverlay) dom.modalOverlay.addEventListener('click', function (e) { if (e.target === dom.modalOverlay) closeModal(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && dom.modalOverlay && !dom.modalOverlay.classList.contains('hidden')) closeModal();
    });
  }

  function init() {
    if (STATE.loaded) return;
    dom = {
      loading: $('#marketing-loading'),
      empty: $('#marketing-empty'),
      masonry: $('#marketing-masonry'),
      filterBtns: document.querySelectorAll('.marketing-filter-btn'),
      modalOverlay: $('#marketing-modal-overlay'),
      modalTitle: $('#marketing-modal-title'),
      modalTypeBadge: $('#marketing-modal-type-badge'),
      modalMeta: $('#marketing-modal-meta'),
      modalBody: $('#marketing-modal-body'),
      modalClose: $('#marketing-modal-close'),
    };
    STATE.loaded = true;
    bindEvents();
    loadNotes();
  }

  if (window.JaterMod) {
    window.JaterMod.register('marketing', { init: init });
  } else {
    document.addEventListener('DOMContentLoaded', function () {
      if (window.JaterMod) window.JaterMod.register('marketing', { init: init });
    });
  }
})();
