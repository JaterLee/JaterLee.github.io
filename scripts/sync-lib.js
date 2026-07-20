/**
 * sync-lib.js — 通用截图同步核心
 *
 * 所有模块（Grounded / Ghost / WoW）共用同一套同步逻辑。
 * 模块配置在 data/modules.json 的 screenshots 字段，
 * 本地源目录在 scripts/screenshot-config.json（不提交 Git）。
 *
 * 使用 Git Data API 批量提交：所有截图 + manifest 合并为 1 个 commit，
 * 避免每个文件产生独立 commit 导致仓库膨胀。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

// ============================================================
// Config
// ============================================================

const REPO_OWNER = 'JaterLee';
const REPO_NAME = 'JaterLee.github.io';
const API_BASE = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}`;
const CONTENTS_API = `${API_BASE}/contents`;
const GIT_API = `${API_BASE}/git`;
const FULL_MAX = 1920;
const FULL_QUALITY = 85;
const THUMB_WIDTH = 400;
const THUMB_QUALITY = 82;
const BATCH_PREFIX = '📸'; // 批量提交的消息前缀

// ============================================================
// Token
// ============================================================

export function getToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    const match = content.match(/^GITHUB_TOKEN=(.+)$/m);
    if (match) return match[1].trim();
  }
  return null;
}

// ============================================================
// GitHub API Helpers
// ============================================================

function apiHeaders() {
  return {
    Authorization: `token ${getToken()}`,
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'grounded-publish',
  };
}

async function apiRequest(method, urlPath, body) {
  const url = urlPath.startsWith('http') ? urlPath : `${API_BASE}${urlPath}`;
  const opts = { method, headers: apiHeaders() };
  if (body) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`${method} ${urlPath}: ${res.status} ${err.message || ''}`);
  }
  // 204 No Content
  if (res.status === 204) return null;
  return res.json();
}

// ============================================================
// Contents API (single-file, backward compatible)
// ============================================================

export async function githubGet(apiPath) {
  const res = await apiRequest('GET', `/contents/${apiPath}`);
  return res;
}

export async function githubPut(apiPath, contentBase64, message, sha) {
  const body = { message, content: contentBase64 };
  if (sha) body.sha = sha;
  return apiRequest('PUT', `/contents/${apiPath}`, body);
}

// ============================================================
// Git Data API (batch commit — all files in ONE commit)
// ============================================================

/**
 * 获取当前 master 分支的 HEAD commit SHA 和 tree SHA
 * @returns {{commitSha: string, treeSha: string}}
 */
async function getHeadRef() {
  const ref = await apiRequest('GET', '/git/refs/heads/master');
  const commitSha = ref.object.sha;

  const commit = await apiRequest('GET', `/git/commits/${commitSha}`);
  return { commitSha, treeSha: commit.tree.sha };
}

/**
 * 创建 blob 并返回 SHA
 * @param {string} contentBase64
 * @returns {string} blob sha
 */
async function createBlob(contentBase64) {
  const blob = await apiRequest('POST', '/git/blobs', {
    content: contentBase64,
    encoding: 'base64',
  });
  return blob.sha;
}

/**
 * 批量提交多个文件到仓库（单次 commit）
 *
 * 流程：
 *   1. 获取当前 HEAD tree
 *   2. 为每个文件创建 blob
 *   3. 创建新 tree（base_tree + 新 blobs）
 *   4. 创建新 commit
 *   5. 更新 master ref
 *
 * @param {Array<{path: string, contentBase64: string}>} files - 要提交的文件列表
 * @param {string} message - commit 消息
 */
async function githubBatchCommit(files, message) {
  if (!files.length) return null;

  // 1. Get current HEAD and tree
  const { commitSha, treeSha } = await getHeadRef();

  // 2. Create blobs for all new/changed files
  const treeItems = [];
  for (const file of files) {
    const blobSha = await createBlob(file.contentBase64);
    treeItems.push({
      path: file.path,
      mode: '100644',
      type: 'blob',
      sha: blobSha,
    });
  }

  // 3. Create new tree (add/overwrite files on top of base tree)
  const newTree = await apiRequest('POST', '/git/trees', {
    base_tree: treeSha,
    tree: treeItems,
  });

  // 4. Create commit
  const newCommit = await apiRequest('POST', '/git/commits', {
    message,
    tree: newTree.sha,
    parents: [commitSha],
  });

  // 5. Update master ref
  await apiRequest('PATCH', '/git/refs/heads/master', {
    sha: newCommit.sha,
    force: false,
  });

  return newCommit.sha;
}

