/**
 * module-qin-ershi.js
 * 秦二世必须死 Module — 章节卡片瀑布流 + 筛选 + 详情弹窗 + markdown 渲染
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
    perPage: 12,
    renderedCount: 0,
    likes: {},
    likeThreshold: 3,
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
    return '<div class="qin-ershi-md-body">\n' + blocks.join('\n') + '\n</div>';
  }

  function applyInline(text) {
    return text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  }

  /* ==========================================================
     Likes (localStorage)
     ========================================================== */
  var LIKES_KEY = 'qin-ershi-likes';

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
    var btn = card.querySelector('.qin-ershi-like-btn');
    if (btn) {
      btn.innerHTML = count > 0
        ? '<span class="qin-ershi-like-heart liked">❤️</span><span class="qin-ershi-like-count">' + count + '</span>'
        : '<span class="qin-ershi-like-heart">🤍</span>';
    }
    card.classList.toggle('qin-ershi-card-rainbow', count >= STATE.likeThreshold);
  }

  async function loadNotes() {
    loadLikes();
    var FETCH_TIMEOUT = 15000;
    var controller = new AbortController();
    var timeoutId = setTimeout(function () { controller.abort(); }, FETCH_TIMEOUT);
    try {
      var resp = await fetch('data/qin-ershi-notes.json', { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      var data = await resp.json();
      STATE.notes = data.notes || [];
      renderAll();
    } catch (err) {
      clearTimeout(timeoutId);
      console.warn('Qin Ershi module: failed to load', err.message);
      STATE.notes = [];
      renderAll();
    }
  }

  function renderStats() {
    var elTotal = $('#stat-qin-ershi-notes');
    var elRange = $('#stat-qin-ershi-range');
    if (elTotal) elTotal.textContent = STATE.notes.length + ' 章';
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

  function typeBadge(type) {
    if (type === '番外') return '<span class="qin-ershi-type-badge qin-ershi-type-side">番外</span>';
    if (type === '设定') return '<span class="qin-ershi-type-badge qin-ershi-type-setting">设定</span>';
    return '<span class="qin-ershi-type-badge qin-ershi-type-main">正文</span>';
  }

  function renderCards(container, notes, startIdx) {
    if (!container) return;

    var html = notes.map(function (note) {
      var excerpt = note.excerpt || '';
      excerpt = excerpt.replace(/[#*>`\[\]\(\)]/g, '').trim();
      if (!excerpt && note.body) {
        excerpt = note.body.replace(/[#*>`\[\]\(\)]/g, '').replace(/\n+/g, ' ').trim().slice(0, 150);
        if (excerpt.length >= 150) excerpt += '...';
      }
      var chapterRow = '';
      if (note.chapter) {
        chapterRow = '<div class="qin-ershi-card-chapter">' + escapeHtml(note.chapter) + '</div>';
      }
      var tagsHTML = '';
      if (note.tags && note.tags.length) {
        tagsHTML = '<div class="qin-ershi-card-tags">' +
          note.tags.map(function (t) { return '<span class="qin-ershi-card-tag">#' + escapeHtml(t) + '</span>'; }).join('') +
        '</div>';
      }
      return '<article class="qin-ershi-card" data-note-id="' + escapeHtml(note.id) + '" tabindex="0">' +
        typeBadge(note.type) +
        '<h3 class="qin-ershi-card-title">' + escapeHtml(note.title) + '</h3>' +
        chapterRow +
        '<p class="qin-ershi-card-excerpt">' + escapeHtml(excerpt) + '</p>' +
        tagsHTML +
        '<div class="qin-ershi-card-footer">' +
          '<button class="qin-ershi-like-btn" data-note-id="' + escapeHtml(note.id) + '">' +
            '<span class="qin-ershi-like-heart">🤍</span>' +
          '</button>' +
          '<span class="qin-ershi-card-date">' + formatDate(note.date) + '</span>' +
          '<span class="qin-ershi-card-detail-btn">阅读 →</span>' +
        '</div>' +
      '</article>';
    }).join('');

    if (startIdx === 0) {
      container.innerHTML = html;
    } else {
      var existingBtn = container.querySelector('.qin-ershi-load-more');
      if (existingBtn) existingBtn.remove();
      container.insertAdjacentHTML('beforeend', html);
    }

    container.querySelectorAll('.qin-ershi-card').forEach(function (card) {
      if (card.dataset.bound === '1') return;
      card.dataset.bound = '1';
      card.addEventListener('click', function () { var id = card.dataset.noteId; if (id) openModal(id); });
      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); var id = card.dataset.noteId; if (id) openModal(id); }
      });

      var likeBtn = card.querySelector('.qin-ershi-like-btn');
      if (likeBtn) {
        likeBtn.addEventListener('click', function (e) {
          onLikeClick(e, card);
        });
      }

      var noteId = card.dataset.noteId;
      if (noteId) {
        var count = getLikeCount(noteId);
        if (count > 0) updateLikeDisplay(card, count);
      }
    });
  }

  function renderLoadMoreButton(container, remaining) {
    if (!container || remaining <= 0) return;
    var existingBtn = container.querySelector('.qin-ershi-load-more');
    if (existingBtn) existingBtn.remove();
    container.insertAdjacentHTML('beforeend',
      '<div class="qin-ershi-load-more-wrap"><button class="qin-ershi-load-more" id="qin-ershi-load-more">' +
      '加载更多 <span class="qin-ershi-load-more-count">（还有 ' + remaining + ' 章）</span></button></div>'
    );
    var btn = $('#qin-ershi-load-more');
    if (btn) btn.addEventListener('click', loadMore);
  }

  function loadMore() {
    var filtered = getFilteredNotes();
    var start = STATE.renderedCount;
    var end = Math.min(start + STATE.perPage, filtered.length);
    var batch = filtered.slice(start, end);
    if (!batch.length) return;
    renderCards(dom.masonry, batch, start);
    STATE.renderedCount = end;
    var remaining = filtered.length - STATE.renderedCount;
    renderLoadMoreButton(dom.masonry, remaining);
  }

  function renderMasonry() {
    if (!dom.masonry) return;

    var filtered = getFilteredNotes();

    if (!filtered.length) {
      dom.masonry.innerHTML = '<div class="qin-ershi-empty-filter"><p>没有符合条件的章节</p></div>';
      STATE.renderedCount = 0;
      return;
    }

    var firstBatch = filtered.slice(0, STATE.perPage);
    renderCards(dom.masonry, firstBatch, 0);
    STATE.renderedCount = firstBatch.length;

    var remaining = filtered.length - STATE.renderedCount;
    renderLoadMoreButton(dom.masonry, remaining);
  }

  function showModal() {
    if (dom.modalOverlay) {
      dom.modalOverlay.classList.remove('hidden');
      dom.modalOverlay.setAttribute('aria-hidden', 'false');
    }
    document.documentElement.style.overflow = 'hidden';
    if (dom.modal) {
      dom.modal.scrollTop = 0;
      dom.modal.classList.remove('scrolled');
    }
    if (dom.modalClose) dom.modalClose.focus();
  }

  function openModal(noteId) {
    var note = STATE.notes.find(function (n) { return n.id === noteId; });
    if (!note) return;
    STATE.activeNoteId = noteId;
    if (dom.modalTitle) dom.modalTitle.textContent = note.title;
    if (dom.modalTypeBadge) {
      var label = note.type === '番外' ? '番外' : note.type === '设定' ? '设定' : '正文';
      dom.modalTypeBadge.textContent = label;
      dom.modalTypeBadge.className = 'qin-ershi-modal-type-badge' +
        (note.type === '番外' ? ' qin-ershi-type-side' : note.type === '设定' ? ' qin-ershi-type-setting' : ' qin-ershi-type-main');
    }
    if (dom.modalMeta) {
      var metaParts = [];
      if (note.chapter) metaParts.push('<div class="qin-ershi-modal-chapter">📖 ' + escapeHtml(note.chapter) + '</div>');
      metaParts.push('<div class="qin-ershi-modal-date">📅 ' + formatDate(note.date) + '</div>');
      if (note.tags && note.tags.length) {
        metaParts.push('<div class="qin-ershi-modal-tags">' +
          note.tags.map(function (t) { return '<span class="qin-ershi-modal-tag">#' + escapeHtml(t) + '</span>'; }).join('') +
        '</div>');
      }
      dom.modalMeta.innerHTML = metaParts.join('\n');
    }
    if (dom.modalBody) dom.modalBody.innerHTML = renderMarkdown(note.body || '');
    showModal();
  }

  function closeModal() {
    var closingId = STATE.activeNoteId;
    STATE.activeNoteId = null;
    if (dom.modalOverlay) {
      dom.modalOverlay.classList.add('hidden');
      dom.modalOverlay.setAttribute('aria-hidden', 'true');
    }
    document.documentElement.style.overflow = '';
    if (dom.modal) {
      dom.modal.scrollTop = 0;
      dom.modal.classList.remove('scrolled');
    }
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
    if (dom.modalCloseBottom) dom.modalCloseBottom.addEventListener('click', closeModal);

    if (dom.modalOverlay) {
      dom.modalOverlay.addEventListener('click', function (e) { if (e.target === dom.modalOverlay) closeModal(); });
    }

    if (dom.modal) {
      dom.modal.addEventListener('scroll', function () {
        if (dom.modal.scrollTop > 8) dom.modal.classList.add('scrolled');
        else dom.modal.classList.remove('scrolled');
      }, { passive: true });
    }

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && dom.modalOverlay && !dom.modalOverlay.classList.contains('hidden')) closeModal();
    });

    if (dom.modal) {
      var touchStartY = 0;
      var touchMoved = false;

      dom.modal.addEventListener('touchstart', function (e) {
        if (e.touches.length === 1 && dom.modal.scrollTop <= 0) {
          touchStartY = e.touches[0].clientY;
          touchMoved = false;
        }
      }, { passive: true });

      dom.modal.addEventListener('touchmove', function (e) {
        if (touchStartY === 0) return;
        var deltaY = e.touches[0].clientY - touchStartY;
        if (deltaY > 10) {
          touchMoved = true;
          var resistance = Math.min(deltaY * 0.4, 60);
          dom.modal.style.transform = 'translateY(' + resistance + 'px)';
          dom.modal.style.transition = 'none';
        }
      }, { passive: true });

      dom.modal.addEventListener('touchend', function () {
        if (touchMoved && touchStartY > 0) {
          var match = dom.modal.style.transform && dom.modal.style.transform.match(/translateY\((\d+)px\)/);
          var deltaY = match ? parseInt(match[1], 10) : 0;
          dom.modal.style.transform = '';
          dom.modal.style.transition = '';
          if (deltaY > 40) closeModal();
        }
        touchStartY = 0;
        touchMoved = false;
      });
    }
  }

  function init() {
    if (STATE.loaded) return;
    dom = {
      loading: $('#qin-ershi-loading'),
      empty: $('#qin-ershi-empty'),
      masonry: $('#qin-ershi-masonry'),
      filterBtns: document.querySelectorAll('.qin-ershi-filter-btn'),
      modalOverlay: $('#qin-ershi-modal-overlay'),
      modal: document.querySelector('.qin-ershi-modal'),
      modalTitle: $('#qin-ershi-modal-title'),
      modalTypeBadge: $('#qin-ershi-modal-type-badge'),
      modalMeta: $('#qin-ershi-modal-meta'),
      modalBody: $('#qin-ershi-modal-body'),
      modalClose: $('#qin-ershi-modal-close'),
      modalCloseBottom: $('#qin-ershi-modal-close-bottom'),
    };
    STATE.loaded = true;
    bindEvents();
    loadNotes();
  }

  if (window.JaterMod) {
    window.JaterMod.register('qin-ershi', { init: init });
  } else {
    document.addEventListener('DOMContentLoaded', function () {
      if (window.JaterMod) window.JaterMod.register('qin-ershi', { init: init });
    });
  }
})();
