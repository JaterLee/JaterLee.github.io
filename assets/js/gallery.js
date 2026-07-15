/**
 * Grounded Saves — gallery.js
 * 截图画廊：数据加载、网格渲染、Lightbox
 */
(function () {
  'use strict';

  /* ==========================================================
     State
     ========================================================== */
  const STATE = {
    images: [],
    currentIndex: -1,
  };

  /* ==========================================================
     DOM Refs
     ========================================================== */
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const dom = {
    galleryGrid: $('#gallery-grid'),
    galleryLoading: $('#gallery-loading'),
    galleryError: $('#gallery-error'),
    galleryEmpty: $('#gallery-empty'),
    lightbox: $('#lightbox'),
    lightboxImg: $('#lightbox-img'),
    lightboxDate: $('#lightbox-date'),
    lightboxResolution: $('#lightbox-resolution'),
    lightboxCounter: $('#lightbox-counter'),
    statTotal: $('#stat-total'),
    statRange: $('#stat-range'),
  };

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

  /* ==========================================================
     Data Loading
     ========================================================== */
  async function loadImages() {
    try {
      const resp = await fetch('data/images.json');
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();
      STATE.images = (data.images || []).sort(
        (a, b) => new Date(b.date_taken) - new Date(a.date_taken)
      );
      render();
    } catch (err) {
      console.error('Failed to load images:', err);
      dom.galleryLoading.classList.add('hidden');
      dom.galleryError.classList.remove('hidden');
    }
  }

  /* ==========================================================
     Stats
     ========================================================== */
  function renderStats() {
    if (!STATE.images.length) return;

    dom.statTotal.textContent = STATE.images.length + ' 张';

    const dates = STATE.images
      .map((img) => img.date_taken)
      .filter(Boolean)
      .sort();
    if (dates.length) {
      const first = formatDateShort(dates[0]);
      const last = formatDateShort(dates[dates.length - 1]);
      dom.statRange.textContent = first === last ? first : first + ' — ' + last;
    }
  }

  /* ==========================================================
     Grid Rendering
     ========================================================== */
  function render() {
    dom.galleryLoading.classList.add('hidden');

    if (!STATE.images.length) {
      dom.galleryEmpty.classList.remove('hidden');
      return;
    }

    dom.galleryEmpty.classList.add('hidden');
    dom.galleryGrid.classList.remove('hidden');

    renderStats();

    dom.galleryGrid.innerHTML = STATE.images.map((img, index) => {
      return `
        <div class="gallery-card" role="listitem" tabindex="0"
             data-index="${index}"
             aria-label="截图：${formatDate(img.date_taken)}">
          <img
            class="gallery-card-img"
            src="images/screenshots/thumb/${img.id}.webp"
            alt="Grounded 截图 — ${formatDate(img.date_taken)}"
            loading="lazy"
          >
          <div class="gallery-card-overlay">
            <span class="gallery-card-date">${formatDateShort(img.date_taken)}</span>
            <span class="gallery-card-resolution">${img.width || '?'}×${img.height || '?'}</span>
          </div>
        </div>
      `;
    }).join('');

    // Bind click events
    dom.galleryGrid.querySelectorAll('.gallery-card').forEach((card) => {
      card.addEventListener('click', () => {
        const idx = parseInt(card.dataset.index);
        openLightbox(idx);
      });
      // Keyboard: Enter to open
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
    STATE.currentIndex = index;
    updateLightboxImage();
    dom.lightbox.classList.remove('hidden');
    dom.lightbox.setAttribute('aria-hidden', 'false');
    document.documentElement.style.overflow = 'hidden';
    // Focus the lightbox for keyboard nav
    dom.lightbox.querySelector('.lightbox-close').focus();
  }

  function closeLightbox() {
    const returningCard = STATE.currentIndex >= 0
      ? dom.galleryGrid.querySelector(`[data-index="${STATE.currentIndex}"]`)
      : null;
    STATE.currentIndex = -1;
    dom.lightbox.classList.add('hidden');
    dom.lightbox.setAttribute('aria-hidden', 'true');
    document.documentElement.style.overflow = '';
    // Return focus to the card that was open
    if (returningCard) returningCard.focus();
  }

  function updateLightboxImage() {
    const img = STATE.images[STATE.currentIndex];
    if (!img) return;

    // Brief fade by removing and re-adding
    dom.lightboxImg.style.opacity = '0';
    setTimeout(() => {
      dom.lightboxImg.src = `images/screenshots/full/${img.id}.webp`;
      dom.lightboxImg.alt = `Grounded 截图 — ${formatDate(img.date_taken)}`;
      dom.lightboxImg.style.opacity = '1';
    }, 80);

    dom.lightboxDate.textContent = formatDate(img.date_taken);
    dom.lightboxResolution.textContent = `${img.width || '?'} × ${img.height || '?'}`;
    dom.lightboxCounter.textContent = `${STATE.currentIndex + 1} / ${STATE.images.length}`;
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

  // Lightbox close
  $('#lightbox-close').addEventListener('click', closeLightbox);
  $('#lightbox-bg').addEventListener('click', closeLightbox);

  // Lightbox prev/next
  $('#lightbox-prev').addEventListener('click', showPrev);
  $('#lightbox-next').addEventListener('click', showNext);

  // Keyboard navigation
  document.addEventListener('keydown', function (e) {
    if (dom.lightbox.classList.contains('hidden')) return;

    switch (e.key) {
      case 'Escape':
        closeLightbox();
        break;
      case 'ArrowLeft':
        showPrev();
        break;
      case 'ArrowRight':
        showNext();
        break;
    }
  });

  // Touch swipe support for lightbox
  let touchStartX = 0;
  let touchStartY = 0;

  dom.lightbox.addEventListener('touchstart', function (e) {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  });

  dom.lightbox.addEventListener('touchend', function (e) {
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;

    // Only horizontal swipes (ignore vertical scrolls)
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
      if (dx > 0) {
        showPrev();
      } else {
        showNext();
      }
    }
  });

  // Retry button
  $('#btn-retry-gallery')?.addEventListener('click', async function () {
    dom.galleryError.classList.add('hidden');
    dom.galleryLoading.classList.remove('hidden');
    try {
      const resp = await fetch('data/images.json');
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();
      STATE.images = (data.images || []).sort(
        (a, b) => new Date(b.date_taken) - new Date(a.date_taken)
      );
      render();
    } catch {
      dom.galleryLoading.classList.add('hidden');
      dom.galleryError.classList.remove('hidden');
    }
  });

  /* ==========================================================
     Init
     ========================================================== */
  loadImages();
})();
