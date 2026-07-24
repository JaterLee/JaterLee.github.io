/**
 * dw-navigation.js
 * Dynasty Warriors 无双风格 — 弧形堆叠卡片模块导航
 * 卡片沿纵向弧线排列，选中项向左鼓出最大，
 * 越远越回收（更靠右、更小、旋转角度更大），
 * 形成一条向左凸出的弧线。
 * 支持滚轮 / 键盘 / 触摸滑动 / 点击切换。
 *
 * 依赖：core.js (window.Jater), module-registry.js (window.JaterMod)
 */
(function () {
  'use strict';

  var $ = window.Jater.$;
  var $$ = window.Jater.$$;

  /* ==========================================================
     Arc Trajectory Parameters
     Adjusted for ~280px left panel, 200px card width
     ========================================================== */
  var ARC = {
    ySpacing:    85,    // vertical spacing between cards (px)
    bulgeX:      35,    // active card max left bulge (px)
    retractStep: 48,    // retract per step back toward center (px)
    rotateStep:  3,     // rotation degrees per step
    maxVisible:  4,     // hide cards beyond this distance
    activeScale: 1.28,  // active card scale (slightly larger than 1)
    minScale:    0.7,   // minimum scale
    scaleStep:   0.14,  // scale reduction per step
    minOpacity:  0.15,  // minimum opacity
    opacityStep: 0.42,  // opacity reduction per step
  };

  /* ==========================================================
     State
     ========================================================== */
  var STATE = {
    modules: [],
    activeModule: 'grounded',
    activeIndex: 0,
  };

  /* ==========================================================
     DOM Refs
     ========================================================== */
  var discRing = null;
  var stage = null;
  var cards = [];

  /* ==========================================================
     Module Config
     ========================================================== */
  function getFallbackModules() {
    return [
      { id: 'grounded', name: '玩禁闭求生',   subtitle: 'Grounded',           icon: '🕷️', primary_color: '#4a7c59' },
      { id: 'ghost',    name: '玩对马岛之魂', subtitle: 'Ghost of Tsushima',  icon: '🗡️', primary_color: '#c0392b' },
      { id: 'history',  name: '看五代十国史', subtitle: 'Five Dynasties',     icon: '📜', primary_color: '#dbb42c' }
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
    // Inject configs into module registry so modules can read their settings
    if (window.JaterMod && window.JaterMod.setModuleConfigs) {
      window.JaterMod.setModuleConfigs(STATE.modules);
    }
    // Resolve active index
    var idx = STATE.modules.findIndex(function (m) { return m.id === STATE.activeModule; });
    STATE.activeIndex = idx >= 0 ? idx : 0;
    STATE.activeModule = STATE.modules[STATE.activeIndex] ? STATE.modules[STATE.activeIndex].id : 'grounded';
    renderAll();
    render();
    // Activate default module via registry (modules are already registered by now)
    if (window.JaterMod.isRegistered(STATE.activeModule)) {
      window.JaterMod.activate(STATE.activeModule);
    }
  }

  /* ==========================================================
     Shortest delta (cyclic wrapping)
     ========================================================== */
  function shortestDelta(i, cur, n) {
    var d = i - cur;
    if (d > n / 2) d -= n;
    if (d < -n / 2) d += n;
    return d;
  }

  /* ==========================================================
     Render All Cards (once)
     ========================================================== */
  function renderAll() {
    discRing = $('#dw-disc-ring');
    if (!discRing) return;

    discRing.innerHTML = '';
    cards = [];

    STATE.modules.forEach(function (mod, i) {
      var el = document.createElement('button');
      el.className = 'dw-stack-card';
      el.setAttribute('role', 'tab');
      el.setAttribute('data-module', mod.id);
      el.setAttribute('aria-label', mod.name);
      el.setAttribute('data-index', i);

      el.innerHTML =
        '<div class="dw-stack-card-inner">' +
          '<span class="dw-stack-card-icon">' + mod.icon + '</span>' +
          '<div class="dw-stack-card-text">' +
            '<span class="dw-stack-card-name">' + mod.name + '</span>' +
            '<span class="dw-stack-card-subtitle">' + mod.subtitle + '</span>' +
          '</div>' +
        '</div>';

      el.addEventListener('click', function () {
        var modId = el.getAttribute('data-module');
        if (modId && modId !== STATE.activeModule) {
          goToModule(modId);
        }
      });

      discRing.appendChild(el);
      cards.push(el);
    });
  }

  /* ==========================================================
     Render — apply arc positions to all cards
     ========================================================== */
  function render() {
    var N = STATE.modules.length;
    var cur = STATE.activeIndex;

    // 移动端由 CSS 控制横向滚动，JS 跳过 arc 定位
    if (window.innerWidth <= 639) {
      cards.forEach(function (el, i) {
        el.style.transform = '';
        el.style.opacity = '';
        el.style.zIndex = '';
        el.style.filter = '';
        el.style.pointerEvents = '';

        var isActive = i === cur;
        el.classList.toggle('dw-card-front', isActive);
        el.classList.toggle('dw-card-side', !isActive);
        el.setAttribute('aria-selected', isActive ? 'true' : 'false');
        el.setAttribute('tabindex', isActive ? '0' : '-1');
      });
      return;
    }

    cards.forEach(function (el, i) {
      var delta = shortestDelta(i, cur, N);
      var absD = Math.abs(delta);

      var y = delta * ARC.ySpacing;
      var retract = Math.min(absD, ARC.maxVisible) * ARC.retractStep;
      var x = -(ARC.bulgeX - retract);
      var rotate = delta * ARC.rotateStep;
      var scale = Math.max(ARC.minScale, ARC.activeScale - absD * ARC.scaleStep);
      var opacity = absD > ARC.maxVisible ? 0 : Math.max(ARC.minOpacity, 1 - absD * ARC.opacityStep);
      var zIndex = 100 - absD;
      var blur = absD === 0 ? 0 : Math.min(absD * 0.5, 2);
      var brightness = 1 - absD * 0.1;

      el.style.transform =
        'translate(-50%, -50%) translate3d(' + x + 'px, ' + y + 'px, 0) rotate(' + rotate + 'deg) scale(' + scale + ')';
      el.style.opacity = opacity;
      el.style.zIndex = zIndex;
      el.style.filter = absD === 0
        ? 'blur(0px) brightness(1)'
        : 'blur(' + blur + 'px) brightness(' + brightness + ')';
      el.style.pointerEvents = absD > ARC.maxVisible ? 'none' : 'auto';

      var isActive = absD === 0;
      if (isActive) {
        el.classList.add('dw-card-front');
        el.classList.remove('dw-card-side');
        el.setAttribute('aria-selected', 'true');
        el.setAttribute('tabindex', '0');
      } else {
        el.classList.remove('dw-card-front');
        el.classList.add('dw-card-side');
        el.setAttribute('aria-selected', 'false');
        el.setAttribute('tabindex', '-1');
      }
    });
  }

  /* ==========================================================
     Module Navigation — delegates to JaterMod registry
     ========================================================== */
  function goToModule(moduleId) {
    if (moduleId === STATE.activeModule) return;
    var idx = STATE.modules.findIndex(function (m) { return m.id === moduleId; });
    if (idx < 0) return;
    STATE.activeModule = moduleId;
    STATE.activeIndex = idx;
    render();
    window.JaterMod.activate(moduleId);
  }

  function goTo(index) {
    var N = STATE.modules.length;
    var idx = ((index % N) + N) % N;
    var moduleId = STATE.modules[idx] ? STATE.modules[idx].id : STATE.activeModule;
    STATE.activeModule = moduleId;
    STATE.activeIndex = idx;
    render();
    window.JaterMod.activate(moduleId);
  }

  function navigateNext() {
    goTo(STATE.activeIndex + 1);
  }

  function navigatePrev() {
    goTo(STATE.activeIndex - 1);
  }

  /* ==========================================================
     Keyboard — ↑ / ← = prev, ↓ / → = next
     ========================================================== */
  function handleKeyboard(e) {
    // Only handle if stage is visible (left panel is open)
    if (!stage || stage.offsetParent === null) return;

    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowRight':
        e.preventDefault();
        navigateNext();
        break;
      case 'ArrowUp':
      case 'ArrowLeft':
        e.preventDefault();
        navigatePrev();
        break;
    }
  }

  /* ==========================================================
     Touch Swipe
     ========================================================== */
  var touchStartY = 0;

  function handleTouchStart(e) {
    touchStartY = e.touches[0].clientY;
  }

  function handleTouchEnd(e) {
    if (touchStartY === 0) return;
    var dy = e.changedTouches[0].clientY - touchStartY;
    if (Math.abs(dy) > 40) {
      if (dy < 0) navigateNext();   // swipe up → next
      else navigatePrev();          // swipe down → prev
    }
    touchStartY = 0;
  }

  /* ==========================================================
     Wheel — throttled
     ========================================================== */
  var wheelLock = false;
  var WHEEL_COOLDOWN = 420;

  function handleWheel(e) {
    if (wheelLock) return;
    if (Math.abs(e.deltaY) < 10) return;
    e.preventDefault();
    wheelLock = true;
    if (e.deltaY > 0) navigateNext();
    else navigatePrev();
    setTimeout(function () { wheelLock = false; }, WHEEL_COOLDOWN);
  }

  /* ==========================================================
     Events
     ========================================================== */
  function bindEvents() {
    document.addEventListener('keydown', handleKeyboard);

    stage = $('#dw-circular-stage');
    if (stage) {
      stage.addEventListener('wheel', handleWheel, { passive: false });
      stage.addEventListener('touchstart', handleTouchStart, { passive: true });
      stage.addEventListener('touchend', handleTouchEnd, { passive: true });
    }
  }

  /* ==========================================================
     Init
     ========================================================== */
  async function init() {
    await loadModuleConfig();
    bindEvents();
    // Delegate hash check to registry (after all modules registered)
    if (window.JaterMod) {
      window.JaterMod.checkInitialHash();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