// ============================================================
// Image Processing (sharp)
// ============================================================

export async function compressImage(sharp, inputPath) {
  const fullBuffer = await sharp(inputPath)
    .resize({ width: FULL_MAX, height: FULL_MAX, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: FULL_QUALITY })
    .toBuffer();

  const fullMeta = await sharp(fullBuffer).metadata();

  // Thumb: resize to THUMB_WIDTH, then center-crop 16:10
  const resized = await sharp(inputPath)
    .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
    .toBuffer({ resolveWithObject: true });

  const rMeta = await sharp(resized.data).metadata();
  const cropW = Math.min(rMeta.width, THUMB_WIDTH);
  const cropH = Math.min(rMeta.height, Math.round(cropW / (16 / 10)));
  const topOffset = Math.max(0, Math.round((rMeta.height - cropH) / 2));
  const leftOffset = Math.max(0, Math.round((rMeta.width - cropW) / 2));

  const thumbBuffer = await sharp(resized.data)
    .extract({ left: leftOffset, top: topOffset, width: cropW, height: cropH })
    .webp({ quality: THUMB_QUALITY })
    .toBuffer();

  return {
    fullBuffer,
    thumbBuffer,
    width: fullMeta.width,
    height: fullMeta.height,
  };
}

// ============================================================
// Filename Parsing (generic, supports multiple patterns)
// ============================================================

/**
 * 将 screenshots 配置规范化为 pattern 数组。
 * 支持 filename_patterns（数组）或 filename_pattern（单字符串，向后兼容）。
 */
function normalizePatterns(sc) {
  if (sc.filename_patterns) {
    // Inherit id_prefix from parent config if not specified in pattern
    return sc.filename_patterns.map(function (pc) {
      return {
        pattern: pc.pattern,
        date_group_map: pc.date_group_map || [1, 2, 3, 4, 5, 6],
        year_is_short: pc.year_is_short || false,
        id_prefix: pc.id_prefix || sc.id_prefix,
      };
    });
  }
  return [{
    pattern: sc.filename_pattern,
    date_group_map: sc.date_group_map || [1, 2, 3, 4, 5, 6],
    year_is_short: sc.year_is_short || false,
    id_prefix: sc.id_prefix,
  }];
}

/**
 * 根据模块配置解析截图文件名。
 * 支持 filename_patterns 数组，逐一尝试匹配。
 *
 * @param {string} filename - 原始文件名
 * @param {object} sc - screenshots 配置
 * @returns {{id: string, dateTaken: string} | null}
 */
export function parseScreenshotFilename(filename, sc) {
  const patterns = normalizePatterns(sc);

  for (const pc of patterns) {
    const regex = new RegExp(pc.pattern, 'i');
    const match = filename.match(regex);
    if (!match) continue;

    const map = pc.date_group_map || [1, 2, 3, 4, 5, 6];

    let year = match[map[0]];
    const month = match[map[1]].padStart(2, '0');
    const day = match[map[2]].padStart(2, '0');
    const hour = match[map[3]].padStart(2, '0');
    const minute = match[map[4]].padStart(2, '0');
    const second = match[map[5]].padStart(2, '0');

    // Handle 2-digit year (e.g. WoW: "26" → "2026")
    if (pc.year_is_short) {
      year = year.length === 2 ? '20' + year : year;
    }
    year = year.padStart(4, '0');

    return {
      id: `${pc.id_prefix}-${year}${month}${day}-${hour}${minute}${second}`,
      dateTaken: `${year}-${month}-${day}T${hour}:${minute}:${second}`,
    };
  }

  return null;
}

// ============================================================
// Config Loaders
// ============================================================

/**
 * 从 modules.json 读取所有模块的 screenshots 配置
 * @returns {Array<{moduleId: string, sc: object}>}
 */
