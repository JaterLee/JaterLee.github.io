/**
 * dw-navigation.js
 * Dynasty Warriors 无双风格 — 圆盘轮播模块导航
 * 卡片在可见圆盘上环绕，活跃卡在顶部居中，其余透明渐隐
 */
(function () {
  'use strict';

  var $ = function (sel) { return document.querySelector(sel); };
  var $$ = function (sel) { return document.querySelectorAll(sel); };

  /* ==========================================================
     State
     ========================================================== */
  var STATE = {
    modules: [],
    activeModule: 'grounded',
    initialized: {},
    /** Disc ring rotation in degrees */
    discRotation: 0,
    /** Base angle assigned to each module on the disc (degrees) */
    cardAngles: {},
    /** Disc radius in px */
    discRadius: 85,
  };

  /* ==========================================================
     DOM Refs
     ========================================================== */
  var discRing = null;

  /* ==========================================================
     Module Config
     ========================================================== */
  function getFallbackModules() {
    return [
      { id: 'grounded', name: '玩禁闭求生',   subtitle: 'Grounded',           icon: '🕷️', primary_color: '#4a7c59' },
      { id: 'ghost',    name: '玩对马岛之魂', subtitle: 'Ghost of Tsushima',  icon: '🗡️', primary_color: '#c0392b' },
      { id: 'history',  name: '看五代十国史', subtitle: 'Five Dynasties',     icon: '📜', primary_color: '#dbb42c' },
    ];
  }

  async function loadModuleConfig() {
    try {
      var resp = await fetch('data/modules.json');
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      var data = await resp.json();
      STATE.modules = data.modules || [];
    } catch (err) {
      console.warn('Failed to load modules.json, fallback:', err.message);
      STATE.modules = getFallbackModules();
    }
    assignAngles();
    renderAll();
  }

  /* ==========================================================
     Angle Assignment — evenly spaced around the disc
     ========================================================== */
  function assignAngles() {
    var count = STATE.modules.length;
    if (count === 0) return;

    // Cards evenly spaced around full 360° circle
    var step = 360 / count;

    STATE.modules.forEach(function (mod, i) {
      // Card 0 at top (0°), others clockwise
      STATE.cardAngles[mod.id] = i * step;
    });
  }

  /* ==========================================================
     Disc Rotation
     ========================================================== */
  function getTargetDiscRotation() {
    // Rotate disc so active card is at top (0° position)
    var activeAngle = STATE.cardAngles[STATE.activeModule] || 0;
    return -activeAngle;
  }

  function applyDiscRotation(animate) {
    if (!discRing) return;
    var target = getTargetDiscRotation();
    STATE.discRotation = target;

    if (animate === false) {
      discRing.style.transition = 'none';
    } else {
      discRing.style.transition = 'transform 0.7s cubic-bezier(0.25, 0.1, 0.25, 1)';
    }

    discRing.style.transform = 'rotate(' + target + 'deg)';

    if (animate === false) {
      // Force reflow then restore transition
      discRing.offsetHeight;
      discRing.style.transition = 'transform 0.7s cubic-bezier(0.25, 0.1, 0.25, 1)';
    }

    // Update card opacities based on distance from top
    updateCardOpacities();
  }

  /* ==========================================================
     Card Opacity — fade based on angular distance from top
     ========================================================== */
  function updateCardOpacities() {
    if (!discRing) return;
    var cards = discRing.querySelectorAll('.dw-character-card');

    cards.forEach(function (card) {
      var modId = card.getAttribute('data-module');
      var baseAngle = STATE.cardAngles[modId] || 0;
      // Effective angle after disc rotation (where 0 = top)
      var effectiveAngle = ((baseAngle + STATE.discRotation) % 360 + 360) % 360;
      // Normalize to [-180, 180]
      if (effectiveAngle > 180) effectiveAngle -= 360;
      var distFromTop = Math.abs(effectiveAngle);

      // Opacity: fully opaque at top, fades to ~0.25 at farthest
      var opacity = 1 - (distFromTop / 180) * 0.75;
      opacity = Math.max(0.25, Math.min(1, opacity));

      card.style.opacity = opacity;

      // Scale: slightly smaller further from top
      var scale = 1 - (distFromTop / 180) * 0.2;
      scale = Math.max(0.8, Math.min(1, scale));

      // Apply scale to portrait
      var portrait = card.querySelector('.dw-character-portrait');
      if (portrait) {
        portrait.style.transform = 'scale(' + scale + ')';
      }
    });
  }

  /* ==========================================================
     Render All
     ========================================================== */
  function renderAll() {
    discRing = $('#dw-disc-ring');
    if (!discRing) return;

    var radius = STATE.discRadius;

    // ── Render Cards ──
    discRing.innerHTML = '';

    STATE.modules.forEach(function (mod) {
      var angle = STATE.cardAngles[mod.id] || 0;
      var isActive = mod.id === STATE.activeModule;

      var card = document.createElement('button');
      card.className = 'dw-character-card';
      card.setAttribute('role', 'tab');
      card.setAttribute('aria-selected', isActive ? 'true' : 'false');
      card.setAttribute('data-module', mod.id);
      card.setAttribute('data-angle', angle);
      card.setAttribute('tabindex', isActive ? '0' : '-1');
      card.setAttribute('aria-label', mod.name);

      // Position: rotate to angle, then push out to disc edge
      card.style.transform = 'rotate(' + angle + 'deg) translateY(-' + radius + 'px)';

      card.innerHTML =
        '<div class="dw-character-portrait">' + mod.icon + '</div>' +
        '<div class="dw-character-info">' +
        '<div class="dw-character-name">' + mod.name + '</div>' +
        '<div class="dw-character-subtitle">' + mod.subtitle + '</div>' +
        '</div>';

      card.addEventListener('click', function () {
        var modId = card.getAttribute('data-module');
        if (modId && modId !== STATE.activeModule) {
          selectModule(modId);
        }
      });

      discRing.appendChild(card);
    });

    // ── Initial states ──
    updateCardStates();
    applyDiscRotation(false);
    activateModule(STATE.activeModule);
  }

  /* ==========================================================
     Update Card Visual States (front vs side)
     ========================================================== */
  function updateCardStates() {
    if (!discRing) return;
    var cards = discRing.querySelectorAll('.dw-character-card');

    cards.forEach(function (card) {
      var modId = card.getAttribute('data-module');
      var isActive = modId === STATE.activeModule;

      card.setAttribute('aria-selected', isActive ? 'true' : 'false');
      card.setAttribute('tabindex', isActive ? '0' : '-1');

      if (isActive) {
        card.classList.add('dw-card-front');
        card.classList.remove('dw-card-side');
        card.style.opacity = '1';
        card.style.pointerEvents = 'auto';
      } else {
        card.classList.remove('dw-card-front');
        card.classList.add('dw-card-side');
      }
    });

  }

  /* ==========================================================
     Module Activation
     ========================================================== */
  function activateModule(moduleId) {
    $$('.module-content').forEach(function (el) {
      el.classList.remove('active');
    });

    var target = $('#module-' + moduleId);
    if (target) {
      target.classList.add('active');
      var rightPanel = $('#dw-right-panel');
      if (rightPanel) rightPanel.scrollTop = 0;
    }

    var firstLoad = !STATE.initialized[moduleId];
    window.dispatchEvent(new CustomEvent('dw:modulechange', {
      detail: { module: moduleId, firstLoad: firstLoad },
    }));
    STATE.initialized[moduleId] = true;

    if (history.replaceState) {
      history.replaceState(null, '', '#' + moduleId);
    }
  }

  function selectModule(moduleId) {
    if (moduleId === STATE.activeModule) return;
    STATE.activeModule = moduleId;

    applyDiscRotation(true);
    updateCardStates();
    activateModule(moduleId);
  }

  /* ==========================================================
     Navigation
     ========================================================== */
  function navigateNext() {
    var ids = STATE.modules.map(function (m) { return m.id; });
    var idx = ids.indexOf(STATE.activeModule);
    selectModule(ids[(idx + 1) % ids.length]);
  }

  function navigatePrev() {
    var ids = STATE.modules.map(function (m) { return m.id; });
    var idx = ids.indexOf(STATE.activeModule);
    selectModule(ids[(idx - 1 + ids.length) % ids.length]);
  }

  /* ==========================================================
     Keyboard
     ========================================================== */
  function handleKeyboard(e) {
    var focused = document.activeElement;
    if (!focused || !focused.classList.contains('dw-character-card')) return;

    var ids = STATE.modules.map(function (m) { return m.id; });
    var idx = ids.indexOf(STATE.activeModule);
    var newIdx = -1;

    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault();
        newIdx = (idx + 1) % ids.length;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault();
        newIdx = (idx - 1 + ids.length) % ids.length;
        break;
    }

    if (newIdx >= 0 && newIdx !== idx) {
      selectModule(ids[newIdx]);
      var activeCard = discRing ? discRing.querySelector('.dw-card-front') : null;
      if (activeCard) activeCard.focus();
    }
  }

  /* ==========================================================
     Events
     ========================================================== */
  function bindEvents() {
    document.addEventListener('keydown', handleKeyboard);

    // Wheel on disc area
    if (discRing) {
      discRing.addEventListener('wheel', function (e) {
        e.preventDefault();
        if (e.deltaY > 0 || e.deltaX > 0) {
          navigateNext();
        } else {
          navigatePrev();
        }
      }, { passive: false });
    }
  }

  /* ==========================================================
     URL Hash
     ========================================================== */
  function checkInitialHash() {
    var hash = window.location.hash.replace('#', '');
    var validIds = STATE.modules.map(function (m) { return m.id; });
    if (hash && validIds.includes(hash) && hash !== STATE.activeModule) {
      selectModule(hash);
    }
  }

  /* ==========================================================
     Init
     ========================================================== */
  async function init() {
    await loadModuleConfig();
    bindEvents();
    checkInitialHash();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
