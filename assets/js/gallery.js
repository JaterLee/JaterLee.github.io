/**
 * 摄影日志 — gallery.js
 * 多源截图聚合、时间线渲染、Lightbox
 * 从 modules.json 读取所有带截图的模块，合并为统一的摄影时间线
 */
(function () {
  'use strict';

  /* ==========================================================
     State
     ========================================================== */
  const STATE = {
    allImages: [],          // flat merged array, sorted by date desc
    gameMap: {},            // { gameId: { name, icon, color, imagePath } }
    activeGames: new Set(), // set of game ids present in data
    currentFilter: null,    // game id or null (show all)
    currentIndex: -1,       // lightbox index (into filtered set)
  };

  /* ==========================================================
     DOM Refs
     ========================================================== */
  const $ = (sel) => document.querySelector(sel);

  const dom = {
    journalTimeline: $('#journal-timeline'),
    journalLoading:  $('#journal-loading'),
    journalError:    $('#journal-error'),
    journalEmpty:    $('#journal-empty'),
    journalFilters:  $('#journal-filters'),
    lightbox:        $('#lightbox'),
    lightboxImg:     $('#lightbox-img'),
    lightboxGame:    $('#lightbox-game'),
    lightboxDate:    $('#lightbox-date'),
    lightboxResolution: $('#lightbox-resolution'),
    lightboxCounter: $('#lightbox-counter'),
    statTotal:  $('#stat-total'),
    statDays:   $('#stat-days'),
    statGames:  $('#stat-games'),
  };

  /* ==========================================================
     Helpers
     ========================================================== */
  const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  function formatDateFull(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const wd = WEEKDAYS[d.getDay()];
    return `${y}年${m}月${day}日 ${wd}`;
  }

  function formatTime(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${h}:${min}`;
  }

  function dateKey(dateStr) {
    return dateStr ? dateStr.slice(0, 10) : '';
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /* ==========================================================
     Data Loading — fetch modules.json → all image manifests
     ========================================================== */
  async function loadAllImages() {
    // 1. Fetch module registry
    const modResp = await fetch('data/modules.json');
    if (!modResp.ok) throw new Error('Failed to load modules config');
    const modData = await modResp.json();

    // 2. Find modules with screenshot configs
    const screenshotModules = (modData.modules || []).filter(
      (m) => m.screenshots && m.screenshots.data_file
    );

    if (!screenshotModules.length) {
      throw new Error('No screenshot modules found');
    }

    // 3. Fetch all image manifests in parallel
    const results = await Promise.allSettled(
      screenshotModules.map(async (mod) => {
        const resp = await fetch(mod.screenshots.data_file);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();

        const gameId = mod.id;
        // Store game metadata (strip "玩" prefix from name)
        STATE.gameMap[gameId] = {
          name: (mod.name || gameId).replace(/^玩/, ''),
          icon: mod.icon || '',
          color: mod.primary_color || '#888',
          imagePath: mod.screenshots.image_path,
        };
        STATE.activeGames.add(gameId);

        // Return images tagged with game id
        return (data.images || []).map((img) => ({
          ...img,
          _gameId: gameId,
        }));
      })
    );

    // 4. Merge successful results
    STATE.allImages = [];
    results.forEach((r) => {
      if (r.status === 'fulfilled') {
        STATE.allImages.push(...r.value);
      } else {
        console.warn('摄影日志：加载来源失败 —', r.reason);
      }
    });

    if (!STATE.allImages.length) {
      throw new Error('No images found across any source');
    }

    // 5. Sort by date descending (newest first)
    STATE.allImages.sort(
      (a, b) => new Date(b.date_taken) - new Date(a.date_taken)
    );
  }

  /* ==========================================================
     Grouping — by date, then by game within each date
     ========================================================== */
  function groupByDate(images) {
    const groups = new Map();

    images.forEach((img) => {
      const key = dateKey(img.date_taken);
      if (!key) return;
      if (!groups.has(key)) {
        groups.set(key, {
          dateKey: key,
          dateDisplay: formatDateFull(img.date_taken),
          images: [],
        });
      }
      groups.get(key).images.push(img);
    });

    // Convert to array, sorted by date descending
    return Array.from(groups.values()).sort(
      (a, b) => b.dateKey.localeCompare(a.dateKey)
    );
  }

  /** Within a single date, group images by game */
  function groupByGame(images) {
    const map = new Map();
    images.forEach((img) => {
      const gid = img._gameId;
      if (!map.has(gid)) map.set(gid, []);
      map.get(gid).push(img);
    });
    // Sort game sections by earliest photo time within the day
    return Array.from(map.entries())
      .map(([gameId, imgs]) => ({ gameId, images: imgs }))
      .sort((a, b) => {
        const ta = new Date(a.images[0].date_taken);
        const tb = new Date(b.images[0].date_taken);
        return ta - tb;
      });
  }

  /* ==========================================================
     Filter
     ========================================================== */
  function getFilteredImages() {
    if (!STATE.currentFilter) return STATE.allImages;
    return STATE.allImages.filter((img) => img._gameId === STATE.currentFilter);
  }

  /* ==========================================================
     Stats
     ========================================================== */
  function renderStats(images) {
    dom.statTotal.textContent = images.length + ' 张';

    const uniqueDays = new Set(
      images.map((img) => dateKey(img.date_taken)).filter(Boolean)
    );
    dom.statDays.textContent = uniqueDays.size + ' 天';

    const uniqueGames = new Set(images.map((img) => img._gameId));
    dom.statGames.textContent = uniqueGames.size + ' 款';
  }

  /* ==========================================================
     Filter Chips
     ========================================================== */
  function renderFilters() {
    const gameIds = Array.from(STATE.activeGames);

    // Only show filters when there are 2+ games
    if (gameIds.length <= 1) {
      dom.journalFilters.classList.add('single-game');
      dom.journalFilters.innerHTML = '';
      return;
    }

    dom.journalFilters.classList.remove('single-game');

    const chips = [
      { id: null, icon: '📷', label: '全部' },
      ...gameIds.map((gid) => ({
        id: gid,
        icon: STATE.gameMap[gid]?.icon || '',
        label: STATE.gameMap[gid]?.name || gid,
      })),
    ];

    dom.journalFilters.innerHTML = chips
      .map(
        (chip) =>
          `<button class="journal-filter-chip${
            chip.id === STATE.currentFilter ? ' active' : ''
          }" data-game="${chip.id || 'all'}">
            ${chip.icon} ${chip.label}
          </button>`
      )
      .join('');

    // Bind clicks
    dom.journalFilters.querySelectorAll('.journal-filter-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        const newFilter = btn.dataset.game === 'all' ? null : btn.dataset.game;
        STATE.currentFilter = newFilter;
        render();
        // Scroll to top of timeline
        dom.journalTimeline.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  /* ==========================================================
     Timeline Rendering
     ========================================================== */
  function renderTimeline(images) {
    const dateGroups = groupByDate(images);

    if (!dateGroups.length) {
      dom.journalTimeline.innerHTML = '';
      dom.journalEmpty.classList.remove('hidden');
      return;
    }

    dom.journalEmpty.classList.add('hidden');
    dom.journalTimeline.innerHTML = dateGroups.map(renderDayEntry).join('');

    // Bind photo card clicks → lightbox
    dom.journalTimeline.querySelectorAll('.journal-photo-card').forEach((card) => {
      card.addEventListener('click', () => {
        const globalIdx = parseInt(card.dataset.globalIndex);
        openLightbox(globalIdx);
      });
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          const globalIdx = parseInt(card.dataset.globalIndex);
          openLightbox(globalIdx);
        }
      });
    });
  }

  /** Renders one day's journal entry */
  function renderDayEntry(group) {
    const gameSections = groupByGame(group.images);
    const firstGame = gameSections[0];
    const dotColor = firstGame
      ? STATE.gameMap[firstGame.gameId]?.color || 'var(--brown-400)'
      : 'var(--brown-400)';

    const photosHtml = gameSections.map(renderGameSection).join('');

    return `
      <article class="journal-day" role="listitem">
        <div class="journal-day-dot" style="background:${dotColor}" aria-hidden="true"></div>
        <header class="journal-day-header">
          <h3 class="journal-day-date">${group.dateDisplay}</h3>
        </header>
        <div class="journal-day-content">${photosHtml}</div>
      </article>
    `;
  }

  /** Renders one game's photo section within a day */
  function renderGameSection(gs) {
    const game = STATE.gameMap[gs.gameId];
    if (!game) return '';

    // gameId doubles as CSS class (grounded, ghost, wow)
    const cssClass = gs.gameId;

    // Constrain grid for small photo counts
    let gridClass = '';
    if (gs.images.length === 1) gridClass = 'single-photo';
    else if (gs.images.length === 2) gridClass = 'dual-photo';

    const photosHtml = gs.images
      .map((img) => {
        const globalIndex = STATE.allImages.indexOf(img);
        const time = formatTime(img.date_taken);
        const caption = img.caption || '';
        const thumbPath = `${game.imagePath}/thumb/${img.id}.webp`;

        return `
          <div class="journal-photo-card"
               role="listitem"
               tabindex="0"
               data-global-index="${globalIndex}"
               aria-label="照片：${formatDateFull(img.date_taken)} ${time}">
            <img src="${thumbPath}"
                 alt="${game.name} 截图 — ${formatDateFull(img.date_taken)}"
                 loading="lazy">
            <span class="journal-photo-time" aria-hidden="true">${time}</span>
            ${caption ? `<span class="journal-photo-caption">${escapeHtml(caption)}</span>` : ''}
          </div>
        `;
      })
      .join('');

    return `
      <div class="journal-game-section">
        <div class="journal-game-badge ${cssClass}">${game.icon} ${game.name}</div>
        <div class="journal-photos ${gridClass}" role="list" aria-label="${game.name} 截图">
          ${photosHtml}
        </div>
      </div>
    `;
  }

  /* ==========================================================
     Lightbox
     ========================================================== */
  function openLightbox(globalIndex) {
    const targetImg = STATE.allImages[globalIndex];
    if (!targetImg) return;

    const filteredImages = getFilteredImages();
    const filteredIndex = filteredImages.indexOf(targetImg);
    if (filteredIndex === -1) return;

    STATE.currentIndex = filteredIndex;
    updateLightboxImage();
    dom.lightbox.classList.remove('hidden');
    dom.lightbox.setAttribute('aria-hidden', 'false');
    document.documentElement.style.overflow = 'hidden';
    dom.lightbox.querySelector('.lightbox-close').focus();
  }

  function closeLightbox() {
    STATE.currentIndex = -1;
    dom.lightbox.classList.add('hidden');
    dom.lightbox.setAttribute('aria-hidden', 'true');
    document.documentElement.style.overflow = '';
  }

  function updateLightboxImage() {
    const images = getFilteredImages();
    const img = images[STATE.currentIndex];
    if (!img) return;

    const game = STATE.gameMap[img._gameId];
    const fullPath = game
      ? `${game.imagePath}/full/${img.id}.webp`
      : `images/screenshots/full/${img.id}.webp`;

    // Brief opacity fade for transition feel
    dom.lightboxImg.style.opacity = '0';
    setTimeout(() => {
      dom.lightboxImg.src = fullPath;
      dom.lightboxImg.alt = `${game?.name || ''} 截图 — ${formatDateFull(img.date_taken)}`;
      dom.lightboxImg.style.opacity = '1';
    }, 80);

    dom.lightboxGame.textContent = game ? `${game.icon} ${game.name}` : '';
    dom.lightboxDate.textContent =
      formatDateFull(img.date_taken) + ' ' + formatTime(img.date_taken);
    dom.lightboxResolution.textContent = `${img.width || '?'} × ${img.height || '?'}`;
    dom.lightboxCounter.textContent = `${STATE.currentIndex + 1} / ${images.length}`;
  }

  function showPrev() {
    const images = getFilteredImages();
    if (!images.length) return;
    STATE.currentIndex = (STATE.currentIndex - 1 + images.length) % images.length;
    updateLightboxImage();
  }

  function showNext() {
    const images = getFilteredImages();
    if (!images.length) return;
    STATE.currentIndex = (STATE.currentIndex + 1) % images.length;
    updateLightboxImage();
  }

  /* ==========================================================
     Main Render
     ========================================================== */
  function render() {
    const images = getFilteredImages();
    renderStats(images);
    renderFilters();
    renderTimeline(images);
    dom.journalTimeline.classList.remove('hidden');
  }

  /* ==========================================================
     Event Bindings
     ========================================================== */

  // Lightbox controls
  $('#lightbox-close').addEventListener('click', closeLightbox);
  $('#lightbox-bg').addEventListener('click', closeLightbox);
  $('#lightbox-prev').addEventListener('click', showPrev);
  $('#lightbox-next').addEventListener('click', showNext);

  // Keyboard navigation
  document.addEventListener('keydown', function (e) {
    if (dom.lightbox.classList.contains('hidden')) return;
    switch (e.key) {
      case 'Escape':      closeLightbox(); break;
      case 'ArrowLeft':   showPrev();      break;
      case 'ArrowRight':  showNext();      break;
    }
  });

  // Touch swipe for lightbox
  let touchStartX = 0;
  let touchStartY = 0;

  dom.lightbox.addEventListener('touchstart', function (e) {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  });

  dom.lightbox.addEventListener('touchend', function (e) {
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
      dx > 0 ? showPrev() : showNext();
    }
  });

  // Retry button
  $('#btn-retry-journal')?.addEventListener('click', init);

  /* ==========================================================
     Init
     ========================================================== */
  async function init() {
    // Reset UI state
    dom.journalTimeline.classList.add('hidden');
    dom.journalError.classList.add('hidden');
    dom.journalEmpty.classList.add('hidden');
    dom.journalLoading.classList.remove('hidden');
    STATE.activeGames.clear();
    STATE.gameMap = {};
    STATE.currentFilter = null;
    STATE.allImages = [];

    try {
      await loadAllImages();
      render();
    } catch (err) {
      console.error('摄影日志初始化失败:', err);
      dom.journalLoading.classList.add('hidden');
      dom.journalError.classList.remove('hidden');
    }
  }

  init();
})();
