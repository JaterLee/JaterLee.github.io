/**
 * module-history.js
 * 五代十国史 Module — 卡片瀑布流 + 类型筛选 + 详情弹窗 + markdown 渲染
 * 通过 JaterMod 注册，首次激活时懒加载数据。
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
    notes: [],
    activeFilter: 'all',
    activeNoteId: null,
    loaded: false,
  };

  /* ==========================================================
     DOM Refs (populated on init)
     ========================================================== */
  var dom = {};

  /* ==========================================================
     Markdown → HTML Renderer (lightweight, ~50 lines)
     Supports: # headings, **bold**, *italic*, `code`,
               [links](url), > blockquote, - unordered list,
               1. ordered list, paragraph breaks
     ========================================================== */

  function renderMarkdown(md) {
    if (!md) return '';

    // 1. Escape HTML entities
    var html = md
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // 2. Normalize line endings
    html = html.replace(/\r\n/g, '\n');

    // 3. Split into lines
    var lines = html.split('\n');
    var blocks = [];
    var i = 0;

    while (i < lines.length) {
      var line = lines[i];

      // Skip empty lines
      if (line.trim() === '') {
        i++;
        continue;
      }

      // Heading
      var hMatch = line.match(/^(#{1,4})\s+(.+)$/);
      if (hMatch) {
        var level = hMatch[1].length + 1; // # → h2, ## → h3, ### → h4, #### → h5
        var tag = 'h' + Math.min(level, 5);
        blocks.push('<' + tag + '>' + applyInline(line.slice(hMatch[0].indexOf(hMatch[2]))) + '</' + tag + '>');
        i++;
        continue;
      }

      // Blockquote (can be multi-line with consecutive > lines)
      if (line.match(/^>\s/)) {
        var quoteLines = [];
        while (i < lines.length && lines[i].match(/^>\s/)) {
          quoteLines.push(lines[i].replace(/^>\s?/, ''));
          i++;
        }
        var quoteBody = quoteLines.join('\n');
        // Process inline in each quote line, then wrap
        quoteBody = quoteBody.split('\n').map(function (ql) {
          return applyInline(ql);
        }).join('<br>');
        blocks.push('<blockquote><p>' + quoteBody + '</p></blockquote>');
        continue;
      }

      // Unordered list (consecutive - or * lines)
      if (line.match(/^[-*]\s/)) {
        var listItems = [];
        while (i < lines.length && lines[i].match(/^[-*]\s/)) {
          listItems.push('<li>' + applyInline(lines[i].replace(/^[-*]\s/, '')) + '</li>');
          i++;
        }
        blocks.push('<ul>' + listItems.join('') + '</ul>');
        continue;
      }

      // Ordered list (consecutive 1. 2. etc lines)
      if (line.match(/^\d+\.\s/)) {
        var olItems = [];
        while (i < lines.length && lines[i].match(/^\d+\.\s/)) {
          olItems.push('<li>' + applyInline(lines[i].replace(/^\d+\.\s/, '')) + '</li>');
          i++;
        }
        blocks.push('<ol>' + olItems.join('') + '</ol>');
        continue;
      }

      // Paragraph: collect consecutive non-empty, non-special lines
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

    // 4. Wrap in container
    return '<div class="history-md-body">\n' + blocks.join('\n') + '\n</div>';
  }

  /**
   * Apply inline markdown formatting to a text segment
   * (must be called AFTER HTML escaping)
   */
  function applyInline(text) {
    return text
      // Bold
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      // Italic
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      // Inline code
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      // Links
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  }

  /* ==========================================================
     Data Loading
     ========================================================== */
  async function loadNotes() {
    try {
      var resp = await fetch('data/history-notes.json');
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      var data = await resp.json();
      STATE.notes = data.notes || [];
      renderAll();
    } catch (err) {
      console.warn('History module: failed to load history-notes.json', err.message);
      STATE.notes = [];
      renderAll();
    }
  }

  /* ==========================================================
     Stats
     ========================================================== */
  function renderStats() {
    var elTotal = $('#stat-history-notes');
    var elRange = $('#stat-history-range');

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

  /* ==========================================================
     Rendering — Masonry Cards
     ========================================================== */

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
      dom.masonry.innerHTML = '<div class="history-empty-filter"><p>没有符合条件的笔记</p></div>';
      return;
    }

    dom.masonry.innerHTML = filtered.map(function (note) {
      var isPassage = note.type === 'passage';
      var typeLabel = isPassage ? '摘录' : '感悟';
      var typeClass = isPassage ? 'history-card-passage' : 'history-card-reflection';

      // Clean excerpt for card display (strip remaining markdown chars)
      var excerpt = note.excerpt || '';
      excerpt = excerpt.replace(/[#*>`\[\]\(\)]/g, '').trim();
      if (!excerpt && note.body) {
        // Fallback: generate from body
        excerpt = note.body.replace(/[#*>`\[\]\(\)]/g, '').replace(/\n+/g, ' ').trim().slice(0, 150);
        if (excerpt.length >= 150) excerpt += '...';
      }

      var tagsHTML = '';
      if (note.tags && note.tags.length) {
        tagsHTML = '<div class="history-card-tags">' +
          note.tags.map(function (t) {
            return '<span class="history-card-tag">#' + escapeHtml(t) + '</span>';
          }).join('') +
        '</div>';
      }

      var footerSource = '';
      if (isPassage && note.source) {
        footerSource = '<span class="history-card-source" title="' + escapeHtml(note.source) + '">' + escapeHtml(note.source) + '</span>';
      }

      return '<article class="history-card ' + typeClass + '" data-note-id="' + escapeHtml(note.id) + '" tabindex="0">' +
        '<div class="history-card-type-badge">' + typeLabel + '</div>' +
        '<h3 class="history-card-title">' + escapeHtml(note.title) + '</h3>' +
        (isPassage && note.source
          ? '<div class="history-card-source-row">📖 ' + escapeHtml(note.source) + '</div>'
          : '') +
        '<p class="history-card-excerpt">' + escapeHtml(excerpt) + '</p>' +
        tagsHTML +
        '<div class="history-card-footer">' +
          '<span class="history-card-date">' + formatDate(note.date) + '</span>' +
          footerSource +
          '<span class="history-card-detail-btn">阅读全文 →</span>' +
        '</div>' +
      '</article>';
    }).join('');

    // Bind card click → open modal
    dom.masonry.querySelectorAll('.history-card').forEach(function (card) {
      card.addEventListener('click', function () {
        var id = card.dataset.noteId;
        if (id) openModal(id);
      });
      // Keyboard: Enter/Space to open
      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          var id = card.dataset.noteId;
          if (id) openModal(id);
        }
      });
    });
  }

  /* ==========================================================
     Detail Modal
     ========================================================== */

  function openModal(noteId) {
    var note = STATE.notes.find(function (n) { return n.id === noteId; });
    if (!note) return;

    STATE.activeNoteId = noteId;

    // Title
    if (dom.modalTitle) dom.modalTitle.textContent = note.title;

    // Type badge
    if (dom.modalTypeBadge) {
      var isPassage = note.type === 'passage';
      dom.modalTypeBadge.textContent = isPassage ? '📖 摘录' : '💭 感悟';
      dom.modalTypeBadge.className = 'history-modal-type-badge' +
        (isPassage ? ' badge-passage' : ' badge-reflection');
    }

    // Metadata
    if (dom.modalMeta) {
      var metaParts = [];
      metaParts.push('<div class="history-modal-date">📅 ' + formatDate(note.date) + '</div>');
      if (note.source) {
        metaParts.push('<div class="history-modal-source">📖 ' + escapeHtml(note.source) + '</div>');
      }
      if (note.tags && note.tags.length) {
        metaParts.push('<div class="history-modal-tags">' +
          note.tags.map(function (t) {
            return '<span class="history-modal-tag">#' + escapeHtml(t) + '</span>';
          }).join('') +
        '</div>');
      }
      dom.modalMeta.innerHTML = metaParts.join('\n');
    }

    // Body: render markdown
    if (dom.modalBody) {
      dom.modalBody.innerHTML = renderMarkdown(note.body || '');
    }

    // Show modal
    if (dom.modalOverlay) {
      dom.modalOverlay.classList.remove('hidden');
      dom.modalOverlay.setAttribute('aria-hidden', 'false');
    }
    document.documentElement.style.overflow = 'hidden';

    // Focus the modal for accessibility
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

    // Return focus to the triggering card
    if (closingId && dom.masonry) {
      var trigger = dom.masonry.querySelector('[data-note-id="' + closingId + '"]');
      if (trigger) trigger.focus();
    }
  }

  /* ==========================================================
     Event Bindings
     ========================================================== */

  function bindEvents() {
    // Type filter buttons
    if (dom.filterBtns && dom.filterBtns.length) {
      dom.filterBtns.forEach(function (btn) {
        btn.addEventListener('click', function () {
          dom.filterBtns.forEach(function (b) {
            b.classList.remove('active');
            b.setAttribute('aria-selected', 'false');
          });
          btn.classList.add('active');
          btn.setAttribute('aria-selected', 'true');
          STATE.activeFilter = btn.dataset.filter;
          renderMasonry();
        });
      });
    }

    // Modal close button
    if (dom.modalClose) {
      dom.modalClose.addEventListener('click', closeModal);
    }

    // Overlay click to close
    if (dom.modalOverlay) {
      dom.modalOverlay.addEventListener('click', function (e) {
        if (e.target === dom.modalOverlay) closeModal();
      });
    }

    // Escape key to close
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && dom.modalOverlay && !dom.modalOverlay.classList.contains('hidden')) {
        closeModal();
      }
    });
  }

  /* ==========================================================
     Init — called by JaterMod on first activation
     ========================================================== */

  function init() {
    if (STATE.loaded) return;

    // Collect DOM refs
    dom = {
      loading: $('#history-loading'),
      empty: $('#history-empty'),
      masonry: $('#history-masonry'),
      filterBtns: document.querySelectorAll('.history-filter-btn'),
      modalOverlay: $('#history-modal-overlay'),
      modalTitle: $('#history-modal-title'),
      modalTypeBadge: $('#history-modal-type-badge'),
      modalMeta: $('#history-modal-meta'),
      modalBody: $('#history-modal-body'),
      modalClose: $('#history-modal-close'),
    };

    STATE.loaded = true;
    bindEvents();
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
