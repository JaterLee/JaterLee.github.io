/**
 * module-wow.js
 * World of Warcraft (魔兽世界) Module
 * 截图画廊 + 灯箱，通过 JaterMod 注册，首次激活时懒加载。
 *
 * 依赖：core.js (Jater), ui-kit.js (JaterUI), module-registry.js (JaterMod)
 */
(function () {
  'use strict';

  var $ = window.Jater.$;
  var formatDate = window.Jater.formatDate;
  var formatDateShort = window.Jater.formatDateShort;
  var formatTime = window.Jater.formatTime;

  /* ==========================================================
     State
     ========================================================== */
  var STATE = {
    images: [],
    loaded: false,
  };

  /* ==========================================================
     DOM Refs + Lightbox
     ========================================================== */
  var dom = {};
  var lightbox = null;

  /* ==========================================================
     Data Loading
     ========================================================== */
  async function loadImages() {
    try {
      var resp = await fetch('data/wow-images.json');
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      var data = await resp.json();
      STATE.images = (data.images || []).sort(function (a, b) {
        return new Date(b.date_taken) - new Date(a.date_taken);
      });
      render();
    } catch (err) {
      console.warn('WoW module: failed to load wow-images.json', err.message);
      if (dom.galleryLoading) dom.galleryLoading.classList.add('hidden');
      if (dom.galleryEmpty) dom.galleryEmpty.classList.remove('hidden');
    }
  }

  /* ==========================================================
     Stats
     ========================================================== */
  function renderStats() {
    if (!STATE.images.length) return;

    var statImages = $('#stat-wow-images');
    if (statImages) statImages.textContent = STATE.images.length + ' 张';

    var statRange = $('#stat-wow-range');
    if (!statRange) return;

    var dates = STATE.images
      .map(function (img) { return img.date_taken; })
      .filter(Boolean)
      .sort();
    if (dates.length) {
      var first = formatDateShort(dates[0]);
      var last = formatDateShort(dates[dates.length - 1]);
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

    dom.galleryGrid.innerHTML = STATE.images.map(function (img, index) {
      return '<div class="wow-gallery-card" role="listitem" tabindex="0"' +
        ' data-index="' + index + '"' +
        ' aria-label="魔兽世界截图：' + formatDate(img.date_taken) + '">' +
        '<img class="wow-gallery-card-img"' +
        ' src="images/screenshots/wow/thumb/' + img.id + '.webp"' +
        ' alt="魔兽世界截图 — ' + formatDate(img.date_taken) + '"' +
        ' loading="lazy">' +
        '<div class="wow-gallery-card-overlay">' +
        '<span class="wow-gallery-card-date">' + formatDateShort(img.date_taken) + '</span>' +
        '<span class="wow-gallery-card-time">' + formatTime(img.date_taken) + '</span>' +
        '</div>' +
      '</div>';
    }).join('');

    // Bind click and keyboard events on cards
    dom.galleryGrid.querySelectorAll('.wow-gallery-card').forEach(function (card) {
      card.addEventListener('click', function () {
        var idx = parseInt(card.dataset.index);
        if (lightbox) lightbox.open(idx);
      });
      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          var idx = parseInt(card.dataset.index);
          if (lightbox) lightbox.open(idx);
        }
      });
    });
  }

  /* ==========================================================
     Create shared lightbox via JaterUI
     ========================================================== */
  function createLightbox() {
    if (!window.JaterUI || !window.JaterUI.createLightbox) return;

    lightbox = window.JaterUI.createLightbox({
      container: '#wow-lightbox',
      img: '#wow-lightbox-img',
      close: '.wow-lightbox-close',
      bg: '.wow-lightbox-bg',
      prev: '.wow-lightbox-prev',
      next: '.wow-lightbox-next',
      texts: {
        date: '#wow-lightbox-date',
        time: '#wow-lightbox-time',
        resolution: '#wow-lightbox-resolution',
        counter: '#wow-lightbox-counter',
      },
      update: function (idx) {
        var img = STATE.images[idx];
        if (!img) return {};
        return {
          src: 'images/screenshots/wow/full/' + img.id + '.webp',
          alt: '魔兽世界截图 — ' + formatDate(img.date_taken),
          date: formatDate(img.date_taken),
          time: formatTime(img.date_taken),
          resolution: (img.width || '?') + ' × ' + (img.height || '?'),
          counter: (idx + 1) + ' / ' + STATE.images.length,
        };
      },
      onPrev: function (idx) {
        if (STATE.images.length === 0) return idx;
        return (idx - 1 + STATE.images.length) % STATE.images.length;
      },
      onNext: function (idx) {
        if (STATE.images.length === 0) return idx;
        return (idx + 1) % STATE.images.length;
      },
      onClose: function (idx) {
        // Return focus to the gallery card
        if (idx >= 0 && dom.galleryGrid) {
          var card = dom.galleryGrid.querySelector('[data-index="' + idx + '"]');
          if (card) card.focus();
        }
      },
    });
  }

  /* ==========================================================
     Init — called by JaterMod on first activation
     ========================================================== */
  function init() {
    if (STATE.loaded) return;

    // Collect DOM refs
    dom = {
      galleryGrid: $('#wow-gallery-grid'),
      galleryLoading: $('#wow-gallery-loading'),
      galleryError: $('#wow-gallery-error'),
      galleryEmpty: $('#wow-gallery-empty'),
    };

    STATE.loaded = true;
    createLightbox();
    loadImages();
  }

  /* ==========================================================
     Register with module registry
     ========================================================== */
  if (window.JaterMod) {
    window.JaterMod.register('wow', { init: init });
  } else {
    document.addEventListener('DOMContentLoaded', function () {
      if (window.JaterMod) {
        window.JaterMod.register('wow', { init: init });
      }
    });
  }
})();
