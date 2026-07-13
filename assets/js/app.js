/**
 * Grounded Saves — app.js
 * 数据加载、渲染、交互逻辑
 */
(function () {
  'use strict';

  /* ==========================================================
     State
     ========================================================== */
  const STATE = {
    saves: [],
    changelog: [],
    currentChangelogFilter: 'all',
    searchTerm: '',
    versionFilter: 'all',
    activeSaveId: null,
  };

  /* ==========================================================
     DOM Refs
     ========================================================== */
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const dom = {
    savesGrid: $('#saves-grid'),
    savesError: $('#saves-error'),
    savesEmpty: $('#saves-empty'),
    savesNoResults: $('#saves-no-results'),
    changelogTimeline: $('#changelog-timeline'),
    changelogError: $('#changelog-error'),
    changelogEmpty: $('#changelog-empty'),
    searchInput: $('#search-input'),
    versionFilter: $('#version-filter'),
    modalOverlay: $('#modal-overlay'),
    modalTitle: $('#modal-title'),
    modalBody: $('#modal-body'),
    modalDownload: $('#modal-download'),
    modalClose: $('#modal-close'),
    scrollTop: $('#scroll-top'),
    navToggle: $('#nav-toggle'),
    navMenu: $('#nav-menu'),
    heroStats: $('#hero-stats'),
    footerDate: $('#footer-date'),
    statSaves: $('#stat-saves'),
    statDays: $('#stat-days'),
    statUpdates: $('#stat-updates'),
  };

  /* ==========================================================
     Helpers
     ========================================================== */
  function formatDate(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  function formatFileSize(bytes) {
    if (!bytes) return '未知大小';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function debounce(fn, ms) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  function hideAll(els) {
    Object.values(els).forEach((el) => el && el.classList.add('hidden'));
  }

  /* ==========================================================
     Data Loading
     ========================================================== */
  async function loadData() {
    const results = await Promise.allSettled([
      fetch('data/saves.json').then((r) => r.json()),
      fetch('data/changelog.json').then((r) => r.json()),
    ]);

    // Saves
    if (results[0].status === 'fulfilled') {
      STATE.saves = results[0].value.saves || [];
      renderSaves();
      renderStats();
      populateVersionFilter();
      if (results[0].value.last_updated) {
        dom.footerDate.textContent = formatDate(results[0].value.last_updated);
      }
    } else {
      dom.savesGrid.classList.add('hidden');
      dom.savesError.classList.remove('hidden');
    }

    // Changelog
    if (results[1].status === 'fulfilled') {
      STATE.changelog = results[1].value.entries || [];
      renderChangelog();
    } else {
      dom.changelogTimeline.classList.add('hidden');
      dom.changelogError.classList.remove('hidden');
    }
  }

  /* ==========================================================
     Stats
     ========================================================== */
  function renderStats() {
    const totalSaves = STATE.saves.length;
    const totalDays = STATE.saves.reduce((sum, s) => sum + (s.stats?.days_survived || 0), 0);

    dom.statSaves.textContent = totalSaves || '--';
    dom.statDays.textContent = totalDays || '--';
    dom.statUpdates.textContent = STATE.changelog.length || '--';
  }

  /* ==========================================================
     Saves Rendering
     ========================================================== */
  function getFilteredSaves() {
    let saves = STATE.saves;

    // Search
    if (STATE.searchTerm) {
      const q = STATE.searchTerm.toLowerCase();
      saves = saves.filter((s) => {
        const searchable = [
          s.title, s.description,
          ...(s.tags || []),
          ...(s.stats?.players || []),
          ...(s.stats?.bases || []),
        ].join(' ').toLowerCase();
        return searchable.includes(q);
      });
    }

    // Version filter
    if (STATE.versionFilter !== 'all') {
      saves = saves.filter((s) => s.game_version === STATE.versionFilter);
    }

    return saves;
  }

  function populateVersionFilter() {
    const versions = [...new Set(STATE.saves.map((s) => s.game_version).filter(Boolean))].sort().reverse();
    const select = dom.versionFilter;
    // Keep the "all" option, remove others
    while (select.options.length > 1) select.remove(1);
    versions.forEach((v) => {
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = 'v' + v;
      select.appendChild(opt);
    });
  }

  function renderSaves() {
    const filtered = getFilteredSaves();

    // Empty states
    if (!STATE.saves.length) {
      dom.savesGrid.classList.add('hidden');
      dom.savesEmpty.classList.remove('hidden');
      dom.savesNoResults.classList.add('hidden');
      return;
    }

    if (!filtered.length) {
      dom.savesGrid.classList.add('hidden');
      dom.savesEmpty.classList.add('hidden');
      dom.savesNoResults.classList.remove('hidden');
      return;
    }

    dom.savesGrid.classList.remove('hidden');
    dom.savesEmpty.classList.add('hidden');
    dom.savesNoResults.classList.add('hidden');

    dom.savesGrid.innerHTML = filtered.map((save) => {
      const stats = save.stats || {};
      const playerList = (stats.players || []).slice(0, 2).join(', ');
      const extraPlayers = (stats.players || []).length > 2 ? ` +${stats.players.length - 2}` : '';
      const bossCount = (stats.bosses_defeated || []).length;
      const thumbHTML = save.thumbnail
        ? `<img src="${save.thumbnail}" alt="" loading="lazy">`
        : '🍂';

      return `
        <article class="save-card" role="listitem">
          <div class="save-card-thumb">${thumbHTML}</div>
          <div class="save-card-body">
            <h3 class="save-card-title" title="${escapeHtml(save.title)}">${escapeHtml(save.title)}</h3>
            <div class="save-card-meta">
              <span class="save-card-badge">第 ${stats.days_survived || '?'} 天</span>
              ${save.game_version ? `<span class="save-card-badge version">v${escapeHtml(save.game_version)}</span>` : ''}
            </div>
            <div class="save-card-stats">
              <span>🏠 ${(stats.bases || []).length} 基地</span>
              <span>👑 ${bossCount} Boss</span>
              <span>⚔️ ${stats.tier_reached || 'Tier 1'}</span>
            </div>
            <div class="save-card-players">
              👤 ${playerList || '单人'}${extraPlayers}
            </div>
          </div>
          <div class="save-card-actions">
            <button class="btn btn-detail" data-save-id="${save.id}">详情</button>
            <a href="saves/${save.filename}" class="btn btn-dl" download>下载</a>
          </div>
        </article>
      `;
    }).join('');

    // Bind detail buttons
    dom.savesGrid.querySelectorAll('.btn-detail').forEach((btn) => {
      btn.addEventListener('click', () => openModal(btn.dataset.saveId));
    });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ==========================================================
     Modal
     ========================================================== */
  function openModal(saveId) {
    const save = STATE.saves.find((s) => s.id === saveId);
    if (!save) return;

    STATE.activeSaveId = saveId;
    const stats = save.stats || {};

    dom.modalTitle.textContent = save.title;
    dom.modalDownload.href = `saves/${save.filename}`;

    dom.modalBody.innerHTML = `
      <div class="modal-stats-grid">
        <div class="modal-stat">
          <div class="modal-stat-label">游戏天数</div>
          <div class="modal-stat-value">${stats.days_survived || '?'} 天</div>
        </div>
        <div class="modal-stat">
          <div class="modal-stat-label">游戏版本</div>
          <div class="modal-stat-value">v${save.game_version || '?'}</div>
        </div>
        <div class="modal-stat">
          <div class="modal-stat-label">装备等级</div>
          <div class="modal-stat-value">${stats.tier_reached || 'Tier 1'}</div>
        </div>
        <div class="modal-stat">
          <div class="modal-stat-label">文件大小</div>
          <div class="modal-stat-value">${formatFileSize(save.file_size_bytes)}</div>
        </div>
        <div class="modal-stat">
          <div class="modal-stat-label">玩家</div>
          <div class="modal-stat-value">${(stats.players || []).join(', ') || '单人'}</div>
        </div>
        <div class="modal-stat">
          <div class="modal-stat-label">上传日期</div>
          <div class="modal-stat-value">${formatDate(save.date_added)}</div>
        </div>
      </div>

      ${save.description ? `
        <div class="modal-section">
          <div class="modal-section-title">描述</div>
          <p class="modal-desc">${escapeHtml(save.description)}</p>
        </div>
      ` : ''}

      ${(stats.bases || []).length ? `
        <div class="modal-section">
          <div class="modal-section-title">基地 (${stats.bases.length})</div>
          <div class="modal-tags">
            ${stats.bases.map((b) => `<span class="modal-tag">🏠 ${escapeHtml(b)}</span>`).join('')}
          </div>
        </div>
      ` : ''}

      ${(stats.biomes_explored || []).length ? `
        <div class="modal-section">
          <div class="modal-section-title">已探索区域</div>
          <div class="modal-biomes">
            ${stats.biomes_explored.map((b) => `<span class="modal-biome">${escapeHtml(b)}</span>`).join('')}
          </div>
        </div>
      ` : ''}

      ${(stats.bosses_defeated || []).length ? `
        <div class="modal-section">
          <div class="modal-section-title">击败的 Boss</div>
          <div class="modal-bosses">
            ${stats.bosses_defeated.map((b) => `<span class="modal-boss">💀 ${escapeHtml(b.name)} x${b.times_defeated}</span>`).join('')}
          </div>
        </div>
      ` : ''}

      ${(save.highlights || []).length ? `
        <div class="modal-section">
          <div class="modal-section-title">亮点</div>
          <ul class="modal-highlights">
            ${save.highlights.map((h) => `<li>${escapeHtml(h)}</li>`).join('')}
          </ul>
        </div>
      ` : ''}

      ${(save.tags || []).length ? `
        <div class="modal-section">
          <div class="modal-section-title">标签</div>
          <div class="modal-tags">
            ${save.tags.map((t) => `<span class="modal-tag">${escapeHtml(t)}</span>`).join('')}
          </div>
        </div>
      ` : ''}
    `;

    dom.modalOverlay.classList.remove('hidden');
    dom.modalOverlay.setAttribute('aria-hidden', 'false');
    document.documentElement.style.overflow = 'hidden';
    dom.modalTitle.focus();
  }

  function closeModal() {
    const closingId = STATE.activeSaveId;
    STATE.activeSaveId = null;
    dom.modalOverlay.classList.add('hidden');
    dom.modalOverlay.setAttribute('aria-hidden', 'true');
    document.documentElement.style.overflow = '';
    // Return focus to the trigger button that opened this modal
    if (closingId) {
      const trigger = document.querySelector(`[data-save-id="${closingId}"]`);
      if (trigger) trigger.focus();
    }
  }

  /* ==========================================================
     Changelog Rendering
     ========================================================== */
  function renderChangelog() {
    if (!STATE.changelog.length) {
      dom.changelogTimeline.classList.add('hidden');
      dom.changelogEmpty.classList.remove('hidden');
      return;
    }

    dom.changelogTimeline.classList.remove('hidden');
    dom.changelogEmpty.classList.add('hidden');

    const sorted = [...STATE.changelog].sort((a, b) => new Date(b.date) - new Date(a.date));

    dom.changelogTimeline.innerHTML = sorted.map((entry) => {
      const typeLabel = {
        milestone: '里程碑',
        build: '建筑',
        save: '存档',
        exploration: '探索',
        note: '笔记',
      }[entry.type] || entry.type;

      return `
        <div class="timeline-entry" data-type="${entry.type}">
          <div class="timeline-dot type-${entry.type}" aria-hidden="true"></div>
          <div class="timeline-date">${formatDate(entry.date)}</div>
          <span class="timeline-badge type-${entry.type}">${typeLabel}</span>
          <h3 class="timeline-title">${escapeHtml(entry.title)}</h3>
          <p class="timeline-desc">${escapeHtml(entry.description)}</p>
        </div>
      `;
    }).join('');

    applyChangelogFilter();
    updateStats();
  }

  function applyChangelogFilter() {
    const entries = dom.changelogTimeline.querySelectorAll('.timeline-entry');
    entries.forEach((el) => {
      if (STATE.currentChangelogFilter === 'all' || el.dataset.type === STATE.currentChangelogFilter) {
        el.classList.remove('filter-hidden');
      } else {
        el.classList.add('filter-hidden');
      }
    });
  }

  function updateStats() {
    const totalDays = STATE.saves.reduce((sum, s) => sum + (s.stats?.days_survived || 0), 0);
    dom.statSaves.textContent = STATE.saves.length;
    dom.statDays.textContent = totalDays;
    dom.statUpdates.textContent = STATE.changelog.length;
  }

  /* ==========================================================
     Event Handlers
     ========================================================== */

  // Search
  const handleSearch = debounce(function () {
    STATE.searchTerm = dom.searchInput.value.trim();
    renderSaves();
  }, 150);

  dom.searchInput.addEventListener('input', handleSearch);

  // Version filter
  dom.versionFilter.addEventListener('change', function () {
    STATE.versionFilter = this.value;
    renderSaves();
  });

  // Reset search
  $('#btn-reset-search')?.addEventListener('click', function () {
    dom.searchInput.value = '';
    dom.versionFilter.value = 'all';
    STATE.searchTerm = '';
    STATE.versionFilter = 'all';
    renderSaves();
  });

  // Retry buttons
  $('#btn-retry-saves')?.addEventListener('click', async function () {
    try {
      const res = await fetch('data/saves.json').then((r) => r.json());
      STATE.saves = res.saves || [];
      dom.savesGrid.classList.remove('hidden');
      dom.savesError.classList.add('hidden');
      renderSaves();
      renderStats();
      populateVersionFilter();
    } catch {
      // still error
    }
  });

  $('#btn-retry-changelog')?.addEventListener('click', async function () {
    try {
      const res = await fetch('data/changelog.json').then((r) => r.json());
      STATE.changelog = res.entries || [];
      dom.changelogTimeline.classList.remove('hidden');
      dom.changelogError.classList.add('hidden');
      renderChangelog();
      renderStats();
    } catch {
      // still error
    }
  });

  // Modal close
  dom.modalClose.addEventListener('click', closeModal);
  dom.modalOverlay.addEventListener('click', function (e) {
    if (e.target === dom.modalOverlay) closeModal();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !dom.modalOverlay.classList.contains('hidden')) {
      closeModal();
    }
  });

  // Changelog filters
  $$('.changelog-filter-btn').forEach((btn) => {
    btn.addEventListener('click', function () {
      $$('.changelog-filter-btn').forEach((b) => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      this.classList.add('active');
      this.setAttribute('aria-selected', 'true');
      STATE.currentChangelogFilter = this.dataset.filter;
      applyChangelogFilter();
    });
  });

  // Scroll to top
  dom.scrollTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

  let heroObserver = new IntersectionObserver(
    (entries) => {
      dom.scrollTop.classList.toggle('hidden', entries[0].isIntersecting);
    },
    { threshold: 0.1 }
  );
  heroObserver.observe($('#hero'));

  // Navigation active link
  const sections = $$('section[id]');
  let navObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const link = $(`.nav-link[data-section="${entry.target.id}"]`);
          $$('.nav-link').forEach((l) => l.classList.remove('active'));
          if (link) link.classList.add('active');
        }
      });
    },
    { rootMargin: '-50% 0px -50% 0px' }
  );
  sections.forEach((s) => navObserver.observe(s));

  // Mobile nav toggle
  dom.navToggle.addEventListener('click', function () {
    const expanded = this.getAttribute('aria-expanded') === 'true';
    this.setAttribute('aria-expanded', !expanded);
    dom.navMenu.classList.toggle('open');
  });

  // Close nav on link click (mobile)
  $$('.nav-link[data-section]').forEach((link) => {
    link.addEventListener('click', function () {
      dom.navToggle.setAttribute('aria-expanded', 'false');
      dom.navMenu.classList.remove('open');
    });
  });

  /* ==========================================================
     Init
     ========================================================== */
  loadData();
})();
