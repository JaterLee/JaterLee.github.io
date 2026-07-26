/**
 * counter.js
 * 页面浏览量统计 — 当日 + 总计
 * 读取 data/site-stats.json，通过 GitHub API 更新计数。
 */
(function () {
  'use strict';

  var DATA_URL = 'https://raw.githubusercontent.com/JaterLee/JaterLee.github.io/master/data/site-stats.json';
  var API_URL = 'https://api.github.com/repos/JaterLee/JaterLee.github.io/contents/data/site-stats.json';
  var LS_KEY = 'site_last_view_date';
  var today = getToday();

  function getToday() {
    var d = new Date();
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    var dd = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + mm + '-' + dd;
  }

  function getToken() {
    // Try localStorage (admin page), fallback to empty
    try { return localStorage.getItem('gh_token') || ''; } catch (e) { return ''; }
  }

  function stringToBase64(str) {
    var bytes = new TextEncoder().encode(str);
    var binary = '';
    for (var i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /* ── Render counters in footer ── */
  function renderCounters(todayCount, totalCount) {
    var elToday = document.getElementById('counter-today');
    var elTotal = document.getElementById('counter-total');
    if (elToday) elToday.textContent = formatNumber(todayCount);
    if (elTotal) elTotal.textContent = formatNumber(totalCount);
  }

  function formatNumber(n) {
    if (n >= 10000) return (n / 10000).toFixed(1) + 'w';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    return String(n);
  }

  /* ── Fetch current stats ── */
  async function fetchStats() {
    try {
      var resp = await fetch(DATA_URL, { cache: 'no-cache' });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      return await resp.json();
    } catch (err) {
      console.warn('Counter: failed to fetch stats', err.message);
      return null;
    }
  }

  /* ── Increment via GitHub API ── */
  async function tryIncrement(stats) {
    var token = getToken();
    if (!token) return null; // No token, can't increment

    var lastView = '';
    try { lastView = localStorage.getItem(LS_KEY) || ''; } catch (e) {}

    if (lastView === today) return null; // Already counted today

    try {
      // 1. Get current file SHA
      var getResp = await fetch(API_URL, {
        headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github.v3+json' },
        cache: 'no-cache'
      });
      if (!getResp.ok) throw new Error('GET failed: ' + getResp.status);
      var fileInfo = await getResp.json();

      // 2. Update stats
      var newStats = JSON.parse(JSON.stringify(stats));
      newStats.date = today;
      if (newStats.daily[today] === undefined) {
        newStats.daily[today] = 1;
      } else {
        newStats.daily[today] += 1;
      }
      newStats.total += 1;

      // 3. PUT updated file
      var putResp = await fetch(API_URL, {
        method: 'PUT',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: '📊 Update site stats (' + today + ')',
          content: btoa(stringToBase64(JSON.stringify(newStats, null, 2))),
          sha: fileInfo.sha
        })
      });
      if (!putResp.ok) throw new Error('PUT failed: ' + putResp.status);

      // 4. Mark as counted
      try { localStorage.setItem(LS_KEY, today); } catch (e) {}
      return newStats;
    } catch (err) {
      console.warn('Counter: increment failed', err.message);
      return null;
    }
  }

  /* ── Main ── */
  async function init() {
    var stats = await fetchStats();
    if (!stats) {
      renderCounters('--', '--');
      return;
    }

    // Display: today = stats.daily[stats.date] if date matches, else 0
    var statsDate = stats.date || '';
    var todayCount = statsDate === today ? (stats.daily[today] || 0) : 0;
    var totalCount = stats.total || 0;

    // Try to increment (won't happen without token)
    var updated = await tryIncrement(stats);
    if (updated) {
      todayCount = updated.daily[today] || (todayCount + 1);
      totalCount = updated.total;
    }

    renderCounters(todayCount, totalCount);
  }

  /* ── Start when DOM ready ── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
