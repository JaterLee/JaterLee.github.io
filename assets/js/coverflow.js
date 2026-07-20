/**
 * coverflow.js
 * 3D Coverflow 截图轮播 — 可复用组件
 * 暴露 window.JaterCoverflow.create(config) 工厂函数。
 *
 * 依赖：core.js (Jater), ui-kit.js (JaterUI)
 */
(function () {
  'use strict';

  var $ = window.Jater.$;
  var formatDateShort = window.Jater.formatDateShort;

  /* ==========================================================
     Factory: JaterCoverflow.create(config)

     config 字段：
       container   — 容器选择器（如 '#coverflow-section-ghost'）
       dataUrl     — 截图数据 JSON URL（与 images 二选一）
       images      — 预加载的图片数组（与 dataUrl 二选一），需含 id, date_taken
       thumbPath   — 缩略图路径前缀（如 'images/screenshots/ghost/thumb/'）
       fullPath    — 全尺寸图路径前缀（如 'images/screenshots/ghost/full/'）
       title       — 区块标题（默认 '📸 冒险瞬间'）
       description — 区块描述
       altPrefix   — 图片 alt 前缀（如 '对马岛之魂截图'）
       galleryLink — "浏览全部"链接 href（可选）
       moduleClass — 附加到 section 的 CSS 类（可选，如 'ghost-coverflow'）

     返回 { navigateTo, showPrev, showNext, destroy, getImages }
     ========================================================== */
  function createCoverflow(config) {
    config = config || {};

    /* ---- Namespace: derive from container ID ---- */
    var containerId = (config.container || '#coverflow-section').replace('#', '');
    var ns = containerId.replace('coverflow-section-', '').replace('coverflow-section', 'grounded');

    /* ---- Unique internal IDs ---- */
    function id(name) { return ns + '-cf-' + name; }

    /* ---- State (per-instance) ---- */
    var STATE = {
      images: [],
      centerIndex: 0,
      autoTimer: null,
      paused: false,
    };

    /* ---- DOM refs (populated by createDOM) ---- */
    var container, stage, dotsContainer, prevBtn, nextBtn, emptyEl;
    var lightbox = null;
    var destroyed = false;

    /* ---- Config defaults ---- */
    var TITLE = config.title || '📸 冒险瞬间';
    var DESC = config.description || '';
    var ALT_PREFIX = config.altPrefix || '截图';
    var GALLERY_LINK = config.galleryLink || '';
    var THUMB_PATH = config.thumbPath || 'images/screenshots/thumb/';
    var FULL_PATH = config.fullPath || 'images/screenshots/full/';

    /* ==========================================================
       Helpers
       ========================================================== */
    function getVisibleRange() {
      var total = STATE.images.length;
      if (total <= 1) return [0];
      if (total === 2) return [-1, 0];
      if (total <= 4) return [-1, 0, 1];
      return [-2, -1, 0, 1, 2];
    }

    function getPosOffset(imgIndex) {
      var total = STATE.images.length;
      if (total === 0) return null;

      var diff = imgIndex - STATE.centerIndex;
      var half = Math.floor(total / 2);
      if (diff > half) diff -= total;
      if (diff < -half) diff += total;

      var visibleRange = getVisibleRange();
      var minVisible = visibleRange[0];
      var maxVisible = visibleRange[visibleRange.length - 1];

      if (diff < minVisible || diff > maxVisible) {
        if (diff < 0) return minVisible - 1;
        return maxVisible + 1;
      }
      return diff;
    }

    /* ==========================================================
       DOM Creation (inside container)
       ========================================================== */
    function createDOM() {
      container = $(config.container);
      if (!container) return false;

      // Add module-specific class
      if (config.moduleClass) {
        container.classList.add(config.moduleClass);
      }

      var galleryLinkHTML = GALLERY_LINK
        ? '<div class="coverflow-gallery-link"><a href="' + GALLERY_LINK + '">浏览摄影日志 →</a></div>'
        : '';

      container.innerHTML =
        '<div class="coverflow-header">' +
          '<h2 class="section-title">' + TITLE + '</h2>' +
          (DESC ? '<p class="section-desc">' + DESC + '</p>' : '') +
        '</div>' +
        '<div class="coverflow-stage" id="' + id('stage') + '"></div>' +
        '<button class="coverflow-arrow coverflow-arrow-prev" id="' + id('prev') + '" aria-label="上一张">' +
          '<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.5" d="M15 18l-6-6 6-6"/></svg>' +
        '</button>' +
        '<button class="coverflow-arrow coverflow-arrow-next" id="' + id('next') + '" aria-label="下一张">' +
          '<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.5" d="M9 18l6-6-6-6"/></svg>' +
        '</button>' +
        '<div class="coverflow-dots" id="' + id('dots') + '"></div>' +
        galleryLinkHTML +
        '<div class="coverflow-empty hidden" id="' + id('empty') + '">' +
          '<div class="coverflow-empty-icon">📸</div>' +
          '<p>还没有截图，去游戏中拍照吧</p>' +
        '</div>' +
        '<div class="coverflow-lightbox hidden" id="' + id('lightbox') + '" aria-hidden="true">' +
          '<div class="coverflow-lb-bg" id="' + id('lb-bg') + '"></div>' +
          '<button class="coverflow-lb-close" id="' + id('lb-close') + '" aria-label="关闭">' +
            '<svg viewBox="0 0 24 24" width="32" height="32" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" d="M18 6L6 18M6 6l12 12"/></svg>' +
          '</button>' +
          '<button class="coverflow-lb-arrow coverflow-lb-prev" id="' + id('lb-prev') + '" aria-label="上一张">' +
            '<svg viewBox="0 0 24 24" width="36" height="36" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" d="M15 18l-6-6 6-6"/></svg>' +
          '</button>' +
          '<button class="coverflow-lb-arrow coverflow-lb-next" id="' + id('lb-next') + '" aria-label="下一张">' +
            '<svg viewBox="0 0 24 24" width="36" height="36" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" d="M9 18l6-6-6-6"/></svg>' +
          '</button>' +
          '<div class="coverflow-lb-content">' +
            '<img src="" alt="" id="' + id('lb-img') + '">' +
          '</div>' +
          '<div class="coverflow-lb-info">' +
            '<span id="' + id('lb-date') + '"></span>' +
            '<span id="' + id('lb-counter') + '"></span>' +
          '</div>' +
        '</div>';

      // Resolve internal DOM refs
      stage = $('#' + id('stage'));
      dotsContainer = $('#' + id('dots'));
      prevBtn = $('#' + id('prev'));
      nextBtn = $('#' + id('next'));
      emptyEl = $('#' + id('empty'));

      return true;
    }

    /* ==========================================================
       Virtual Rendering — only render cards in visible window
       ========================================================== */

    // Maximum absolute position visible = 2 (positions -2..2), +1 buffer = 3
    var WINDOW_HALF = 3;
    // Dot threshold: above this count, use compact counter instead of dots
    var DOT_LIMIT = 20;

    /** Build a single card element */
    function buildCard(idx, pos) {
      var img = STATE.images[idx];
      var card = document.createElement('div');
      card.className = 'coverflow-card';
      card.dataset.pos = pos;
      card.dataset.index = idx;
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', pos === 0 ? 0 : -1);
      card.setAttribute('aria-label', ALT_PREFIX + '：' + formatDateShort(img.date_taken));
      card.innerHTML =
        '<img src="' + THUMB_PATH + img.id + '.webp"' +
        ' alt="' + ALT_PREFIX + ' — ' + formatDateShort(img.date_taken) + '"' +
        ' loading="' + (Math.abs(pos) <= 1 ? 'eager' : 'lazy') + '">' +
        '<div class="coverflow-card-label">' + formatDateShort(img.date_taken) + '</div>';
      return card;
    }

    /** Get indices that should be rendered for the current centerIndex */
    function getWindowIndices() {
      var total = STATE.images.length;
      if (total === 0) return [];
      var indices = [];
      for (var offset = -WINDOW_HALF; offset <= WINDOW_HALF; offset++) {
        var idx = ((STATE.centerIndex + offset) % total + total) % total;
        // Dedup for small image sets (avoid same index appearing twice)
        if (indices.indexOf(idx) === -1) {
          indices.push(idx);
        }
      }
      return indices;
    }

    /**
     * Sync DOM cards with the current window.
     * - Removes cards that fell out of the window
     * - Creates cards that entered the window
     * - Updates positions of all existing cards
     */
    function syncCards() {
      if (!stage) return;

      var total = STATE.images.length;
      if (total === 0) return;

      var needed = getWindowIndices();

      // Index existing cards by their data-index
      var existing = {};
      var cards = stage.querySelectorAll('.coverflow-card');
      cards.forEach(function (card) {
        existing[parseInt(card.dataset.index)] = card;
      });

      // Remove cards no longer in window
      cards.forEach(function (card) {
        var idx = parseInt(card.dataset.index);
        if (needed.indexOf(idx) === -1) {
          card.remove();
        }
      });

      // Create new cards & update existing
      needed.forEach(function (idx) {
        var pos = getPosOffset(idx);
        if (pos === null) return;
        var card = existing[idx];
        if (card) {
          // Update existing card position
          card.dataset.pos = pos;
          card.setAttribute('tabindex', pos === 0 ? 0 : -1);
        } else {
          // Create new card entering the window
          card = buildCard(idx, pos);
          stage.appendChild(card);
        }
      });

      // Update dots
      syncDots();
    }

    /** Initial full render (first load) */
    function renderCardsWindow() {
      if (!stage) return;
      stage.innerHTML = '';
      var needed = getWindowIndices();
      needed.forEach(function (idx) {
        var pos = getPosOffset(idx);
        if (pos === null) return;
        stage.appendChild(buildCard(idx, pos));
      });
    }

    /* ==========================================================
       Dots — compact counter for large sets
       ========================================================== */

    /** Build the dots HTML. For >DOT_LIMIT images, use compact counter. */
    function buildDotsHTML() {
      var total = STATE.images.length;
      if (total <= 1) return '';

      // Compact mode: show "◀ ● 5 / 111 ▶" style counter
      if (total > DOT_LIMIT) {
        return '<button class="coverflow-dot-nav" data-action="prev" aria-label="上一张">◀</button>' +
          '<span class="coverflow-dot-counter">' + (STATE.centerIndex + 1) + ' / ' + total + '</span>' +
          '<button class="coverflow-dot-nav" data-action="next" aria-label="下一张">▶</button>';
      }

      // Full dots mode: one dot per image
      var html = '';
      for (var i = 0; i < total; i++) {
        html += '<button class="coverflow-dot' + (i === STATE.centerIndex ? ' active' : '') + '"' +
          ' data-index="' + i + '" aria-label="第 ' + (i + 1) + ' 张"></button>';
      }
      return html;
    }

    function renderDots() {
      if (!dotsContainer) return;
      dotsContainer.innerHTML = buildDotsHTML();
    }

    /** Update dot active states (called on every navigation) */
    function syncDots() {
      if (!dotsContainer) return;
      var total = STATE.images.length;
      if (total <= 1) return;

      if (total > DOT_LIMIT) {
        // Update compact counter text
        var counter = dotsContainer.querySelector('.coverflow-dot-counter');
        if (counter) counter.textContent = (STATE.centerIndex + 1) + ' / ' + total;
      } else {
        // Update dot active states
        var dots = dotsContainer.querySelectorAll('.coverflow-dot');
        dots.forEach(function (dot) {
          var idx = parseInt(dot.dataset.index);
          dot.classList.toggle('active', idx === STATE.centerIndex);
        });
      }
    }

    function navigateTo(index) {
      if (STATE.images.length === 0) return;
      STATE.centerIndex = ((index % STATE.images.length) + STATE.images.length) % STATE.images.length;
      syncCards();
      resetAutoTimer();
    }

    function showPrev() {
      navigateTo(STATE.centerIndex - 1);
    }

    function showNext() {
      navigateTo(STATE.centerIndex + 1);
    }

    /* ==========================================================
       Auto-rotation
       ========================================================== */
    function startAutoTimer() {
      stopAutoTimer();
      if (STATE.images.length <= 1) return;
      STATE.autoTimer = setInterval(showNext, 4500);
    }

    function stopAutoTimer() {
      if (STATE.autoTimer) {
        clearInterval(STATE.autoTimer);
        STATE.autoTimer = null;
      }
    }

    function resetAutoTimer() {
      stopAutoTimer();
      startAutoTimer();
    }

    /* ==========================================================
       Lightbox (via JaterUI shared component)
       ========================================================== */
    function createLightbox() {
      if (!window.JaterUI || !window.JaterUI.createLightbox) return;

      lightbox = window.JaterUI.createLightbox({
        container: '#' + id('lightbox'),
        img: '#' + id('lb-img'),
        close: '#' + id('lb-close'),
        bg: '#' + id('lb-bg'),
        prev: '#' + id('lb-prev'),
        next: '#' + id('lb-next'),
        texts: {
          date: '#' + id('lb-date'),
          counter: '#' + id('lb-counter'),
        },
        update: function (idx) {
          var img = STATE.images[idx];
          if (!img) return {};
          return {
            src: FULL_PATH + img.id + '.webp',
            alt: ALT_PREFIX + ' — ' + formatDateShort(img.date_taken),
            date: formatDateShort(img.date_taken),
            counter: (idx + 1) + ' / ' + STATE.images.length,
          };
        },
        onPrev: function (idx) {
          var newIdx = ((idx - 1 + STATE.images.length) % STATE.images.length);
          STATE.centerIndex = newIdx;
          syncCards();
          resetAutoTimer();
          return newIdx;
        },
        onNext: function (idx) {
          var newIdx = (idx + 1) % STATE.images.length;
          STATE.centerIndex = newIdx;
          syncCards();
          resetAutoTimer();
          return newIdx;
        },
        onOpen: function () {
          stopAutoTimer();
        },
        onClose: function () {
          startAutoTimer();
        },
      });
    }

    /* ==========================================================
       Event Bindings
       ========================================================== */
    function bindEvents() {
      if (prevBtn) prevBtn.addEventListener('click', showPrev);
      if (nextBtn) nextBtn.addEventListener('click', showNext);

      // Click on cards
      if (stage) {
        stage.addEventListener('click', function (e) {
          var card = e.target.closest('.coverflow-card');
          if (!card) return;
          var idx = parseInt(card.dataset.index);
          var pos = parseInt(card.dataset.pos);
          if (pos === 0) {
            if (lightbox) lightbox.open(STATE.centerIndex);
          } else {
            navigateTo(idx);
          }
        });
      }

      // Click dots (supports both full dots and compact nav buttons)
      if (dotsContainer) {
        dotsContainer.addEventListener('click', function (e) {
          // Compact mode: nav buttons with data-action
          var navBtn = e.target.closest('.coverflow-dot-nav');
          if (navBtn) {
            if (navBtn.dataset.action === 'prev') showPrev();
            else showNext();
            return;
          }
          // Full dots mode: individual dot buttons with data-index
          var dot = e.target.closest('.coverflow-dot');
          if (!dot) return;
          var idx = parseInt(dot.dataset.index);
          navigateTo(idx);
        });
      }

      // Keyboard (scoped: only when container is visible)
      document.addEventListener('keydown', function (e) {
        if (destroyed) return;
        // Skip if lightbox is open
        var lb = $('#' + id('lightbox'));
        if (lb && !lb.classList.contains('hidden')) return;

        // Only when coverflow is in viewport
        if (!container) return;
        var rect = container.getBoundingClientRect();
        if (rect.bottom < 0 || rect.top > window.innerHeight) return;

        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          showPrev();
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          showNext();
        }
      });

      // Touch swipe
      var touchStartX = 0;
      if (stage) {
        stage.addEventListener('touchstart', function (e) {
          touchStartX = e.touches[0].clientX;
          stopAutoTimer();
        });

        stage.addEventListener('touchend', function (e) {
          var dx = e.changedTouches[0].clientX - touchStartX;
          if (Math.abs(dx) > 40) {
            if (dx > 0) showPrev();
            else showNext();
          }
          startAutoTimer();
        });
      }

      // Pause on hover
      if (stage) {
        stage.addEventListener('mouseenter', function () {
          STATE.paused = true;
          stopAutoTimer();
        });

        stage.addEventListener('mouseleave', function () {
          STATE.paused = false;
          startAutoTimer();
        });
      }
    }

    /* ==========================================================
       Data Loading
       ========================================================== */
    function loadData() {
      // If images were passed directly, use them
      if (config.images && config.images.length) {
        STATE.images = config.images.slice().sort(function (a, b) {
          return new Date(b.date_taken) - new Date(a.date_taken);
        });
        onDataReady();
        return;
      }

      // Otherwise fetch from dataUrl
      if (!config.dataUrl) {
        if (emptyEl) emptyEl.classList.remove('hidden');
        return;
      }

      fetch(config.dataUrl)
        .then(function (resp) {
          if (!resp.ok) throw new Error('HTTP ' + resp.status);
          return resp.json();
        })
        .then(function (data) {
          STATE.images = (data.images || []).sort(function (a, b) {
            return new Date(b.date_taken) - new Date(a.date_taken);
          });
          onDataReady();
        })
        .catch(function (err) {
          console.warn('Coverflow (' + ns + '): failed to load images', err.message);
          STATE.images = [];
          if (emptyEl) emptyEl.classList.remove('hidden');
        });
    }

    function onDataReady() {
      if (!STATE.images.length) {
        if (emptyEl) emptyEl.classList.remove('hidden');
        return;
      }

      renderCardsWindow();
      renderDots();
      createLightbox();
      bindEvents();
      startAutoTimer();
    }

    /* ==========================================================
       Init
       ========================================================== */
    function init() {
      if (!createDOM()) return null;
      loadData();
      return api;
    }

    /* ==========================================================
       Destroy
       ========================================================== */
    function destroy() {
      destroyed = true;
      stopAutoTimer();
      if (lightbox) lightbox.close();
      if (container) container.innerHTML = '';
      STATE.images = [];
    }

    /* ==========================================================
       Public API
       ========================================================== */
    var api = {
      navigateTo: navigateTo,
      showPrev: showPrev,
      showNext: showNext,
      destroy: destroy,
      getImages: function () { return STATE.images; },
      getCenterIndex: function () { return STATE.centerIndex; },
    };

    return init();
  }

  /* ==========================================================
     Backward-compatible auto-init for Grounded
     ========================================================== */
  function autoInitGrounded() {
    var section = $('#coverflow-section');
    if (!section) return;

    createCoverflow({
      container: '#coverflow-section',
      dataUrl: 'data/images.json',
      thumbPath: 'images/screenshots/thumb/',
      fullPath: 'images/screenshots/full/',
      title: '📸 冒险瞬间',
      description: '后院冒险中的每一个精彩画面',
      altPrefix: 'Grounded 截图',
      galleryLink: 'gallery.html',
    });
  }

  /* ==========================================================
     Expose
     ========================================================== */
  window.JaterCoverflow = { create: createCoverflow };

  // Auto-init on DOM ready (backward compat for Grounded)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoInitGrounded);
  } else {
    autoInitGrounded();
  }
})();