export function loadModuleScreenshotConfigs() {
  const modulesPath = path.join(PROJECT_ROOT, 'data', 'modules.json');
  if (!fs.existsSync(modulesPath)) {
    throw new Error('data/modules.json 不存在');
  }
  const modulesData = JSON.parse(fs.readFileSync(modulesPath, 'utf-8'));
  const result = [];
  for (const mod of modulesData.modules || []) {
    if (mod.screenshots) {
      result.push({ moduleId: mod.id, sc: mod.screenshots });
    }
  }
  return result;
}

/**
 * 从 screenshot-config.json 读取本地源目录
 * @returns {object} { moduleId: local_source_dir }
 */
export function loadLocalSourceDirs() {
  const configPath = path.join(__dirname, 'screenshot-config.json');
  if (!fs.existsSync(configPath)) {
    return {};
  }
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  const result = {};
  for (const [moduleId, cfg] of Object.entries(config)) {
    if (cfg && cfg.local_source_dir) {
      result[moduleId] = cfg.local_source_dir;
    }
  }
  return result;
}

// ============================================================
// Unified Sync Function (batch commit version)
// ============================================================

/**
 * 同步单个模块的截图：扫描 → 压缩 → 批量提交（1 个 commit）
 *
 * @param {string} moduleId - 模块 ID（如 "grounded"）
 * @param {object} sc - screenshots 配置（来自 modules.json）
 * @param {string} localSourceDir - 本地截图目录
 * @param {{log: Function}} options
 * @returns {Promise<{uploaded: number, latestId: string|null, latestFile: string|null}>}
 */
/**
 * 补全缺失的本地 webp 文件——从源截图重新压缩并保存到本地。
 * 仅在 manifest 有记录但本地文件缺失时才操作，不上传到远程。
 */
async function repairMissingLocalFiles(moduleId, sc, localSourceDir, imagesData, sharp, log) {
  const fullDir = path.join(PROJECT_ROOT, sc.image_path, 'full');
  const thumbDir = path.join(PROJECT_ROOT, sc.image_path, 'thumb');
  fs.mkdirSync(fullDir, { recursive: true });
  fs.mkdirSync(thumbDir, { recursive: true });

  const missing = [];
  for (const img of imagesData.images || []) {
    const fullPath = path.join(fullDir, `${img.id}.webp`);
    const thumbPath = path.join(thumbDir, `${img.id}.webp`);
    if (!fs.existsSync(fullPath) || !fs.existsSync(thumbPath)) {
      missing.push(img);
    }
  }

  if (!missing.length) return 0;

  log(`   🔧 [${moduleId}] 补全 ${missing.length} 个缺失的本地 webp 文件...`);
  let repaired = 0;

  for (const img of missing) {
    // 尝试匹配源文件（支持多种扩展名）
    let sourcePath = null;
    for (const ext of ['.png', '.jpg', '.jpeg']) {
      const testPath = path.join(localSourceDir, img.filename + ext);
      if (fs.existsSync(testPath)) { sourcePath = testPath; break; }
    }
    if (!sourcePath) {
      log(`   ⚠️  找不到源文件: ${img.filename}，跳过`);
      continue;
    }

    try {
      const result = await compressImage(sharp, sourcePath);
      fs.writeFileSync(path.join(fullDir, `${img.id}.webp`), result.fullBuffer);
      fs.writeFileSync(path.join(thumbDir, `${img.id}.webp`), result.thumbBuffer);
      repaired++;
    } catch (err) {
      log(`   ❌ ${img.filename}: ${err.message}`);
    }
  }

  log(`   ✅ [${moduleId}] 补全完成: ${repaired}/${missing.length}`);
  return repaired;
}

