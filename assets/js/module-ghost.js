/**
 * module-ghost.js
 * Ghost of Tsushima (对马岛之魂) Module
 * 使用共享 Coverflow 组件展示截图，通过 JaterMod 注册，首次激活时懒加载。
 *
 * 依赖：core.js (Jater), ui-kit.js (JaterUI), coverflow.js (JaterCoverflow), module-registry.js (JaterMod)
 */
(function () {
  'use strict';

  var $ = window.Jater.$;
  var formatDate = window.Jater.formatDate;
  var formatDateShort = window.Jater.formatDateShort;
  var getModuleConfig = (window.JaterMod && window.JaterMod.getModuleConfig)
    ? function (id) { return window.JaterMod.getModuleConfig(id); }
    : function () { return null; };

  /* ==========================================================
     Config (from modules.json, with fallback)
     ========================================================== */
  var MODULE_ID = 'ghost';
  var FALLBACK_SC = {
    data_file: 'data/ghost-images.json',
    image_path: 'images/screenshots/ghost',
  };

  function getSC() {
    var cfg = getModuleConfig(MODULE_ID);
    return (cfg && cfg.screenshots) ? cfg.screenshots : FALLBACK_SC;
  }

  /* ==========================================================
     State
     ========================================================== */
  var STATE = {
    images: [],
    loaded: false,
  };

  /* ==========================================================
     Coverflow instance
     ========================================================== */
  var coverflow = null;

  /* ==========================================================
     Data Loading
     ========================================================== */
  async function loadImages() {
    try {
      var sc = getSC();
      var resp = await fetch(sc.data_file);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      var data = await resp.json();
      STATE.images = (data.images || []).sort(function (a, b) {
        return new Date(b.date_taken) - new Date(a.date_taken);
      });
      renderStats();
      initCoverflow();
    } catch (err) {
      console.error('Ghost module: failed to load screenshots data', err.message);
      // Coverflow will handle the empty state via its own empty element
      initCoverflow();
    }
  }

  /* ==========================================================
     Stats
     ========================================================== */
  function renderStats() {
    var statImages = $('#stat-ghost-images');
    if (statImages) statImages.textContent = STATE.images.length + ' 张';

    var statRange = $('#stat-ghost-range');
    if (!statRange) return;

    if (!STATE.images.length) {
      statRange.textContent = '--';
      return;
    }

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
     Coverflow Initialization
     ========================================================== */
  function initCoverflow() {
    if (!window.JaterCoverflow || !window.JaterCoverflow.create) return;

    var sc = getSC();

    coverflow = window.JaterCoverflow.create({
      container: '#coverflow-section-ghost',
      images: STATE.images,
      thumbPath: sc.image_path + '/thumb/',
      fullPath: sc.image_path + '/full/',
      title: '📸 冒险瞬间',
      description: '对马岛武士之路的精彩画面',
      altPrefix: '对马岛之魂截图',
      moduleClass: 'ghost-coverflow',
    });
  }

  /* ==========================================================
     Init — called by JaterMod on first activation
     ========================================================== */
  function init() {
    if (STATE.loaded) return;

    STATE.loaded = true;
    loadImages();
  }

  /* ==========================================================
     Register with module registry
     ========================================================== */
  if (window.JaterMod) {
    window.JaterMod.register('ghost', { init: init });
  } else {
    // Fallback: if registry not loaded yet
    document.addEventListener('DOMContentLoaded', function () {
      if (window.JaterMod) {
        window.JaterMod.register('ghost', { init: init });
      }
    });
  }
})();
