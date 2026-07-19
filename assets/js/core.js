/**
 * core.js — Jater 共享基础工具
 * 所有模块和全站脚本的共同依赖，必须最先加载。
 * 暴露 window.Jater 命名空间。
 */
(function () {
  'use strict';

  var J = {};

  /* ==========================================================
     DOM 选择器快捷方式
     ========================================================== */
  J.$ = function (sel) { return document.querySelector(sel); };
  J.$$ = function (sel) { return document.querySelectorAll(sel); };

  /* ==========================================================
     日期 / 时间格式化（zh-CN）
     ========================================================== */

  /**
   * 完整日期：2026年7月19日
   */
  J.formatDate = function (dateStr) {
    if (!dateStr) return '';
    var d = new Date(dateStr);
    return d.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  /**
   * 短日期：7月19日
   */
  J.formatDateShort = function (dateStr) {
    if (!dateStr) return '';
    var d = new Date(dateStr);
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  };

  /**
   * 时间：14:30
   */
  J.formatTime = function (dateStr) {
    if (!dateStr) return '';
    var d = new Date(dateStr);
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  };

  /* ==========================================================
     文件大小格式化
     ========================================================== */
  J.formatFileSize = function (bytes) {
    if (!bytes) return '未知大小';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  /* ==========================================================
     HTML 转义
     ========================================================== */
  J.escapeHtml = function (str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };

  /* ==========================================================
     UI 工具
     ========================================================== */

  /** 批量隐藏 — els 为 { key: element } 对象 */
  J.hideAll = function (els) {
    Object.values(els).forEach(function (el) {
      if (el) el.classList.add('hidden');
    });
  };

  /** 移除 hidden 类 */
  J.show = function (el) {
    if (el) el.classList.remove('hidden');
  };

  /** 添加 hidden 类 */
  J.hide = function (el) {
    if (el) el.classList.add('hidden');
  };

  /* ==========================================================
     暴露到全局
     ========================================================== */
  window.Jater = J;
})();
