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
    activeView: 'masonry',
    activeNoteId: null,
    loaded: false,
    perPage: 12,
    renderedCount: 0,
    likes: {},
    likeThreshold: 3,
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
     Likes (localStorage)
     ========================================================== */
  var LIKES_KEY = 'history-likes';

  function loadLikes() {
    try {
      var raw = localStorage.getItem(LIKES_KEY);
      STATE.likes = raw ? JSON.parse(raw) : {};
    } catch (e) {
      STATE.likes = {};
    }
  }

  function saveLikes() {
    try {
      localStorage.setItem(LIKES_KEY, JSON.stringify(STATE.likes));
    } catch (e) { /* quota exceeded */ }
  }

  function getLikeCount(noteId) {
    return STATE.likes[noteId] || 0;
  }

  function toggleLike(noteId) {
    var current = STATE.likes[noteId] || 0;
    STATE.likes[noteId] = current + 1;
    saveLikes();
    return STATE.likes[noteId];
  }

  function onLikeClick(e, card) {
    e.stopPropagation();
    var noteId = card.dataset.noteId;
    if (!noteId) return;
    var newCount = toggleLike(noteId);
    updateLikeDisplay(card, newCount);
  }

  function updateLikeDisplay(card, count) {
    var btn = card.querySelector('.history-like-btn');
    if (btn) {
      btn.innerHTML = count > 0
        ? '<span class="history-like-heart liked">❤️</span><span class="history-like-count">' + count + '</span>'
        : '<span class="history-like-heart">🤍</span>';
    }
    card.classList.toggle('history-card-rainbow', count >= STATE.likeThreshold);
  }

  /* ==========================================================
     Data Loading
     ========================================================== */
  async function loadNotes() {
    loadLikes();
    var FETCH_TIMEOUT = 15000; // 15s timeout for slow networks
    var controller = new AbortController();
    var timeoutId = setTimeout(function () { controller.abort(); }, FETCH_TIMEOUT);
    try {
      var resp = await fetch('data/history-notes.json', { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      var data = await resp.json();
      STATE.notes = data.notes || [];
      renderAll();
    } catch (err) {
      clearTimeout(timeoutId);
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
      if (dom.timeline) dom.timeline.innerHTML = '';
      renderStats();
      return;
    }

    if (dom.empty) dom.empty.classList.add('hidden');

    renderStats();
    renderActiveView();
  }

  function renderActiveView() {
    var isTimeline = STATE.activeView === 'timeline';
    if (dom.masonry) dom.masonry.classList.toggle('hidden', isTimeline);
    if (dom.timeline) dom.timeline.classList.toggle('hidden', !isTimeline);
    if (isTimeline) {
      renderTimeline();
    } else {
      renderMasonry();
    }
  }

  function getFilteredNotes() {
    if (STATE.activeFilter === 'all') return STATE.notes;
    return STATE.notes.filter(function (n) { return n.type === STATE.activeFilter; });
  }

  function renderCards(container, notes, startIdx) {
    if (!container) return;

    var html = notes.map(function (note) {
      var isPassage = note.type === 'passage';
      var typeLabel = isPassage ? '摘录' : '感悟';
      var typeClass = isPassage ? 'history-card-passage' : 'history-card-reflection';

      var excerpt = note.excerpt || '';
      excerpt = excerpt.replace(/[#*>`\[\]\(\)]/g, '').trim();
      if (!excerpt && note.body) {
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
          '<button class="history-like-btn" data-note-id="' + escapeHtml(note.id) + '">' +
            '<span class="history-like-heart">🤍</span>' +
          '</button>' +
          '<span class="history-card-date">' + formatDate(note.date) + '</span>' +
          footerSource +
          '<span class="history-card-detail-btn">阅读全文 →</span>' +
        '</div>' +
      '</article>';
    }).join('');

    if (startIdx === 0) {
      container.innerHTML = html;
    } else {
      // Remove the load-more button before appending
      var existingBtn = container.querySelector('.history-load-more');
      if (existingBtn) existingBtn.remove();
      container.insertAdjacentHTML('beforeend', html);
    }

    // Bind click on all cards (re-bind for existing too to catch newly appended)
    container.querySelectorAll('.history-card').forEach(function (card) {
      // Skip already-bound cards
      if (card.dataset.bound === '1') return;
      card.dataset.bound = '1';
      card.addEventListener('click', function () {
        var id = card.dataset.noteId;
        if (id) openModal(id);
      });
      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          var id = card.dataset.noteId;
          if (id) openModal(id);
        }
      });

      // Like button
      var likeBtn = card.querySelector('.history-like-btn');
      if (likeBtn) {
        likeBtn.addEventListener('click', function (e) {
          onLikeClick(e, card);
        });
      }

      // Restore like count from storage
      var noteId = card.dataset.noteId;
      if (noteId) {
        var count = getLikeCount(noteId);
        if (count > 0) updateLikeDisplay(card, count);
      }
    });
  }

  function renderLoadMoreButton(container, remaining) {
    if (!container || remaining <= 0) return;
    // Remove any existing button
    var existingBtn = container.querySelector('.history-load-more');
    if (existingBtn) existingBtn.remove();
    container.insertAdjacentHTML('beforeend',
      '<div class="history-load-more-wrap"><button class="history-load-more" id="history-load-more">' +
      '加载更多 <span class="history-load-more-count">（还有 ' + remaining + ' 篇）</span></button></div>'
    );
    var btn = $('#history-load-more');
    if (btn) {
      btn.addEventListener('click', loadMore);
    }
  }

  function loadMore() {
    var filtered = getFilteredNotes();
    var start = STATE.renderedCount;
    var end = Math.min(start + STATE.perPage, filtered.length);
    var batch = filtered.slice(start, end);

    if (!batch.length) return;

    renderCards(dom.masonry, batch, start);
    STATE.renderedCount = end;

    // Show load-more again if there's still more
    var remaining = filtered.length - STATE.renderedCount;
    renderLoadMoreButton(dom.masonry, remaining);
  }

  function renderMasonry() {
    if (!dom.masonry) return;

    var filtered = getFilteredNotes();

    if (!filtered.length) {
      dom.masonry.innerHTML = '<div class="history-empty-filter"><p>没有符合条件的笔记</p></div>';
      STATE.renderedCount = 0;
      return;
    }

    // First batch
    var firstBatch = filtered.slice(0, STATE.perPage);
    renderCards(dom.masonry, firstBatch, 0);
    STATE.renderedCount = firstBatch.length;

    // Load more button if needed
    var remaining = filtered.length - STATE.renderedCount;
    renderLoadMoreButton(dom.masonry, remaining);
  }

  /* ==========================================================
     Timeline (时间轴)
     ========================================================== */

  // 政权 → 年代区间（按历史顺序排列）
  var ERA = {
    '唐末': { label: '唐末', range: '875–907' },
    '后梁': { label: '后梁', range: '907–923' },
    '后唐': { label: '后唐', range: '923–936' },
    '后晋': { label: '后晋', range: '936–947' },
    '后汉': { label: '后汉', range: '947–951' },
    '后周': { label: '后周', range: '951–960' },
    '北宋': { label: '北宋 · 统一', range: '960–979' },
    '吴': { label: '吴（杨吴）', range: '902–937' },
    '南唐': { label: '南唐', range: '937–975' },
    '吴越': { label: '吴越', range: '907–978' },
    '前蜀': { label: '前蜀', range: '907–925' },
    '后蜀': { label: '后蜀', range: '934–965' },
    '闽': { label: '闽', range: '909–945' },
    '楚': { label: '楚（马楚）', range: '907–951' },
    '南汉': { label: '南汉', range: '917–971' },
    '南平': { label: '南平（荆南）', range: '924–963' },
    '北汉': { label: '北汉', range: '951–979' },
    '辽': { label: '辽（契丹）', range: '916–1125' },
    '朝鲜半岛': { label: '朝鲜半岛', range: '892–936' },
    '安南': { label: '安南', range: '939–968' },
  };

  var ERA_GROUPS = [
    { id: 'main', name: '五代主线', eras: ['唐末', '后梁', '后唐', '后晋', '后汉', '后周', '北宋'] },
    { id: 'shiguo', name: '十国', eras: ['吴', '南唐', '吴越', '前蜀', '后蜀', '闽', '楚', '南汉', '南平', '北汉'] },
    { id: 'foreign', name: '辽与域外', eras: ['辽', '朝鲜半岛', '安南'] },
    { id: 'other', name: '综合', eras: [] },
  ];

  function getDynastyTags(note) {
    var out = [];
    (note.tags || []).forEach(function (t) {
      if (ERA[t]) out.push(t);
    });
    return out;
  }

  function primaryEra(note) {
    var dyns = getDynastyTags(note);
    return dyns.length ? dyns[0] : null;
  }

  function shortDate(dateStr) {
    return dateStr && dateStr.length >= 10 ? dateStr.slice(5) : (dateStr || '');
  }

  function renderTimelineNote(note, primaryKey) {
    var isPassage = note.type === 'passage';
    var typeLabel = isPassage ? '摘录' : '感悟';
    var typeClass = isPassage ? 'badge-passage' : 'badge-reflection';

    var dynTags = getDynastyTags(note).filter(function (t) { return t !== primaryKey; });
    var extraChips = '';
    if (dynTags.length) {
      extraChips = '<span class="history-timeline-note-eras">' +
        dynTags.map(function (t) {
          return '<span class="history-timeline-note-era-chip">' + t + '</span>';
        }).join('') +
      '</span>';
    }

    return '<button class="history-timeline-note" data-note-id="' + escapeHtml(note.id) + '">' +
      '<span class="history-timeline-note-date">' + shortDate(note.date) + '</span>' +
      '<span class="history-timeline-note-title">' + escapeHtml(note.title) + '</span>' +
      extraChips +
      '<span class="history-timeline-note-badge ' + typeClass + '">' + typeLabel + '</span>' +
    '</button>';
  }

  function renderTimeline() {
    if (!dom.timeline) return;

    var filtered = getFilteredNotes();
    if (!filtered.length) {
      dom.timeline.innerHTML = '<div class="history-timeline-empty">没有符合条件的笔记</div>';
      return;
    }

    // 按 primary era 分桶
    var buckets = {};
    filtered.forEach(function (n) {
      var era = primaryEra(n);
      var key = era || '__other__';
      (buckets[key] = buckets[key] || []).push(n);
    });

    var html = '';

    ERA_GROUPS.forEach(function (group) {
      var eraSections = [];
      group.eras.forEach(function (eraKey) {
        var notes = buckets[eraKey] || [];
        if (notes.length) {
          notes.sort(function (a, b) { return (a.date || '').localeCompare(b.date || ''); });
          eraSections.push({ eraKey: eraKey, notes: notes });
        }
      });

      var otherNotes = [];
      if (group.id === 'other') {
        otherNotes = (buckets['__other__'] || []).sort(function (a, b) {
          return (a.date || '').localeCompare(b.date || '');
        });
      }

      if (!eraSections.length && !otherNotes.length) return;

      html += '<section class="history-timeline-group" data-group="' + group.id + '">';
      html += '<h3 class="history-timeline-group-title">' + group.name + '</h3>';
      html += '<div class="history-timeline-track">';

      eraSections.forEach(function (sec) {
        var era = ERA[sec.eraKey];
        html += '<div class="history-timeline-era">';
        html += '<span class="history-timeline-era-dot"></span>';
        html += '<div class="history-timeline-era-header">';
        html += '<span class="history-timeline-era-name">' + era.label + '</span>';
        html += '<span class="history-timeline-era-range">' + era.range + '</span>';
        html += '<span class="history-timeline-era-count">' + sec.notes.length + ' 篇</span>';
        html += '</div>';
        html += '<div class="history-timeline-notes">';
        sec.notes.forEach(function (n) {
          html += renderTimelineNote(n, sec.eraKey);
        });
        html += '</div>';
        html += '</div>';
      });

      if (otherNotes.length) {
        html += '<div class="history-timeline-era">';
        html += '<span class="history-timeline-era-dot"></span>';
        html += '<div class="history-timeline-era-header">';
        html += '<span class="history-timeline-era-name">跨代 · 通论</span>';
        html += '<span class="history-timeline-era-count">' + otherNotes.length + ' 篇</span>';
        html += '</div>';
        html += '<div class="history-timeline-notes">';
        otherNotes.forEach(function (n) {
          html += renderTimelineNote(n, null);
        });
        html += '</div>';
        html += '</div>';
      }

      html += '</div>';
      html += '</section>';
    });

    dom.timeline.innerHTML = html;

    dom.timeline.querySelectorAll('.history-timeline-note').forEach(function (row) {
      row.addEventListener('click', function () {
        var id = row.dataset.noteId;
        if (id) openModal(id);
      });
    });
  }

  /* ==========================================================
     Detail Modal
     ========================================================== */

  function getNoteIndex(noteId) {
    return STATE.notes.findIndex(function (n) { return n.id === noteId; });
  }

  function navigatePrev() {
    if (!STATE.activeNoteId) return;
    var idx = getNoteIndex(STATE.activeNoteId);
    if (idx > 0) openModal(STATE.notes[idx - 1].id);
  }

  function navigateNext() {
    if (!STATE.activeNoteId) return;
    var idx = getNoteIndex(STATE.activeNoteId);
    if (idx >= 0 && idx < STATE.notes.length - 1) openModal(STATE.notes[idx + 1].id);
  }

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

    // Reset scroll position on open
    if (dom.modal) {
      dom.modal.scrollTop = 0;
      dom.modal.classList.remove('scrolled');
    }

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

    // Reset scroll position and shadow
    if (dom.modal) {
      dom.modal.scrollTop = 0;
      dom.modal.classList.remove('scrolled');
    }

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
          renderActiveView();
        });
      });
    }

    // View toggle (卡片 / 时间轴)
    if (dom.viewBtns && dom.viewBtns.length) {
      dom.viewBtns.forEach(function (btn) {
        btn.addEventListener('click', function () {
          dom.viewBtns.forEach(function (b) {
            b.classList.remove('active');
            b.setAttribute('aria-selected', 'false');
          });
          btn.classList.add('active');
          btn.setAttribute('aria-selected', 'true');
          STATE.activeView = btn.dataset.view;
          renderActiveView();
        });
      });
    }

    // Modal close button (top)
    if (dom.modalClose) {
      dom.modalClose.addEventListener('click', closeModal);
    }

    // Modal close button (bottom)
    if (dom.modalCloseBottom) {
      dom.modalCloseBottom.addEventListener('click', closeModal);
    }

    // Modal prev/next buttons
    if (dom.modalPrev) {
      dom.modalPrev.addEventListener('click', navigatePrev);
    }
    if (dom.modalNext) {
      dom.modalNext.addEventListener('click', navigateNext);
    }

    // Overlay click to close
    if (dom.modalOverlay) {
      dom.modalOverlay.addEventListener('click', function (e) {
        if (e.target === dom.modalOverlay) closeModal();
      });
    }

    // Scroll shadow toggle on modal
    if (dom.modal) {
      dom.modal.addEventListener('scroll', function () {
        if (dom.modal.scrollTop > 8) {
          dom.modal.classList.add('scrolled');
        } else {
          dom.modal.classList.remove('scrolled');
        }
      }, { passive: true });
    }

    // Escape key to close
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && dom.modalOverlay && !dom.modalOverlay.classList.contains('hidden')) {
        closeModal();
      }
    });

    // Swipe down to dismiss on mobile
    if (dom.modal) {
      var touchStartY = 0;
      var touchMoved = false;

      dom.modal.addEventListener('touchstart', function (e) {
        // Only track single-finger touches at the top of scrolled content
        if (e.touches.length === 1 && dom.modal.scrollTop <= 0) {
          touchStartY = e.touches[0].clientY;
          touchMoved = false;
        }
      }, { passive: true });

      dom.modal.addEventListener('touchmove', function (e) {
        if (touchStartY === 0) return;
        var deltaY = e.touches[0].clientY - touchStartY;
        // Only consider it a swipe if moving downward
        if (deltaY > 10) {
          touchMoved = true;
          // Apply drag resistance (visual feedback)
          var resistance = Math.min(deltaY * 0.4, 60);
          dom.modal.style.transform = 'translateY(' + resistance + 'px)';
          dom.modal.style.transition = 'none';
        }
      }, { passive: true });

      dom.modal.addEventListener('touchend', function () {
        if (touchMoved && touchStartY > 0) {
          var deltaY = 0;
          // Recalculate from the current transform
          var currentTransform = dom.modal.style.transform;
          var match = currentTransform && currentTransform.match(/translateY\((\d+)px\)/);
          if (match) deltaY = parseInt(match[1], 10);

          // Reset transform
          dom.modal.style.transform = '';
          dom.modal.style.transition = '';

          if (deltaY > 40) {
            closeModal();
          }
        }
        touchStartY = 0;
        touchMoved = false;
      });
    }
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
      timeline: $('#history-timeline'),
      filterBtns: document.querySelectorAll('.history-filter-btn'),
      viewBtns: document.querySelectorAll('.history-view-btn'),
      modalOverlay: $('#history-modal-overlay'),
      modal: document.querySelector('.history-modal'),
      modalTitle: $('#history-modal-title'),
      modalTypeBadge: $('#history-modal-type-badge'),
      modalMeta: $('#history-modal-meta'),
      modalBody: $('#history-modal-body'),
      modalClose: $('#history-modal-close'),
      modalCloseBottom: $('#history-modal-close-bottom'),
      modalPrev: $('#history-modal-prev'),
      modalNext: $('#history-modal-next'),
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