export async function syncScreenshots(moduleId, sc, localSourceDir, { log = console.log } = {}) {
  if (!localSourceDir || !fs.existsSync(localSourceDir)) {
    log(`⚠️  [${moduleId}] 截图目录不存在，跳过 (${localSourceDir || '未配置'})`);
    return { uploaded: 0, latestId: null, latestFile: null };
  }

  const sharp = (await import('sharp')).default;
  const localFiles = fs.readdirSync(localSourceDir)
    .filter((f) => /\.(png|jpe?g)$/i.test(f))
    .sort();

  log(`📂 [${moduleId}] 本地截图: ${localFiles.length} 张`);

  if (!localFiles.length) {
    return { uploaded: 0, latestId: null, latestFile: null };
  }

  // Read remote manifest
  let imagesData;
  try {
    const res = await githubGet(sc.data_file);
    imagesData = JSON.parse(Buffer.from(res.content, 'base64').toString('utf-8'));
    log(`   远程已有 ${imagesData.total || 0} 张`);
  } catch {
    imagesData = { last_updated: new Date().toISOString().slice(0, 10), total: 0, images: [] };
    log('   远程清单不存在，将新建');
  }

  const existingIds = new Set((imagesData.images || []).map((img) => img.id));

  // Find new files
  const newFiles = [];
  for (const f of localFiles) {
    const parsed = parseScreenshotFilename(f, sc);
    if (parsed && existingIds.has(parsed.id)) continue;
    newFiles.push({ filename: f, parsed });
  }

  log(`📸 [${moduleId}] 新截图: ${newFiles.length} 张`);

  if (!newFiles.length) {
    // Ensure local manifest exists
    const localManifest = path.join(PROJECT_ROOT, sc.data_file);
    if (!fs.existsSync(localManifest)) {
      const jsonStr = JSON.stringify(imagesData, null, 2);
      fs.writeFileSync(localManifest, jsonStr, 'utf-8');
      log(`   [${moduleId}] 本地 ${sc.data_file} 已创建`);
    }
    log(`   [${moduleId}] 没有新截图`);
    // 补全缺失的本地 webp 文件（远程有但本地没有）
    await repairMissingLocalFiles(moduleId, sc, localSourceDir, imagesData, sharp, log);
    // Get latest existing image as fallback
    const sorted = [...(imagesData.images || [])].sort(
      (a, b) => new Date(b.date_taken) - new Date(a.date_taken)
    );
    return {
      uploaded: 0,
      latestId: sorted.length > 0 ? sorted[0].id : null,
      latestFile: sorted.length > 0 ? sorted[0].filename : null,
    };
  }

  // ==========================================================
  // Phase 1: Compress all new screenshots (no upload yet)
  // ==========================================================
  const batchFiles = [];  // { path, contentBase64 }
  let latestId = null;
  let latestFile = null;
  let uploaded = 0;
  const today = new Date().toISOString().slice(0, 10);

  for (const { filename, parsed } of newFiles) {
    const inputPath = path.join(localSourceDir, filename);
    const stat = fs.statSync(inputPath);
    const sizeMB = (stat.size / (1024 * 1024)).toFixed(1);

    try {
      log(`  处理: ${filename} (${sizeMB} MB)`);
      const result = await compressImage(sharp, inputPath);
      const fullKB = (result.fullBuffer.length / 1024).toFixed(1);
      const thumbKB = (result.thumbBuffer.length / 1024).toFixed(1);
      log(`  压缩: 完整图 ${fullKB} KB, 缩略图 ${thumbKB} KB`);

      const info = parsed || {
        id: `${sc.id_prefix}-${Date.now()}`,
        dateTaken: new Date().toISOString().replace(/\.\d{3}Z$/, ''),
      };

      // 写入本地磁盘，避免远程独有 commit 导致 push 前必须 pull
      const fullDir = path.join(PROJECT_ROOT, sc.image_path, 'full');
      const thumbDir = path.join(PROJECT_ROOT, sc.image_path, 'thumb');
      fs.mkdirSync(fullDir, { recursive: true });
      fs.mkdirSync(thumbDir, { recursive: true });
      const fullPath = path.join(fullDir, `${info.id}.webp`);
      const thumbPath = path.join(thumbDir, `${info.id}.webp`);
      fs.writeFileSync(fullPath, result.fullBuffer);
      fs.writeFileSync(thumbPath, result.thumbBuffer);

      // Stage files for batch commit
      batchFiles.push({
        path: `${sc.image_path}/full/${info.id}.webp`,
        contentBase64: result.fullBuffer.toString('base64'),
      });
      batchFiles.push({
        path: `${sc.image_path}/thumb/${info.id}.webp`,
        contentBase64: result.thumbBuffer.toString('base64'),
      });

      // Update manifest in memory
      imagesData.images.push({
        id: info.id,
        filename: filename.replace(/\.(png|jpe?g)$/i, ''),
        date_taken: info.dateTaken,
        file_size_original: stat.size,
        file_size_webp: result.fullBuffer.length,
        width: result.width,
        height: result.height,
        tags: [],
        caption: '',
      });

      uploaded++;
      latestId = info.id;
      latestFile = filename;
      log(`  ✅ 已暂存`);
    } catch (err) {
      log(`  ❌ ${filename}: ${err.message}`);
    }
  }

  if (uploaded === 0) {
    log(`   [${moduleId}] 没有成功压缩的截图`);
    return { uploaded: 0, latestId: null, latestFile: null };
  }

  // ==========================================================
  // Phase 2: Add manifest to batch + single commit via Git Data API
  // ==========================================================
  imagesData.last_updated = today;
  imagesData.total = imagesData.images.length;
  const manifestJson = JSON.stringify(imagesData, null, 2);
  const manifestB64 = Buffer.from(manifestJson).toString('base64');

  batchFiles.push({
    path: sc.data_file,
    contentBase64: manifestB64,
  });

  const totalFiles = batchFiles.length;
  log(`\n📦 [${moduleId}] 批量提交 ${totalFiles} 个文件 (${uploaded} 张截图 + manifest)...`);

  try {
    const commitMessage = `${BATCH_PREFIX} Sync ${moduleId}: ${uploaded} screenshot(s)`;
    await githubBatchCommit(batchFiles, commitMessage);
    log(`✅ [${moduleId}] 批量提交成功 (1 commit, ${totalFiles} files)`);
  } catch (err) {
    log(`❌ [${moduleId}] 批量提交失败: ${err.message}`);
    // If batch fails, try individual uploads as fallback?? No, that would create many commits.
    // Just fail and let the user retry.
    throw err;
  }

  // Save manifest locally for local preview
  const localManifest = path.join(PROJECT_ROOT, sc.data_file);
  fs.writeFileSync(localManifest, manifestJson, 'utf-8');
  log(`✅ [${moduleId}] ${sc.data_file} 已更新 (${imagesData.total} 张) [本地+远程]`);

  // 补全缺失的本地 webp 文件（旧条目可能只有远程有）
  await repairMissingLocalFiles(moduleId, sc, localSourceDir, imagesData, sharp, log);

  return { uploaded, latestId, latestFile };
}

