/**
 * ui-kit.js — Jater 共享 UI 组件
 * 依赖 core.js (window.Jater)，必须在 core.js 之后加载。
 * 暴露 window.JaterUI 命名空间。
 */
(function () {
  'use strict';

  var $ = window.Jater.$;
  var UI = {};

  /* ==========================================================
     Lightbox 工厂
     通用图片灯箱：打开/关闭、键盘导航、触摸滑动、淡入淡出
     ========================================================== */

  /**
   * createLightbox(config)
   *
   * config 字段：
   *   container  — 灯箱容器选择器（如 '#ghost-lightbox'）
   *   img        — 图片元素选择器
   *   close      — 关闭按钮选择器
   *   bg         — 背景遮罩选择器（点击关闭）
   *   prev       — 上一张按钮选择器
   *   next       — 下一张按钮选择器
   *   texts      — { key: selector } 可选文本字段（date, time, resolution, counter 等）
   *   update(idx) — 返回 { src, alt, [key]: textContent } 更新内容
   *   onPrev(idx) — 返回上一张索引
   *   onNext(idx) — 返回下一张索引
   *   onOpen?(idx) — 灯箱打开后回调
   *   onClose?(idx) — 灯箱关闭后回调（idx 为关闭时的索引）
   *
   * 返回 { open(idx), close(), prev(), next(), getIndex() }
   */
  UI.createLightbox = function (config) {
    var currentIndex = -1;

    // Resolve DOM elements
    var container = $(config.container);
    var img = $(config.img);
    var closeBtn = $(config.close);
    var bg = $(config.bg);
    var prevBtn = $(config.prev);
    var nextBtn = $(config.next);

    // Resolve text elements
    var textEls = {};
    if (config.texts) {
      Object.keys(config.texts).forEach(function (key) {
        textEls[key] = $(config.texts[key]);
      });
    }

    /* ---- 更新图片内容 ---- */
    function updateContent(idx) {
      var data = config.update(idx);
      if (!data) return;

      // 淡出 → 更新 → 淡入
      if (img && data.src) {
        img.style.opacity = '0';
        setTimeout(function () {
          img.src = data.src;
          img.alt = data.alt || '';
          img.style.opacity = '1';
        }, 80);
      }

      // 更新文本字段
      Object.keys(textEls).forEach(function (key) {
        if (textEls[key] && data[key] !== undefined) {
          textEls[key].textContent = data[key];
        }
      });
    }

    /* ---- 打开 ---- */
    function open(idx) {
      if (!container) return;
      currentIndex = idx;
      updateContent(idx);
      container.classList.remove('hidden');
      container.setAttribute('aria-hidden', 'false');
      document.documentElement.style.overflow = 'hidden';
      if (closeBtn) closeBtn.focus();
      if (config.onOpen) config.onOpen(idx);
    }

    /* ---- 关闭 ---- */
    function close() {
      if (!container) return;
      var closingIndex = currentIndex;
      currentIndex = -1;
      container.classList.add('hidden');
      container.setAttribute('aria-hidden', 'true');
      document.documentElement.style.overflow = '';
      if (config.onClose) config.onClose(closingIndex);
    }

    /* ---- 导航 ---- */
    function prev() {
      if (config.onPrev) {
        currentIndex = config.onPrev(currentIndex);
        updateContent(currentIndex);
      }
    }

    function next() {
      if (config.onNext) {
        currentIndex = config.onNext(currentIndex);
        updateContent(currentIndex);
      }
    }

    function getIndex() {
      return currentIndex;
    }

    /* ---- 事件绑定 ---- */
    if (closeBtn) closeBtn.addEventListener('click', close);
    if (bg) bg.addEventListener('click', close);

    if (prevBtn) prevBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      prev();
    });

    if (nextBtn) nextBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      next();
    });

    // 键盘
    document.addEventListener('keydown', function (e) {
      if (!container || container.classList.contains('hidden')) return;
      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          close();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          prev();
          break;
        case 'ArrowRight':
          e.preventDefault();
          next();
          break;
      }
    });

    // 触摸滑动
    var touchStartX = 0;
    var touchStartY = 0;

    if (container) {
      container.addEventListener('touchstart', function (e) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
      }, { passive: true });

      container.addEventListener('touchend', function (e) {
        var dx = e.changedTouches[0].clientX - touchStartX;
        var dy = e.changedTouches[0].clientY - touchStartY;
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
          if (dx > 0) prev();
          else next();
        }
      });
    }

    return { open: open, close: close, prev: prev, next: next, getIndex: getIndex };
  };

  /* ==========================================================
     Scroll-to-Top 按钮
     监听右面板滚动，自动显示/隐藏
     ========================================================== */
  UI.initScrollTop = function () {
    var scrollTopBtn = $('#scroll-top');
    var rightPanel = $('#dw-right-panel');
    if (!scrollTopBtn) return;

    // 点击滚动到顶部
    scrollTopBtn.addEventListener('click', function () {
      if (rightPanel) {
        rightPanel.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });

    // 监听右面板滚动
    if (rightPanel) {
      rightPanel.addEventListener('scroll', function () {
        scrollTopBtn.classList.toggle('hidden', rightPanel.scrollTop < 400);
      });
    }
  };

  /* ==========================================================
     Header 移动端导航切换
     ========================================================== */
  UI.initHeaderNav = function () {
    var navToggle = $('#nav-toggle');
    var navMenu = $('#nav-menu');
    if (!navToggle || !navMenu) return;

    navToggle.addEventListener('click', function () {
      var expanded = this.getAttribute('aria-expanded') === 'true';
      this.setAttribute('aria-expanded', !expanded);
      navMenu.classList.toggle('open');
    });

    // 点击导航链接后关闭菜单（移动端）
    var navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(function (link) {
      link.addEventListener('click', function () {
        navToggle.setAttribute('aria-expanded', 'false');
        navMenu.classList.remove('open');
      });
    });
  };

  /* ==========================================================
     Auto-init site-wide components on DOM ready
     ========================================================== */
  function autoInit() {
    UI.initScrollTop();
    UI.initHeaderNav();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoInit);
  } else {
    autoInit();
  }

  /* ==========================================================
     暴露到全局
     ========================================================== */
  window.JaterUI = UI;
})();
