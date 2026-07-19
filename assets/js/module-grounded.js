/**
 * module-grounded.js
 * Grounded (禁闭求生) 模块 — 存档列表 + 冒险日志 + 详情弹窗
 * 通过 JaterMod 注册，首次激活时懒加载数据。
 *
 * 依赖：core.js (Jater), module-registry.js (JaterMod)
 */
(function () {
  'use strict';

  var $ = window.Jater.$;
  var $$ = window.Jater.$$;

  /* ==========================================================
     State
     ========================================================== */
  var STATE = {
    saves: [],
    changelog: [],
    currentChangelogFilter: 'all',
    activeSaveId: null,
    loaded: false,
  };

  /* ==========================================================
     DOM Refs (populated on init)
     ========================================================== */
  var dom = {};

  /* ==========================================================
     Helpers — use Jater utilities
     ========================================================== */
  var formatDate = window.Jater.formatDate;
  var formatFileSize = window.Jater.formatFileSize;
  var escapeHtml = window.Jater.escapeHtml;

  /* ==========================================================
     Data Loading
     ========================================================== */
  async function loadData() {
    var results = await Promise.allSettled([
      fetch('data/saves.json').then(function (r) { return r.json(); }),
      fetch('data/changelog.json').then(function (r) { return r.json(); }),
    ]);

    // Saves
    if (results[0].status === 'fulfilled') {
      STATE.saves = results[0].value.saves || [];
      renderSaves();
      renderStats();
      if (results[0].value.last_updated && dom.footerDate) {
        dom.footerDate.textContent = formatDate(results[0].value.last_updated);
      }
    } else {
      if (dom.savesGrid) dom.savesGrid.classList.add('hidden');
      if (dom.savesError) dom.savesError.classList.remove('hidden');
    }

    // Changelog
    if (results[1].status === 'fulfilled') {
      STATE.changelog = results[1].value.entries || [];
      renderChangelog();
    } else {
      if (dom.changelogTimeline) dom.changelogTimeline.classList.add('hidden');
      if (dom.changelogError) dom.changelogError.classList.remove('hidden');
    }
  }

  /* ==========================================================
     Stats
     ========================================================== */
  function renderStats() {
    var totalSaves = STATE.saves.length;
    var totalDays = STATE.saves.reduce(function (sum, s) { return sum + (s.stats && s.stats.days_survived || 0); }, 0);

    if (dom.statSaves) dom.statSaves.textContent = totalSaves || '--';
    if (dom.statDays) dom.statDays.textContent = totalDays || '--';
    if (dom.statUpdates) dom.statUpdates.textContent = STATE.changelog.length || '--';
  }

  /* ==========================================================
     Saves Rendering
     ========================================================== */
  function renderSaves() {
    if (!dom.savesGrid) return;

    if (!STATE.saves.length) {
      dom.savesGrid.classList.add('hidden');
      if (dom.savesEmpty) dom.savesEmpty.classList.remove('hidden');
      return;
    }

    dom.savesGrid.classList.remove('hidden');
    if (dom.savesEmpty) dom.savesEmpty.classList.add('hidden');

    dom.savesGrid.innerHTML = STATE.saves.map(function (save) {
      var stats = save.stats || {};
      var playerList = (stats.players || []).slice(0, 2).join(', ');
      var extraPlayers = (stats.players || []).length > 2 ? ' +' + (stats.players.length - 2) : '';
      var bossCount = (stats.bosses_defeated || []).length;
      var thumbHTML = save.thumbnail
        ? '<img src="' + save.thumbnail + '" alt="" loading="lazy">'
        : '🍂';

      return '<article class="save-card" role="listitem">' +
        '<div class="save-card-thumb">' + thumbHTML + '</div>' +
        '<div class="save-card-body">' +
          '<h3 class="save-card-title" title="' + escapeHtml(save.title) + '">' + escapeHtml(save.title) + '</h3>' +
          '<div class="save-card-meta">' +
            '<span class="save-card-badge">第 ' + (stats.days_survived || '?') + ' 天</span>' +
            (save.game_version ? '<span class="save-card-badge version">v' + escapeHtml(save.game_version) + '</span>' : '') +
          '</div>' +
          '<div class="save-card-stats">' +
            '<span>🏠 ' + (stats.bases || []).length + ' 基地</span>' +
            '<span>👑 ' + bossCount + ' Boss</span>' +
            '<span>⚔️ ' + (stats.tier_reached || 'Tier 1') + '</span>' +
          '</div>' +
          '<div class="save-card-players">👤 ' + (playerList || '单人') + extraPlayers + '</div>' +
        '</div>' +
        '<div class="save-card-actions">' +
          '<button class="btn btn-detail" data-save-id="' + save.id + '">详情</button>' +
          '<a href="saves/' + save.filename + '" class="btn btn-dl" download>下载</a>' +
        '</div>' +
      '</article>';
    }).join('');

    // Bind detail buttons
    dom.savesGrid.querySelectorAll('.btn-detail').forEach(function (btn) {
      btn.addEventListener('click', function () { openModal(btn.dataset.saveId); });
    });
  }

  /* ==========================================================
     Modal
     ========================================================== */
  function openModal(saveId) {
    var save = STATE.saves.find(function (s) { return s.id === saveId; });
    if (!save) return;

    STATE.activeSaveId = saveId;
    var stats = save.stats || {};

    if (dom.modalTitle) dom.modalTitle.textContent = save.title;
    if (dom.modalDownload) dom.modalDownload.href = 'saves/' + save.filename;

    if (dom.modalBody) {
      dom.modalBody.innerHTML =
        '<div class="modal-stats-grid">' +
          '<div class="modal-stat"><div class="modal-stat-label">游戏天数</div><div class="modal-stat-value">' + (stats.days_survived || '?') + ' 天</div></div>' +
          '<div class="modal-stat"><div class="modal-stat-label">游戏版本</div><div class="modal-stat-value">v' + (save.game_version || '?') + '</div></div>' +
          '<div class="modal-stat"><div class="modal-stat-label">装备等级</div><div class="modal-stat-value">' + (stats.tier_reached || 'Tier 1') + '</div></div>' +
          '<div class="modal-stat"><div class="modal-stat-label">文件大小</div><div class="modal-stat-value">' + formatFileSize(save.file_size_bytes) + '</div></div>' +
          '<div class="modal-stat"><div class="modal-stat-label">玩家</div><div class="modal-stat-value">' + ((stats.players || []).join(', ') || '单人') + '</div></div>' +
          '<div class="modal-stat"><div class="modal-stat-label">上传日期</div><div class="modal-stat-value">' + formatDate(save.date_added) + '</div></div>' +
        '</div>' +
        (save.description ? '<div class="modal-section"><div class="modal-section-title">描述</div><p class="modal-desc">' + escapeHtml(save.description) + '</p></div>' : '') +
        ((stats.bases || []).length ? '<div class="modal-section"><div class="modal-section-title">基地 (' + stats.bases.length + ')</div><div class="modal-tags">' + stats.bases.map(function (b) { return '<span class="modal-tag">🏠 ' + escapeHtml(b) + '</span>'; }).join('') + '</div></div>' : '') +
        ((stats.biomes_explored || []).length ? '<div class="modal-section"><div class="modal-section-title">已探索区域</div><div class="modal-biomes">' + stats.biomes_explored.map(function (b) { return '<span class="modal-biome">' + escapeHtml(b) + '</span>'; }).join('') + '</div></div>' : '') +
        ((stats.bosses_defeated || []).length ? '<div class="modal-section"><div class="modal-section-title">击败的 Boss</div><div class="modal-bosses">' + stats.bosses_defeated.map(function (b) { return '<span class="modal-boss">💀 ' + escapeHtml(b.name) + ' x' + b.times_defeated + '</span>'; }).join('') + '</div></div>' : '') +
        ((save.highlights || []).length ? '<div class="modal-section"><div class="modal-section-title">亮点</div><ul class="modal-highlights">' + save.highlights.map(function (h) { return '<li>' + escapeHtml(h) + '</li>'; }).join('') + '</ul></div>' : '') +
        ((save.tags || []).length ? '<div class="modal-section"><div class="modal-section-title">标签</div><div class="modal-tags">' + save.tags.map(function (t) { return '<span class="modal-tag">' + escapeHtml(t) + '</span>'; }).join('') + '</div></div>' : '');
    }

    if (dom.modalOverlay) {
      dom.modalOverlay.classList.remove('hidden');
      dom.modalOverlay.setAttribute('aria-hidden', 'false');
    }
    document.documentElement.style.overflow = 'hidden';
    if (dom.modalTitle) dom.modalTitle.focus();
  }

  function closeModal() {
    var closingId = STATE.activeSaveId;
    STATE.activeSaveId = null;
    if (dom.modalOverlay) {
      dom.modalOverlay.classList.add('hidden');
      dom.modalOverlay.setAttribute('aria-hidden', 'true');
    }
    document.documentElement.style.overflow = '';
    if (closingId) {
      var trigger = document.querySelector('[data-save-id="' + closingId + '"]');
      if (trigger) trigger.focus();
    }
  }

  /* ==========================================================
     Changelog Rendering
     ========================================================== */
  function renderChangelog() {
    if (!dom.changelogTimeline) return;

    if (!STATE.changelog.length) {
      dom.changelogTimeline.classList.add('hidden');
      if (dom.changelogEmpty) dom.changelogEmpty.classList.remove('hidden');
      return;
    }

    dom.changelogTimeline.classList.remove('hidden');
    if (dom.changelogEmpty) dom.changelogEmpty.classList.add('hidden');

    var sorted = STATE.changelog.slice().sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
    var typeLabelMap = { milestone: '里程碑', build: '建筑', save: '存档', exploration: '探索', note: '笔记' };

    dom.changelogTimeline.innerHTML = sorted.map(function (entry) {
      var typeLabel = typeLabelMap[entry.type] || entry.type;
      return '<div class="timeline-entry" data-type="' + entry.type + '">' +
        '<div class="timeline-dot type-' + entry.type + '" aria-hidden="true"></div>' +
        '<div class="timeline-date">' + formatDate(entry.date) + '</div>' +
        '<span class="timeline-badge type-' + entry.type + '">' + typeLabel + '</span>' +
        '<h3 class="timeline-title">' + escapeHtml(entry.title) + '</h3>' +
        '<p class="timeline-desc">' + escapeHtml(entry.description) + '</p>' +
      '</div>';
    }).join('');

    applyChangelogFilter();
    updateStats();
  }

  function applyChangelogFilter() {
    if (!dom.changelogTimeline) return;
    var entries = dom.changelogTimeline.querySelectorAll('.timeline-entry');
    entries.forEach(function (el) {
      if (STATE.currentChangelogFilter === 'all' || el.dataset.type === STATE.currentChangelogFilter) {
        el.classList.remove('filter-hidden');
      } else {
        el.classList.add('filter-hidden');
      }
    });
  }

  function updateStats() {
    var totalDays = STATE.saves.reduce(function (sum, s) { return sum + (s.stats && s.stats.days_survived || 0); }, 0);
    if (dom.statSaves) dom.statSaves.textContent = STATE.saves.length;
    if (dom.statDays) dom.statDays.textContent = totalDays;
    if (dom.statUpdates) dom.statUpdates.textContent = STATE.changelog.length;
  }

  /* ==========================================================
     Event Bindings
     ========================================================== */
  function bindEvents() {
    // Retry buttons
    var btnRetrySaves = $('#btn-retry-saves');
    if (btnRetrySaves) {
      btnRetrySaves.addEventListener('click', async function () {
        try {
          var res = await fetch('data/saves.json').then(function (r) { return r.json(); });
          STATE.saves = res.saves || [];
          if (dom.savesGrid) dom.savesGrid.classList.remove('hidden');
          if (dom.savesError) dom.savesError.classList.add('hidden');
          renderSaves();
          renderStats();
        } catch (e) { /* still error */ }
      });
    }

    var btnRetryChangelog = $('#btn-retry-changelog');
    if (btnRetryChangelog) {
      btnRetryChangelog.addEventListener('click', async function () {
        try {
          var res = await fetch('data/changelog.json').then(function (r) { return r.json(); });
          STATE.changelog = res.entries || [];
          if (dom.changelogTimeline) dom.changelogTimeline.classList.remove('hidden');
          if (dom.changelogError) dom.changelogError.classList.add('hidden');
          renderChangelog();
          renderStats();
        } catch (e) { /* still error */ }
      });
    }

    // Modal close
    if (dom.modalClose) {
      dom.modalClose.addEventListener('click', closeModal);
    }
    if (dom.modalOverlay) {
      dom.modalOverlay.addEventListener('click', function (e) {
        if (e.target === dom.modalOverlay) closeModal();
      });
    }
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && dom.modalOverlay && !dom.modalOverlay.classList.contains('hidden')) {
        closeModal();
      }
    });

    // Changelog filters
    $$('.changelog-filter-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        $$('.changelog-filter-btn').forEach(function (b) {
          b.classList.remove('active');
          b.setAttribute('aria-selected', 'false');
        });
        btn.classList.add('active');
        btn.setAttribute('aria-selected', 'true');
        STATE.currentChangelogFilter = btn.dataset.filter;
        applyChangelogFilter();
      });
    });
  }

  /* ==========================================================
     Init — called by JaterMod on first activation
     ========================================================== */
  function init() {
    if (STATE.loaded) return;

    // Collect DOM refs
    dom = {
      savesGrid: $('#saves-grid'),
      savesError: $('#saves-error'),
      savesEmpty: $('#saves-empty'),
      changelogTimeline: $('#changelog-timeline'),
      changelogError: $('#changelog-error'),
      changelogEmpty: $('#changelog-empty'),
      modalOverlay: $('#modal-overlay'),
      modalTitle: $('#modal-title'),
      modalBody: $('#modal-body'),
      modalDownload: $('#modal-download'),
      modalClose: $('#modal-close'),
      scrollTop: $('#scroll-top'),
      navToggle: $('#nav-toggle'),
      navMenu: $('#nav-menu'),
      footerDate: $('#footer-date'),
      statSaves: $('#stat-saves'),
      statDays: $('#stat-days'),
      statUpdates: $('#stat-updates'),
    };

    STATE.loaded = true;
    bindEvents();
    loadData();
  }

  /* ==========================================================
     Register with module registry
     ========================================================== */
  if (window.JaterMod) {
    window.JaterMod.register('grounded', { init: init });
  } else {
    // Fallback: if registry not loaded yet, retry on DOM ready
    document.addEventListener('DOMContentLoaded', function () {
      if (window.JaterMod) {
        window.JaterMod.register('grounded', { init: init });
      }
    });
  }
})();
