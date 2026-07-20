/**
 * Grounded Saves — admin.js
 * GitHub API 驱动的存档/日志发布
 */
(function () {
  'use strict';

  const REPO_OWNER = 'JaterLee';
  const REPO_NAME = 'JaterLee.github.io';
  const API_BASE = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents`;
  const TOKEN_KEY = 'gh_pat_grounded_saves';

  /* ==========================================================
     DOM
     ========================================================== */
  const $ = (sel) => document.querySelector(sel);

  const dom = {
    // Token
    tokenInput: $('#token-input'),
    tokenStatus: $('#token-status'),
    tokenIndicator: $('#token-indicator'),
    tokenLabel: $('#token-label'),
    btnSaveToken: $('#btn-save-token'),
    btnClearToken: $('#btn-clear-token'),

    // Save form
    btnPublishSave: $('#btn-publish-save'),
    saveFileInput: $('#save-file-input'),
    saveFileName: $('#save-file-name'),
    saveHint: $('#save-hint'),
    dropZone: $('#save-drop-zone'),

    // Changelog form
    btnPublishChangelog: $('#btn-publish-changelog'),

    // Screenshot form
    screenshotDropZone: $('#screenshot-drop-zone'),
    screenshotFileInput: $('#screenshot-file-input'),
    screenshotPreviews: $('#screenshot-previews'),
    screenshotTags: $('#screenshot-tags'),
    btnUploadScreenshots: $('#btn-upload-screenshots'),
    screenshotHint: $('#screenshot-hint'),
    compressionInfo: $('#compression-info'),

    // Log
    logContainer: $('#log-container'),
    btnClearLog: $('#btn-clear-log'),
  };

  /* ==========================================================
     Token Management
     ========================================================== */
  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  function saveToken(token) {
    localStorage.setItem(TOKEN_KEY, token);
    updateTokenUI();
  }

  function clearToken() {
    localStorage.removeItem(TOKEN_KEY);
    dom.tokenInput.value = '';
    updateTokenUI();
  }

  function updateTokenUI() {
    const token = getToken();
    if (token) {
      dom.tokenIndicator.classList.add('active');
      dom.tokenLabel.textContent = '已配置';
      dom.tokenInput.value = token;
    } else {
      dom.tokenIndicator.classList.remove('active');
      dom.tokenLabel.textContent = '未配置 — 请先设置 Token';
    }
  }

  /* ==========================================================
     GitHub API
     ========================================================== */
  async function githubGet(path) {
    const res = await fetch(`${API_BASE}/${path}`, {
      headers: {
        Authorization: `token ${getToken()}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `GET ${path}: ${res.status}`);
    }
    return res.json();
  }

  async function githubPut(path, contentBase64, message, sha) {
    const body = { message, content: contentBase64 };
    if (sha) body.sha = sha;

    const res = await fetch(`${API_BASE}/${path}`, {
      method: 'PUT',
      headers: {
        Authorization: `token ${getToken()}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `PUT ${path}: ${res.status}`);
    }
    return res.json();
  }

  /* ==========================================================
     Helpers
     ========================================================== */
  function base64FromArrayBuffer(buf) {
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  function base64FromString(str) {
    return btoa(unescape(encodeURIComponent(str)));
  }

  function todayStr() {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  }

  function slugify(text) {
    return text
      .toLowerCase()
      .replace(/[^\w一-鿿]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40);
  }

  function nowTime() {
    return new Date().toLocaleTimeString('zh-CN', { hour12: false });
  }

  /* ==========================================================
     Logging
     ========================================================== */
  function addLog(msg, type) {
    type = type || 'info';
    const time = nowTime();
    const entry = document.createElement('div');
    entry.className = `log-entry log-${type}`;
    entry.innerHTML = `<span class="log-time">${time}</span><span class="log-msg">${msg}</span>`;

    // Remove empty-state
    const empty = dom.logContainer.querySelector('.log-empty');
    if (empty) empty.remove();

    dom.logContainer.prepend(entry);

    // Keep max 50 entries
    while (dom.logContainer.children.length > 50) {
      dom.logContainer.lastChild.remove();
    }
  }

  /* ==========================================================
     File Upload Handling
     ========================================================== */
  let selectedFile = null;

  function setSelectedFile(file) {
    selectedFile = file;
    dom.saveFileName.textContent = file ? `✅ ${file.name} (${formatSize(file.size)})` : '';
    updatePublishButton();
  }

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  // Click to select
  dom.dropZone.addEventListener('click', () => dom.saveFileInput.click());

  // File input change
  dom.saveFileInput.addEventListener('change', () => {
    if (dom.saveFileInput.files.length) {
      setSelectedFile(dom.saveFileInput.files[0]);
    }
  });

  // Drag & drop
  dom.dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dom.dropZone.classList.add('dragover');
  });
  dom.dropZone.addEventListener('dragleave', () => {
    dom.dropZone.classList.remove('dragover');
  });
  dom.dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dom.dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length) {
      setSelectedFile(e.dataTransfer.files[0]);
    }
  });

  /* ==========================================================
     Form Value Helpers
     ========================================================== */
  function getSaveFormData() {
    const title = $('#save-title').value.trim();
    const version = $('#save-version').value.trim();
    const desc = $('#save-desc').value.trim();
    const days = parseInt($('#save-days').value) || 0;
    const tier = $('#save-tier').value;
    const players = $('#save-players').value.split(',').map((s) => s.trim()).filter(Boolean);
    const bases = $('#save-bases').value.split(',').map((s) => s.trim()).filter(Boolean);
    const biomes = $('#save-biomes').value.split(',').map((s) => s.trim()).filter(Boolean);
    const bossRaw = $('#save-bosses').value.split(',').map((s) => s.trim()).filter(Boolean);
    const highlights = $('#save-highlights').value.split('\n').map((s) => s.trim()).filter(Boolean);
    const tags = $('#save-tags').value.split(',').map((s) => s.trim()).filter(Boolean);

    const bosses = bossRaw.map((b) => {
      const m = b.match(/^(.+)x(\d+)$/);
      return m ? { name: m[1].trim(), times_defeated: parseInt(m[2]) } : { name: b, times_defeated: 1 };
    });

    return { title, version, desc, days, tier, players, bases, biomes, bosses, highlights, tags };
  }

  function getChangelogFormData() {
    return {
      type: $('#changelog-type').value,
      title: $('#changelog-title').value.trim(),
      desc: $('#changelog-desc').value.trim(),
    };
  }

  function updatePublishButton() {
    const valid = !!selectedFile && !!$('#save-title').value.trim();
    dom.btnPublishSave.disabled = !valid;
    dom.saveHint.textContent = valid ? '' : '请填写标题并上传 ZIP 文件';
  }

  // Track form changes
  ['#save-title'].forEach((sel) => {
    $(sel).addEventListener('input', updatePublishButton);
  });

  /* ==========================================================
     Publish Save
     ========================================================== */
  dom.btnPublishSave.addEventListener('click', async () => {
    const token = getToken();
    if (!token) {
      addLog('请先设置 GitHub Token', 'error');
      return;
    }

    const data = getSaveFormData();
    if (!data.title) {
      addLog('请填写存档标题', 'error');
      return;
    }
    if (!selectedFile) {
      addLog('请上传存档 ZIP 文件', 'error');
      return;
    }

    dom.btnPublishSave.disabled = true;
    dom.btnPublishSave.textContent = '⏳ 发布中...';
    addLog(`开始发布存档: ${data.title}`, 'info');

    try {
      // 1. Read zip file as base64
      const zipBuf = await selectedFile.arrayBuffer();
      const zipBase64 = base64FromArrayBuffer(zipBuf);

      // 2. Generate safe filename
      const dateStr = todayStr();
      const slug = slugify(data.title);
      const zipFilename = `save-${dateStr}-${slug}.zip`;
      const saveId = `save-${dateStr}-${slug}`;

      // 3. Read current saves.json from GitHub
      addLog('读取当前 saves.json...', 'info');
      let savesData;
      let savesSha;
      try {
        const res = await githubGet('data/saves.json');
        savesData = JSON.parse(decodeURIComponent(escape(atob(res.content))));
        savesSha = res.sha;
      } catch (err) {
        addLog(`读取 saves.json 失败: ${err.message}`, 'error');
        throw err;
      }

      // 4. Upload zip file
      addLog(`上传 ${zipFilename}...`, 'info');
      await githubPut(
        `saves/${zipFilename}`,
        zipBase64,
        `Add save: ${data.title}`,
        undefined // new file, no SHA needed
      );

      // 5. Update saves.json
      const newSave = {
        id: saveId,
        title: data.title,
        description: data.desc || `${data.title} — 第 ${data.days} 天`,
        filename: zipFilename,
        file_size_bytes: selectedFile.size,
        date_added: dateStr,
        game_version: data.version || '1.4.7',
        thumbnail: null,
        stats: {
          days_survived: data.days,
          players: data.players,
          tier_reached: data.tier,
          bases: data.bases,
          biomes_explored: data.biomes,
          bosses_defeated: data.bosses,
        },
        highlights: data.highlights,
        tags: data.tags,
      };

      savesData.saves.push(newSave);
      savesData.last_updated = dateStr;
      savesData.total_saves = savesData.saves.length;

      const savesJson = JSON.stringify(savesData, null, 2);
      const savesBase64 = base64FromString(savesJson);

      addLog('更新 saves.json...', 'info');
      await githubPut(
        'data/saves.json',
        savesBase64,
        `Add save entry: ${data.title}`,
        savesSha
      );

      addLog(`✅ 存档发布成功！${zipFilename}`, 'success');

      // Clear form
      $('#save-title').value = '';
      $('#save-desc').value = '';
      $('#save-days').value = '';
      $('#save-players').value = '';
      $('#save-bases').value = '';
      $('#save-biomes').value = '';
      $('#save-bosses').value = '';
      $('#save-highlights').value = '';
      $('#save-tags').value = '';
      setSelectedFile(null);
      dom.saveFileInput.value = '';
    } catch (err) {
      addLog(`❌ 发布失败: ${err.message}`, 'error');
    } finally {
      dom.btnPublishSave.disabled = false;
      dom.btnPublishSave.textContent = '🚀 发布存档';
      updatePublishButton();
    }
  });

  /* ==========================================================
     Publish Changelog
     ========================================================== */
  dom.btnPublishChangelog.addEventListener('click', async () => {
    const token = getToken();
    if (!token) {
      addLog('请先设置 GitHub Token', 'error');
      return;
    }

    const data = getChangelogFormData();
    if (!data.title) {
      addLog('请填写日志标题', 'error');
      return;
    }

    dom.btnPublishChangelog.disabled = true;
    dom.btnPublishChangelog.textContent = '⏳ 发布中...';
    addLog(`开始发布日志: ${data.title}`, 'info');

    try {
      const dateStr = todayStr();
      const slug = slugify(data.title);
      const entryId = `chg-${dateStr}-${slug}`;

      // Read current changelog.json
      addLog('读取当前 changelog.json...', 'info');
      let changelogData;
      let changelogSha;
      try {
        const res = await githubGet('data/changelog.json');
        changelogData = JSON.parse(decodeURIComponent(escape(atob(res.content))));
        changelogSha = res.sha;
      } catch (err) {
        addLog(`读取 changelog.json 失败: ${err.message}`, 'error');
        throw err;
      }

      // Add new entry (newest first)
      const newEntry = {
        id: entryId,
        date: dateStr,
        type: data.type,
        title: data.title,
        description: data.desc || data.title,
        tags: [],
      };

      changelogData.entries.unshift(newEntry);
      changelogData.last_updated = dateStr;
      changelogData.total_entries = changelogData.entries.length;

      const changelogJson = JSON.stringify(changelogData, null, 2);
      const changelogBase64 = base64FromString(changelogJson);

      addLog('更新 changelog.json...', 'info');
      await githubPut(
        'data/changelog.json',
        changelogBase64,
        `Add changelog: ${data.title}`,
        changelogSha
      );

      addLog(`✅ 日志发布成功！`, 'success');

      // Clear form
      $('#changelog-title').value = '';
      $('#changelog-desc').value = '';
    } catch (err) {
      addLog(`❌ 发布失败: ${err.message}`, 'error');
    } finally {
      dom.btnPublishChangelog.disabled = false;
      dom.btnPublishChangelog.textContent = '🚀 发布日志';
    }
  });

  /* ==========================================================
     Screenshot Upload State & Handlers
     ========================================================== */
  let selectedScreenshots = [];

  function handleScreenshotFiles(fileList) {
    const valid = Array.from(fileList).filter((f) => f.type.startsWith('image/'));
    if (!valid.length) {
      addLog('未检测到有效的图片文件', 'error');
      return;
    }
    selectedScreenshots = valid;
    renderScreenshotPreviews();
    updateScreenshotButton();
    const estTotalKB = valid.length * 280; // 完整图 ~250KB + 缩略图 ~15KB
    dom.compressionInfo.textContent =
      '预计总上传大小 ~' + formatSize(estTotalKB * 1024) + '（' + valid.length + ' 张）';
  }

  function renderScreenshotPreviews() {
    dom.screenshotPreviews.innerHTML = selectedScreenshots
      .map(
        (f, i) =>
          `<div class="screenshot-preview">
            <img src="${URL.createObjectURL(f)}" alt="预览 ${i + 1}" class="screenshot-preview-img">
            <span class="screenshot-preview-name" title="${escapeAttr(f.name)}">${escapeAttr(f.name)}</span>
            <span class="screenshot-preview-size">${formatSize(f.size)}</span>
          </div>`
      )
      .join('');
  }

  function updateScreenshotButton() {
    const valid = selectedScreenshots.length > 0;
    dom.btnUploadScreenshots.disabled = !valid;
    dom.btnUploadScreenshots.textContent = valid
      ? '🚀 上传截图（' + selectedScreenshots.length + ' 张）'
      : '🚀 上传截图（0 张）';
    dom.screenshotHint.textContent = valid ? '' : '请至少选择一张截图';
  }

  function escapeAttr(str) {
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /**
   * 从 Grounded 截图文件名生成 ID
   * Grounded_2026.07.15-23.49.20.png → grounded-20260715-234920
   */
  function generateScreenshotId(filename) {
    var match = filename.match(/Grounded_(\d{4})\.(\d{2})\.(\d{2})-(\d{2})\.(\d{2})\.(\d{2})/);
    if (match) {
      return 'grounded-' + match[1] + match[2] + match[3] + '-' + match[4] + match[5] + match[6];
    }
    // Fallback: 用文件名（去扩展名）生成
    var clean = filename.replace(/\.(png|jpe?g|webp)$/i, '').replace(/[^\w一-鿿]+/g, '-').slice(0, 40);
    return 'img-' + todayStr().replace(/-/g, '') + '-' + clean;
  }

  /**
   * 从文件名解析拍摄日期
   * Grounded_2026.07.15-23.49.20.png → 2026-07-15T23:49:20
   */
  function parseDateTaken(filename) {
    var match = filename.match(/(\d{4})\.(\d{2})\.(\d{2})-(\d{2})\.(\d{2})\.(\d{2})/);
    if (match) {
      return match[1] + '-' + match[2] + '-' + match[3] + 'T' + match[4] + ':' + match[5] + ':' + match[6];
    }
    return new Date().toISOString().replace(/\.\d{3}Z$/, '');
  }

  // Click to select screenshots
  dom.screenshotDropZone.addEventListener('click', function () {
    dom.screenshotFileInput.click();
  });

  // File input change
  dom.screenshotFileInput.addEventListener('change', function () {
    if (dom.screenshotFileInput.files.length) {
      handleScreenshotFiles(dom.screenshotFileInput.files);
    }
  });

  // Drag & drop screenshots
  dom.screenshotDropZone.addEventListener('dragover', function (e) {
    e.preventDefault();
    dom.screenshotDropZone.classList.add('dragover');
  });
  dom.screenshotDropZone.addEventListener('dragleave', function () {
    dom.screenshotDropZone.classList.remove('dragover');
  });
  dom.screenshotDropZone.addEventListener('drop', function (e) {
    e.preventDefault();
    dom.screenshotDropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length) {
      handleScreenshotFiles(e.dataTransfer.files);
    }
  });

  /* ==========================================================
     Upload Screenshots
     ========================================================== */
  dom.btnUploadScreenshots.addEventListener('click', async function () {
    var token = getToken();
    if (!token) {
      addLog('请先设置 GitHub Token', 'error');
      return;
    }
    if (!selectedScreenshots.length) {
      addLog('请选择截图文件', 'error');
      return;
    }
    if (!window.ImageUtil || !window.ImageUtil.compressImage) {
      addLog('图片压缩模块未加载，请刷新页面后重试', 'error');
      return;
    }

    dom.btnUploadScreenshots.disabled = true;
    dom.btnUploadScreenshots.textContent = '⏳ 压缩上传中...';
    var successCount = 0;
    var tags = dom.screenshotTags.value
      .split(',')
      .map(function (s) { return s.trim(); })
      .filter(Boolean);

    try {
      // 1. 读取当前 images.json
      addLog('读取 images.json...', 'info');
      var imagesData, imagesSha;
      try {
        var imgRes = await githubGet('data/images.json');
        imagesData = JSON.parse(decodeURIComponent(escape(atob(imgRes.content))));
        imagesSha = imgRes.sha;
      } catch (err) {
        // 文件不存在，从空开始
        imagesData = { last_updated: todayStr(), total: 0, images: [] };
        imagesSha = undefined;
      }

      var existingIds = {};
      (imagesData.images || []).forEach(function (img) {
        existingIds[img.id] = true;
      });

      // 2. 逐个处理
      for (var i = 0; i < selectedScreenshots.length; i++) {
        var file = selectedScreenshots[i];
        try {
          var id = generateScreenshotId(file.name);
          if (existingIds[id]) {
            addLog('跳过已存在: ' + file.name, 'info');
            continue;
          }

          addLog('压缩: ' + file.name + ' (' + formatSize(file.size) + ')', 'info');

          // 压缩
          var result = await window.ImageUtil.compressImage(file, {
            fullMax: 1920,
            fullQuality: 0.85,
            thumbWidth: 400,
            thumbQuality: 0.82,
          });

          addLog(
            '压缩完成: 完整图 ' + formatSize(result.fullBlob.size) + ', 缩略图 ' + formatSize(result.thumbBlob.size),
            'info'
          );

          // 上传完整图
          var fullPath = 'images/screenshots/full/' + id + '.webp';
          addLog('上传: ' + fullPath, 'info');
          await githubPut(fullPath, result.fullBase64, 'Add screenshot: ' + id, undefined);

          // 上传缩略图
          var thumbPath = 'images/screenshots/thumb/' + id + '.webp';
          addLog('上传缩略图: ' + thumbPath, 'info');
          await githubPut(thumbPath, result.thumbBase64, 'Add screenshot thumb: ' + id, undefined);

          // 添加到清单
          var dateTaken = parseDateTaken(file.name);
          imagesData.images.push({
            id: id,
            filename: file.name.replace(/\.(png|jpe?g|webp)$/i, ''),
            date_taken: dateTaken,
            file_size_original: file.size,
            file_size_webp: result.fullBlob.size,
            width: result.width,
            height: result.height,
            tags: tags,
            caption: '',
          });

          existingIds[id] = true;
          successCount++;
          addLog('✅ ' + file.name + ' 上传成功', 'success');
        } catch (err) {
          addLog('❌ ' + file.name + ' 失败: ' + err.message, 'error');
        }
      }

      // 3. 更新 images.json
      if (successCount > 0) {
        imagesData.last_updated = todayStr();
        imagesData.total = imagesData.images.length;
        var jsonStr = JSON.stringify(imagesData, null, 2);
        var jsonBase64 = base64FromString(jsonStr);
        addLog('更新 images.json (' + imagesData.total + ' 张)...', 'info');
        await githubPut('data/images.json', jsonBase64, 'Add ' + successCount + ' screenshot(s)', imagesSha);
        addLog('✅ 成功上传 ' + successCount + ' 张截图！<a href="gallery.html">去摄影日志查看 →</a>', 'success');
      } else {
        addLog('没有新截图需要上传', 'info');
      }

      // 清理
      selectedScreenshots = [];
      dom.screenshotFileInput.value = '';
      dom.screenshotPreviews.innerHTML = '';
      dom.compressionInfo.textContent = '';
      dom.screenshotTags.value = '';
    } catch (err) {
      addLog('❌ 上传失败: ' + err.message, 'error');
    } finally {
      updateScreenshotButton();
    }
  });

  /* ==========================================================
     Event Bindings
     ========================================================== */
  dom.btnSaveToken.addEventListener('click', () => {
    const token = dom.tokenInput.value.trim();
    if (!token) {
      addLog('请输入有效的 Token', 'error');
      return;
    }
    saveToken(token);
    addLog('Token 已保存', 'success');
  });

  dom.btnClearToken.addEventListener('click', () => {
    if (confirm('确定清除已保存的 Token？')) {
      clearToken();
      addLog('Token 已清除', 'info');
    }
  });

  dom.btnClearLog.addEventListener('click', () => {
    dom.logContainer.innerHTML = '<p class="log-empty">暂无操作记录</p>';
  });

  /* ==========================================================
     Init
     ========================================================== */
  updateTokenUI();
  updatePublishButton();
  addLog('管理后台已就绪', 'info');
})();