// ============================================================
// Sync All Modules
// ============================================================

/**
 * 同步所有配置了 screenshots 的模块
 * @param {{log: Function}} options
 * @returns {Promise<Array<{moduleId: string, uploaded: number, error?: string}>>}
 */
export async function syncAllModules({ log = console.log } = {}) {
  const moduleConfigs = loadModuleScreenshotConfigs();
  const localDirs = loadLocalSourceDirs();

  log('🔄 同步所有模块截图...\n');
  log(`   已配置模块: ${moduleConfigs.map((m) => m.moduleId).join(', ')}`);
  log(`   本地目录已配置: ${Object.keys(localDirs).join(', ') || '(无)'}\n`);

  const results = [];

  for (const { moduleId, sc } of moduleConfigs) {
    const localDir = localDirs[moduleId];
    if (!localDir) {
      log(`⚠️  [${moduleId}] 未配置本地源目录 (screenshot-config.json)，跳过\n`);
      results.push({ moduleId, uploaded: 0, error: '未配置本地源目录' });
      continue;
    }

    try {
      const result = await syncScreenshots(moduleId, sc, localDir, { log });
      results.push({ moduleId, uploaded: result.uploaded });
      log('');
    } catch (err) {
      log(`❌ [${moduleId}] 同步失败: ${err.message}\n`);
      results.push({ moduleId, uploaded: 0, error: err.message });
    }
  }

  const totalUploaded = results.reduce((sum, r) => sum + r.uploaded, 0);
  log(`\n✅ 全部完成！共同步 ${totalUploaded} 张截图`);

  return results;
}
