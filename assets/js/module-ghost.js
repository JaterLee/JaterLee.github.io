/**
 * module-ghost.js
 * Ghost of Tsushima (对马岛之魂) Module
 * 截图画廊 + 灯箱，通过 dw:modulechange 事件延迟加载
 */
(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);

  /* ==========================================================
     State
     ========================================================== */
  const STATE = {
    images: [],
    currentIndex: -1,
    loaded: false,
  };

  /* ==========================================================
     DOM Refs (populated on init)
     ========================================================== */
  let dom = {};

  /* ==========================================================
     Helpers
     ========================================================== */
  function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  function formatDateShort(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  }

  function formatTime(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }

  /* ==========================================================
     Data Loading
     ========================================================== */
  async function loadImages() {
    try {
      const resp = await fetch('data/ghost-images.json');
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();
      STATE.images = (data.images || []).sort(
        (a, b) => new Date(b.date_taken) - new Date(a.date_taken)
      );
      render();
    } catch (err) {
      console.error('Ghost module: failed to load ghost-images.json', err.message);
      if (dom.galleryLoading) dom.galleryLoading.classList.add('hidden');
      if (dom.galleryError) dom.galleryError.classList.remove('hidden');
    }
  }

  /* ==========================================================
     Stats
     ========================================================== */
  function renderStats() {
    if (!STATE.images.length) return;

    const statImages = $('#stat-ghost-images');
    if (statImages) statImages.textContent = STATE.images.length + ' 张';

    const statRange = $('#stat-ghost-range');
    if (!statRange) return;

    const dates = STATE.images
      .map((img) => img.date_taken)
      .filter(Boolean)
      .sort();
    if (dates.length) {
      const first = formatDateShort(dates[0]);
      const last = formatDateShort(dates[dates.length - 1]);
      statRange.textContent = first === last ? first : first + ' — ' + last;
    }
  }

  /* ==========================================================
     Gallery Grid Rendering
     ========================================================== */
  function render() {
    if (dom.galleryLoading) dom.galleryLoading.classList.add('hidden');

    if (!STATE.images.length) {
      if (dom.galleryEmpty) dom.galleryEmpty.classList.remove('hidden');
      return;
    }

    if (dom.galleryEmpty) dom.galleryEmpty.classList.add('hidden');
    if (dom.galleryGrid) dom.galleryGrid.classList.remove('hidden');

    renderStats();

    dom.galleryGrid.innerHTML = STATE.images.map((img, index) => {
      return `
        <div class="ghost-gallery-card" role="listitem" tabindex="0"
             data-index="${index}"
             aria-label="对马岛截图：${formatDate(img.date_taken)}">
          <img
            class="ghost-gallery-card-img"
            src="images/screenshots/ghost/thumb/${img.id}.webp"
            alt="对马岛之魂截图 — ${formatDate(img.date_taken)}"
            loading="lazy"
          >
          <div class="ghost-gallery-card-overlay">
            <span class="ghost-gallery-card-date">${formatDateShort(img.date_taken)}</span>
            <span class="ghost-gallery-card-time">${formatTime(img.date_taken)}</span>
          </div>
        </div>
      `;
    }).join('');

    // Bind click and keyboard events
    dom.galleryGrid.querySelectorAll('.ghost-gallery-card').forEach((card) => {
      card.addEventListener('click', () => {
        const idx = parseInt(card.dataset.index);
        openLightbox(idx);
      });
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          const idx = parseInt(card.dataset.index);
          openLightbox(idx);
        }
      });
    });
  }

  /* ==========================================================
     Lightbox
     ========================================================== */
  function openLightbox(index) {
    if (!dom.lightbox) return;
    STATE.currentIndex = index;
    updateLightboxImage();
    dom.lightbox.classList.remove('hidden');
    dom.lightbox.setAttribute('aria-hidden', 'false');
    document.documentElement.style.overflow = 'hidden';
    const closeBtn = dom.lightbox.querySelector('.ghost-lightbox-close');
    if (closeBtn) closeBtn.focus();
  }

  function closeLightbox() {
    if (!dom.lightbox) return;
    const returningCard = STATE.currentIndex >= 0
      ? dom.galleryGrid.querySelector('[data-index="' + STATE.currentIndex + '"]')
      : null;
    STATE.currentIndex = -1;
    dom.lightbox.classList.add('hidden');
    dom.lightbox.setAttribute('aria-hidden', 'true');
    document.documentElement.style.overflow = '';
    if (returningCard) returningCard.focus();
  }

  function updateLightboxImage() {
    const img = STATE.images[STATE.currentIndex];
    if (!img) return;

    if (dom.lightboxImg) {
      dom.lightboxImg.style.opacity = '0';
      setTimeout(function() {
        dom.lightboxImg.src = 'images/screenshots/ghost/full/' + img.id + '.webp';
        dom.lightboxImg.alt = '对马岛之魂截图 — ' + formatDate(img.date_taken);
        dom.lightboxImg.style.opacity = '1';
      }, 80);
    }

    if (dom.lightboxDate) dom.lightboxDate.textContent = formatDate(img.date_taken);
    if (dom.lightboxTime) dom.lightboxTime.textContent = formatTime(img.date_taken);
    if (dom.lightboxResolution) dom.lightboxResolution.textContent = (img.width || '?') + ' × ' + (img.height || '?');
    if (dom.lightboxCounter) dom.lightboxCounter.textContent = (STATE.currentIndex + 1) + ' / ' + STATE.images.length;
  }

  function showPrev() {
    if (STATE.images.length === 0) return;
    STATE.currentIndex = (STATE.currentIndex - 1 + STATE.images.length) % STATE.images.length;
    updateLightboxImage();
  }

  function showNext() {
    if (STATE.images.length === 0) return;
    STATE.currentIndex = (STATE.currentIndex + 1) % STATE.images.length;
    updateLightboxImage();
  }

  /* ==========================================================
     Event Bindings
     ========================================================== */
  function bindEvents() {
    // Lightbox controls
    var lbClose = dom.lightbox ? dom.lightbox.querySelector('.ghost-lightbox-close') : null;
    var lbBg = dom.lightbox ? dom.lightbox.querySelector('.ghost-lightbox-bg') : null;
    var lbPrev = dom.lightbox ? dom.lightbox.querySelector('.ghost-lightbox-prev') : null;
    var lbNext = dom.lightbox ? dom.lightbox.querySelector('.ghost-lightbox-next') : null;

    if (lbClose) lbClose.addEventListener('click', closeLightbox);
    if (lbBg) lbBg.addEventListener('click', closeLightbox);
    if (lbPrev) lbPrev.addEventListener('click', showPrev);
    if (lbNext) lbNext.addEventListener('click', showNext);

    // Keyboard navigation
    document.addEventListener('keydown', function (e) {
      if (!dom.lightbox || dom.lightbox.classList.contains('hidden')) return;

      switch (e.key) {
        case 'Escape':
          closeLightbox();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          showPrev();
          break;
        case 'ArrowRight':
          e.preventDefault();
          showNext();
          break;
      }
    });

    // Touch swipe support for lightbox
    var touchStartX = 0;
    var touchStartY = 0;

    if (dom.lightbox) {
      dom.lightbox.addEventListener('touchstart', function (e) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
      });

      dom.lightbox.addEventListener('touchend', function (e) {
        var dx = e.changedTouches[0].clientX - touchStartX;
        var dy = e.changedTouches[0].clientY - touchStartY;

        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
          if (dx > 0) {
            showPrev();
          } else {
            showNext();
          }
        }
      });
    }

    // Retry button
    var btnRetry = $('#btn-retry-ghost');
    if (btnRetry) {
      btnRetry.addEventListener('click', async function () {
        if (dom.galleryError) dom.galleryError.classList.add('hidden');
        if (dom.galleryLoading) dom.galleryLoading.classList.remove('hidden');
        await loadImages();
      });
    }
  }

  /* ==========================================================
     Init
     ========================================================== */
  function init() {
    if (STATE.loaded) return;

    // Collect DOM refs
    dom = {
      galleryGrid: $('#ghost-gallery-grid'),
      galleryLoading: $('#ghost-gallery-loading'),
      galleryError: $('#ghost-gallery-error'),
      galleryEmpty: $('#ghost-gallery-empty'),
      lightbox: $('#ghost-lightbox'),
      lightboxImg: $('#ghost-lightbox-img'),
      lightboxDate: $('#ghost-lightbox-date'),
      lightboxTime: $('#ghost-lightbox-time'),
      lightboxResolution: $('#ghost-lightbox-resolution'),
      lightboxCounter: $('#ghost-lightbox-counter'),
    };

    STATE.loaded = true;
    bindEvents();
    loadImages();
  }

  /* ==========================================================
     Module Activation Listener
     Lazy-load on first Ghost module activation
     ========================================================== */
  window.addEventListener('dw:modulechange', function (e) {
    if (e.detail && e.detail.module === 'ghost') {
      init();
    }
  });
})();
