/**
 * module-registry.js — Jater 模块生命周期管理
 * 依赖 core.js (window.Jater)，必须在 core.js 之后加载。
 * 暴露 window.JaterMod 命名空间。
 */
(function () {
  'use strict';

  var $ = window.Jater.$;
  var $$ = window.Jater.$$;

  var Mod = {};

  /* ==========================================================
     State
     ========================================================== */
  var modules = {};       // { id: { init, destroy } }
  var initialized = {};   // { id: true }
  var activeId = null;

  /* ==========================================================
     register(id, definition)
     definition: { init(), destroy()? }

     注册一个模块。init 会在首次激活时调用。
     ========================================================== */
  Mod.register = function (id, definition) {
    if (!id || !definition || typeof definition.init !== 'function') {
      console.warn('JaterMod.register: invalid definition for module "' + id + '"');
      return;
    }
    modules[id] = definition;
    initialized[id] = false;
  };

  /* ==========================================================
     activate(id)
     激活指定模块：切换 DOM 可见性，首次激活时调用 init，
     派发 dw:modulechange 事件，更新 URL hash，重置滚动。
     ========================================================== */
  Mod.activate = function (id) {
    if (!modules[id]) {
      console.warn('JaterMod.activate: module "' + id + '" is not registered');
      return;
    }

    var firstLoad = !initialized[id];
    var prevId = activeId;

    // 切换模块内容的可见性
    $$('.module-content').forEach(function (el) {
      el.classList.remove('active');
    });

    var target = $('#module-' + id);
    if (target) {
      target.classList.add('active');
    }

    // 重置右面板滚动位置
    var rightPanel = $('#dw-right-panel');
    if (rightPanel) rightPanel.scrollTop = 0;

    // 首次加载时调用 init
    if (firstLoad) {
      try {
        modules[id].init();
      } catch (err) {
        console.error('JaterMod: init failed for module "' + id + '"', err);
      }
      initialized[id] = true;
    }

    activeId = id;

    // 派发事件（向后兼容）
    window.dispatchEvent(new CustomEvent('dw:modulechange', {
      detail: { module: id, firstLoad: firstLoad, previous: prevId },
    }));

    // 更新 URL hash
    if (history.replaceState) {
      history.replaceState(null, '', '#' + id);
    }
  };

  /* ==========================================================
     getActive() → string | null
     ========================================================== */
  Mod.getActive = function () {
    return activeId;
  };

  /* ==========================================================
     getModules() → string[]
     返回所有已注册的模块 ID
     ========================================================== */
  Mod.getModules = function () {
    return Object.keys(modules);
  };

  /* ==========================================================
     isRegistered(id) → boolean
     ========================================================== */
  Mod.isRegistered = function (id) {
    return id in modules;
  };

  /* ==========================================================
     checkInitialHash()
     页面加载时检查 URL hash，如果匹配已注册模块则激活。
     由 dw-navigation.js 在模块配置加载完成后调用。
     ========================================================== */
  Mod.checkInitialHash = function () {
    var hash = window.location.hash.replace('#', '');
    var validIds = Object.keys(modules);
    if (hash && validIds.includes(hash) && hash !== activeId) {
      Mod.activate(hash);
    }
  };

  /* ==========================================================
     暴露到全局
     ========================================================== */
  window.JaterMod = Mod;
})();
