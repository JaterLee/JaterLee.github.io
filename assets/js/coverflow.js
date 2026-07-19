/**
 * coverflow.js
 * 3D Coverflow 截图轮播 — Grounded 模块内使用
 * 使用 JaterUI.createLightbox 共享灯箱组件。
 *
 * 依赖：core.js (Jater), ui-kit.js (JaterUI)
 */
(function () {
  'use strict';

  var $ = window.Jater.$;

  /* ==========================================================
     State
     ========================================================== */
  var STATE = {
    images: [],
    centerIndex: 0,
    autoTimer: null,
    paused: false,
  };

  /* ==========================================================
     DOM Refs — created after load
     ========================================================== */
  var stage, dotsContainer, prevBtn, nextBtn, emptyEl;
  var lightbox = null;

  /* ==========================================================
     Helpers
     ========================================================== */
  var formatDateShort = window.Jater.formatDateShort;

  /**
   * 计算每个卡片在当前 centerIndex 下的视觉位置
   * 返回从 -maxOffset 到 +maxOffset 的数组
   */
  function getVisibleRange() {
    var total = STATE.images.length;
    if (total <= 1) return [0];
    if (total === 2) return [-1, 0];
    // 3-4 cards: show 3
    if (total <= 4) return [-1, 0, 1];
    // 5+: show 5
    return [-2, -1, 0, 1, 2];
  }

  /**
   * 给定图片索引和 centerIndex，返回它的可视偏移
   */
  function getPosOffset(imgIndex) {
    var total = STATE.images.length;
    if (total === 0) return null;

    // 计算环形偏移
    var diff = imgIndex - STATE.centerIndex;

    // 环形绕回
    var half = Math.floor(total / 2);
    if (diff > half) diff -= total;
    if (diff < -half) diff += total;

    var visibleRange = getVisibleRange();
    var minVisible = visibleRange[0];
    var maxVisible = visibleRange[visibleRange.length - 1];

    if (diff < minVisible || diff > maxVisible) {
      // 超出可视范围
      if (diff < 0) return minVisible - 1; // 隐藏在左侧
      return maxVisible + 1; // 隐藏在右侧
    }

    return diff;
  }

  /* ==========================================================
     Rendering
     ========================================================== */
  function createDOM() {
    var section = $('#coverflow-section');
    if (!section) return;

    // Build structure (lightbox HTML included, managed by JaterUI.createLightbox)
    section.innerHTML =
      '<div class="coverflow-header">' +
        '<h2 class="section-title">📸 冒险瞬间</h2>' +
        '<p class="section-desc">后院冒险中的每一个精彩画面</p>' +
      '</div>' +
      '<div class="coverflow-stage" id="coverflow-stage"></div>' +
      '<button class="coverflow-arrow coverflow-arrow-prev" id="coverflow-prev" aria-label="上一张">' +
        '<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.5" d="M15 18l-6-6 6-6"/></svg>' +
      '</button>' +
      '<button class="coverflow-arrow coverflow-arrow-next" id="coverflow-next" aria-label="下一张">' +
        '<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.5" d="M9 18l6-6-6-6"/></svg>' +
      '</button>' +
      '<div class="coverflow-dots" id="coverflow-dots"></div>' +
      '<div class="coverflow-gallery-link">' +
        '<a href="gallery.html">浏览全部截图 →</a>' +
      '</div>' +
      '<div class="coverflow-empty hidden" id="coverflow-empty">' +
        '<div class="coverflow-empty-icon">📸</div>' +
        '<p>还没有截图，去游戏中拍照吧</p>' +
      '</div>' +
      '<div class="coverflow-lightbox hidden" id="coverflow-lightbox" aria-hidden="true">' +
        '<div class="coverflow-lb-bg" id="coverflow-lb-bg"></div>' +
        '<button class="coverflow-lb-close" id="coverflow-lb-close" aria-label="关闭">' +
          '<svg viewBox="0 0 24 24" width="32" height="32" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" d="M18 6L6 18M6 6l12 12"/></svg>' +
        '</button>' +
        '<button class="coverflow-lb-arrow coverflow-lb-prev" id="coverflow-lb-prev" aria-label="上一张">' +
          '<svg viewBox="0 0 24 24" width="36" height="36" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" d="M15 18l-6-6 6-6"/></svg>' +
        '</button>' +
        '<button class="coverflow-lb-arrow coverflow-lb-next" id="coverflow-lb-next" aria-label="下一张">' +
          '<svg viewBox="0 0 24 24" width="36" height="36" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" d="M9 18l6-6-6-6"/></svg>' +
        '</button>' +
        '<div class="coverflow-lb-content">' +
          '<img src="" alt="" id="coverflow-lb-img">' +
        '</div>' +
        '<div class="coverflow-lb-info">' +
          '<span id="coverflow-lb-date"></span>' +
          '<span id="coverflow-lb-counter"></span>' +
        '</div>' +
      '</div>';

    stage = $('#coverflow-stage');
    dotsContainer = $('#coverflow-dots');
    prevBtn = $('#coverflow-prev');
    nextBtn = $('#coverflow-next');
    emptyEl = $('#coverflow-empty');
  }

  function renderCards() {
    if (!stage) return;

    stage.innerHTML = STATE.images
      .map(function (img, i) {
        var pos = getPosOffset(i);
        if (pos === null) return '';
        return '<div class="coverflow-card" data-pos="' + pos + '" data-index="' + i + '"' +
          ' role="button" tabindex="' + (pos === 0 ? 0 : -1) + '"' +
          ' aria-label="截图：' + formatDateShort(img.date_taken) + '">' +
          '<img src="images/screenshots/thumb/' + img.id + '.webp"' +
          ' alt="Grounded 截图 — ' + formatDateShort(img.date_taken) + '"' +
          ' loading="' + (Math.abs(pos) <= 1 ? 'eager' : 'lazy') + '">' +
          '<div class="coverflow-card-label">' + formatDateShort(img.date_taken) + '</div>' +
        '</div>';
      })
      .join('');
  }

  function renderDots() {
    if (!dotsContainer) return;
    if (STATE.images.length <= 1) {
      dotsContainer.innerHTML = '';
      return;
    }

    dotsContainer.innerHTML = STATE.images
      .map(function (_, i) {
        return '<button class="coverflow-dot' + (i === STATE.centerIndex ? ' active' : '') + '"' +
          ' data-index="' + i + '" aria-label="第 ' + (i + 1) + ' 张"></button>';
      })
      .join('');
  }

  function updateCardPositions() {
    var cards = stage ? stage.querySelectorAll('.coverflow-card') : [];
    cards.forEach(function (card) {
      var idx = parseInt(card.dataset.index);
      var pos = getPosOffset(idx);
      card.dataset.pos = pos;

      // Update tabindex
      card.setAttribute('tabindex', pos === 0 ? 0 : -1);
    });

    // Update dots
    var dots = dotsContainer ? dotsContainer.querySelectorAll('.coverflow-dot') : [];
    dots.forEach(function (dot) {
      var idx = parseInt(dot.dataset.index);
      dot.classList.toggle('active', idx === STATE.centerIndex);
    });
  }

  function navigateTo(index) {
    if (STATE.images.length === 0) return;
    // Circular wrap
    STATE.centerIndex = ((index % STATE.images.length) + STATE.images.length) % STATE.images.length;
    updateCardPositions();
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
     Create shared lightbox via JaterUI
     ========================================================== */
  function createLightbox() {
    if (!window.JaterUI || !window.JaterUI.createLightbox) return;

    lightbox = window.JaterUI.createLightbox({
      container: '#coverflow-lightbox',
      img: '#coverflow-lb-img',
      close: '#coverflow-lb-close',
      bg: '#coverflow-lb-bg',
      prev: '#coverflow-lb-prev',
      next: '#coverflow-lb-next',
      texts: {
        date: '#coverflow-lb-date',
        counter: '#coverflow-lb-counter',
      },
      update: function (idx) {
        var img = STATE.images[idx];
        if (!img) return {};
        return {
          src: 'images/screenshots/full/' + img.id + '.webp',
          alt: 'Grounded 截图',
          date: formatDateShort(img.date_taken),
          counter: (idx + 1) + ' / ' + STATE.images.length,
        };
      },
      onPrev: function (idx) {
        var newIdx = ((idx - 1 + STATE.images.length) % STATE.images.length);
        STATE.centerIndex = newIdx;
        updateCardPositions();
        resetAutoTimer();
        return newIdx;
      },
      onNext: function (idx) {
        var newIdx = (idx + 1) % STATE.images.length;
        STATE.centerIndex = newIdx;
        updateCardPositions();
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
    // Arrow buttons
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
          // Click center card → open lightbox
          if (lightbox) lightbox.open(STATE.centerIndex);
        } else {
          // Click side card → bring to center
          navigateTo(idx);
        }
      });
    }

    // Click dots
    if (dotsContainer) {
      dotsContainer.addEventListener('click', function (e) {
        var dot = e.target.closest('.coverflow-dot');
        if (!dot) return;
        var idx = parseInt(dot.dataset.index);
        navigateTo(idx);
      });
    }

    // Keyboard — coverflow navigation only (lightbox keyboard handled by shared component)
    document.addEventListener('keydown', function (e) {
      // Skip if lightbox is open — the shared lightbox handles its own keyboard
      var lb = $('#coverflow-lightbox');
      if (lb && !lb.classList.contains('hidden')) return;

      // Coverflow navigation (only when in viewport)
      var section = $('#coverflow-section');
      if (!section) return;
      var rect = section.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > window.innerHeight) return;

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        showPrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        showNext();
      }
    });

    // Touch swipe on coverflow stage
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
  async function loadImages() {
    try {
      var resp = await fetch('data/images.json');
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      var data = await resp.json();
      STATE.images = (data.images || []).sort(function (a, b) {
        return new Date(b.date_taken) - new Date(a.date_taken);
      });
    } catch (err) {
      console.warn('Coverflow: failed to load images.json', err.message);
      STATE.images = [];
    }

    if (!STATE.images.length) {
      if (emptyEl) emptyEl.classList.remove('hidden');
      return;
    }

    renderCards();
    renderDots();
    updateCardPositions();
    createLightbox();
    bindEvents();
    startAutoTimer();
  }

  /* ==========================================================
     Init
     ========================================================== */
  function init() {
    createDOM();
    loadImages();
  }

  // Wait for DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
