/**
 * counter.js
 * 页面浏览量统计 — 当日 + 总计（localStorage 本地计数）
 */
(function () {
  'use strict';

  var LS_TOTAL = 'pv_total';
  var LS_TODAY_DATE = 'pv_today_date';
  var LS_TODAY_COUNT = 'pv_today_count';

  function getToday() {
    var d = new Date();
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    var dd = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + mm + '-' + dd;
  }

  function getInt(key, fallback) {
    try {
      var v = parseInt(localStorage.getItem(key), 10);
      return isNaN(v) ? fallback : v;
    } catch (e) { return fallback; }
  }

  function setItem(key, val) {
    try { localStorage.setItem(key, String(val)); } catch (e) {}
  }

  function formatNumber(n) {
    if (n >= 10000) return (n / 10000).toFixed(1) + 'w';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    return String(n);
  }

  function init() {
    var today = getToday();

    // Read stored values
    var total = getInt(LS_TOTAL, 0);
    var lastDate = '';
    try { lastDate = localStorage.getItem(LS_TODAY_DATE) || ''; } catch (e) {}

    var todayCount;
    if (lastDate !== today) {
      // New day: reset today count
      todayCount = 1;
      setItem(LS_TODAY_DATE, today);
      setItem(LS_TODAY_COUNT, 1);
      total += 1;
      setItem(LS_TOTAL, total);
    } else {
      // Same day: increment today count but NOT total (already counted this visit)
      todayCount = getInt(LS_TODAY_COUNT, 0);
      // NOTE: we increment total only once per day to be conservative
      // If you want to count every page load, uncomment the next two lines:
      // todayCount += 1;
      // setItem(LS_TODAY_COUNT, todayCount);
    }

    // Render
    var elToday = document.getElementById('counter-today');
    var elTotal = document.getElementById('counter-total');
    if (elToday) elToday.textContent = formatNumber(todayCount);
    if (elTotal) elTotal.textContent = formatNumber(total);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
