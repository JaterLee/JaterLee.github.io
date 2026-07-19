/**
 * sync-lib.js — 通用截图同步核心
 *
 * 所有模块（Grounded / Ghost / WoW）共用同一套同步逻辑。
 * 模块配置在 data/modules.json 的 screenshots 字段，
 * 本地源目录在 scripts/screenshot-config.json（不提交 Git）。
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
const API_BASE = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents`;
const FULL_MAX = 1920;
const FULL_QUALITY = 85;
const THUMB_WIDTH = 400;
const THUMB_QUALITY = 82;

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
// GitHub API
// ============================================================

export async function githubGet(apiPath) {
  const url = `${API_BASE}/${apiPath}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `token ${getToken()}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'grounded-publish',
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`GET ${apiPath}: ${res.status} ${err.message || ''}`);
  }
  return res.json();
}

export async function githubPut(apiPath, contentBase64, message, sha) {
  const url = `${API_BASE}/${apiPath}`;
  const body = { message, content: contentBase64 };
  if (sha) body.sha = sha;

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `token ${getToken()}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'grounded-publish',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`PUT ${apiPath}: ${res.status} ${err.message || ''}`);
  }
  return res.json();
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
// Filename Parsing (generic)
// ============================================================

/**
 * 根据模块配置解析截图文件名
 * @param {string} filename - 原始文件名
 * @param {object} sc - screenshots 配置
 * @returns {{id: string, dateTaken: string} | null}
 */
export function parseScreenshotFilename(filename, sc) {
  const pattern = new RegExp(sc.filename_pattern, 'i');
  const match = filename.match(pattern);
  if (!match) return null;

  // date_group_map: [yearIdx, monthIdx, dayIdx, hourIdx, minuteIdx, secondIdx]
  // Default: [1,2,3,4,5,6] — capture groups 1-6 = year,month,day,hour,minute,second
  const map = sc.date_group_map || [1, 2, 3, 4, 5, 6];

  let year = match[map[0]];
  const month = match[map[1]].padStart(2, '0');
  const day = match[map[2]].padStart(2, '0');
  const hour = match[map[3]].padStart(2, '0');
  const minute = match[map[4]].padStart(2, '0');
  const second = match[map[5]].padStart(2, '0');

  // Handle 2-digit year (e.g. WoW: "26" → "2026")
  if (sc.year_is_short) {
    year = year.length === 2 ? '20' + year : year;
  }
  year = year.padStart(4, '0');

  return {
    id: `${sc.id_prefix}-${year}${month}${day}-${hour}${minute}${second}`,
    dateTaken: `${year}-${month}-${day}T${hour}:${minute}:${second}`,
  };
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
// Unified Sync Function
// ============================================================

/**
 * 同步单个模块的截图：扫描 → 压缩 → 上传 → 更新清单
 * @param {string} moduleId - 模块 ID（如 "grounded"）
 * @param {object} sc - screenshots 配置（来自 modules.json）
 * @param {string} localSourceDir - 本地截图目录
 * @param {{log: Function}} options
 * @returns {Promise<{uploaded: number, latestId: string|null, latestFile: string|null}>}
 */
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
  let imagesData, imagesSha;
  try {
    const res = await githubGet(sc.data_file);
    imagesData = JSON.parse(Buffer.from(res.content, 'base64').toString('utf-8'));
    imagesSha = res.sha;
    log(`   远程已有 ${imagesData.total || 0} 张`);
  } catch {
    imagesData = { last_updated: new Date().toISOString().slice(0, 10), total: 0, images: [] };
    imagesSha = undefined;
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

  let uploaded = 0;
  let latestId = null;
  let latestFile = null;
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

      // Upload full
      const fullPath = `${sc.image_path}/full/${info.id}.webp`;
      await githubPut(fullPath, result.fullBuffer.toString('base64'), `Add ${moduleId} screenshot: ${info.id}`);

      // Upload thumb
      const thumbPath = `${sc.image_path}/thumb/${info.id}.webp`;
      await githubPut(thumbPath, result.thumbBuffer.toString('base64'), `Add ${moduleId} screenshot thumb: ${info.id}`);

      // Update manifest
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
      log(`  ✅ 上传成功`);
    } catch (err) {
      log(`  ❌ ${filename}: ${err.message}`);
    }
  }

  // Update manifest
  if (uploaded > 0) {
    imagesData.last_updated = today;
    imagesData.total = imagesData.images.length;
    const jsonStr = JSON.stringify(imagesData, null, 2);
    const jsonB64 = Buffer.from(jsonStr).toString('base64');
    await githubPut(sc.data_file, jsonB64, `Sync ${uploaded} ${moduleId} screenshot(s)`, imagesSha);

    // Also save locally for local preview
    const localManifest = path.join(PROJECT_ROOT, sc.data_file);
    fs.writeFileSync(localManifest, jsonStr, 'utf-8');
    log(`✅ [${moduleId}] ${sc.data_file} 已更新 (${imagesData.total} 张) [本地+远程]`);
  } else {
    // Get the latest existing image as fallback
    const sorted = [...(imagesData.images || [])].sort(
      (a, b) => new Date(b.date_taken) - new Date(a.date_taken)
    );
    if (sorted.length > 0) {
      latestId = sorted[0].id;
      latestFile = sorted[0].filename;
    }
    // Ensure local manifest exists even if no new uploads
    const localManifest = path.join(PROJECT_ROOT, sc.data_file);
    if (!fs.existsSync(localManifest)) {
      const jsonStr = JSON.stringify(imagesData, null, 2);
      fs.writeFileSync(localManifest, jsonStr, 'utf-8');
      log(`   [${moduleId}] 本地 ${sc.data_file} 已创建`);
    }
    log(`   [${moduleId}] 没有新截图`);
  }

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
