/**
 * sync-screenshots.js — 可复用的截图同步核心
 *
 * 用作模块导入或被 publish.js 调用
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================================
// Config
// ============================================================

const REPO_OWNER = 'JaterLee';
const REPO_NAME = 'JaterLee.github.io';
const API_BASE = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents`;
const SCREENSHOTS_DIR = 'C:\\Users\\admin\\Pictures\\Grounded';
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
// Filename Parsing
// ============================================================

export function parseScreenshotFilename(filename) {
  const match = filename.match(/Grounded_(\d{4})\.(\d{2})\.(\d{2})-(\d{2})\.(\d{2})\.(\d{2})/);
  if (match) {
    return {
      id: `grounded-${match[1]}${match[2]}${match[3]}-${match[4]}${match[5]}${match[6]}`,
      dateTaken: `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}`,
    };
  }
  return null;
}

// ============================================================
// Main Sync Function
// ============================================================

/**
 * 同步截图：扫描 → 压缩 → 上传 → 更新清单
 * @returns {Promise<{uploaded: number, latestId: string|null, latestFile: string|null}>}
 */
export async function syncScreenshots({ log = console.log } = {}) {
  if (!fs.existsSync(SCREENSHOTS_DIR)) {
    log('⚠️  截图目录不存在，跳过');
    return { uploaded: 0, latestId: null, latestFile: null };
  }

  const sharp = (await import('sharp')).default;
  const localFiles = fs.readdirSync(SCREENSHOTS_DIR)
    .filter((f) => /\.(png|jpe?g)$/i.test(f))
    .sort();

  log(`📂 本地截图: ${localFiles.length} 张`);

  if (!localFiles.length) {
    return { uploaded: 0, latestId: null, latestFile: null };
  }

  // Read remote images.json
  let imagesData, imagesSha;
  try {
    const res = await githubGet('data/images.json');
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
    const parsed = parseScreenshotFilename(f);
    if (parsed && existingIds.has(parsed.id)) continue;
    newFiles.push({ filename: f, parsed });
  }

  log(`📸 新截图: ${newFiles.length} 张`);

  let uploaded = 0;
  let latestId = null;
  let latestFile = null;
  const today = new Date().toISOString().slice(0, 10);

  for (const { filename, parsed } of newFiles) {
    const inputPath = path.join(SCREENSHOTS_DIR, filename);
    const stat = fs.statSync(inputPath);
    const sizeMB = (stat.size / (1024 * 1024)).toFixed(1);

    try {
      log(`  处理: ${filename} (${sizeMB} MB)`);
      const result = await compressImage(sharp, inputPath);
      const fullKB = (result.fullBuffer.length / 1024).toFixed(1);
      const thumbKB = (result.thumbBuffer.length / 1024).toFixed(1);
      log(`  压缩: 完整图 ${fullKB} KB, 缩略图 ${thumbKB} KB`);

      const info = parsed || { id: `img-${Date.now()}`, dateTaken: new Date().toISOString().replace(/\.\d{3}Z$/, '') };

      // Upload full
      const fullPath = `images/screenshots/full/${info.id}.webp`;
      await githubPut(fullPath, result.fullBuffer.toString('base64'), `Add screenshot: ${info.id}`);

      // Upload thumb
      const thumbPath = `images/screenshots/thumb/${info.id}.webp`;
      await githubPut(thumbPath, result.thumbBuffer.toString('base64'), `Add screenshot thumb: ${info.id}`);

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

  // Update images.json
  if (uploaded > 0) {
    imagesData.last_updated = today;
    imagesData.total = imagesData.images.length;
    const jsonStr = JSON.stringify(imagesData, null, 2);
    const jsonB64 = Buffer.from(jsonStr).toString('base64');
    await githubPut('data/images.json', jsonB64, `Sync ${uploaded} screenshot(s)`, imagesSha);
    log(`✅ images.json 已更新 (${imagesData.total} 张)`);
  } else {
    // Get the latest existing image as fallback
    const sorted = [...(imagesData.images || [])].sort(
      (a, b) => new Date(b.date_taken) - new Date(a.date_taken)
    );
    if (sorted.length > 0) {
      latestId = sorted[0].id;
      latestFile = sorted[0].filename;
    }
    log('   没有新截图');
  }

  return { uploaded, latestId, latestFile };
}

// ============================================================
// Ghost of Tsushima Screenshot Sync
// ============================================================

const GHOST_SCREENSHOTS_DIR = 'D:\\Developer\\ScreenshotTool\\Screenshots';

/**
 * 同步对马岛截图：扫描 → 压缩 → 上传 → 更新清单
 * @returns {Promise<{uploaded: number, latestId: string|null, latestFile: string|null}>}
 */
export async function syncGhostScreenshots({ log = console.log } = {}) {
  if (!fs.existsSync(GHOST_SCREENSHOTS_DIR)) {
    log('⚠️  对马岛截图目录不存在，跳过');
    return { uploaded: 0, latestId: null, latestFile: null };
  }

  const sharp = (await import('sharp')).default;
  const localFiles = fs.readdirSync(GHOST_SCREENSHOTS_DIR)
    .filter((f) => /\.(png|jpe?g)$/i.test(f))
    .sort();

  log(`📂 对马岛本地截图: ${localFiles.length} 张`);

  if (!localFiles.length) {
    return { uploaded: 0, latestId: null, latestFile: null };
  }

  // Read remote ghost-images.json
  let imagesData, imagesSha;
  try {
    const res = await githubGet('data/ghost-images.json');
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
    const parsed = parseGhostScreenshotFilename(f);
    if (parsed && existingIds.has(parsed.id)) continue;
    newFiles.push({ filename: f, parsed });
  }

  log(`📸 新截图: ${newFiles.length} 张`);

  let uploaded = 0;
  let latestId = null;
  let latestFile = null;
  const today = new Date().toISOString().slice(0, 10);

  for (const { filename, parsed } of newFiles) {
    const inputPath = path.join(GHOST_SCREENSHOTS_DIR, filename);
    const stat = fs.statSync(inputPath);
    const sizeMB = (stat.size / (1024 * 1024)).toFixed(1);

    try {
      log(`  处理: ${filename} (${sizeMB} MB)`);
      const result = await compressImage(sharp, inputPath);
      const fullKB = (result.fullBuffer.length / 1024).toFixed(1);
      const thumbKB = (result.thumbBuffer.length / 1024).toFixed(1);
      log(`  压缩: 完整图 ${fullKB} KB, 缩略图 ${thumbKB} KB`);

      const info = parsed || { id: `ghost-${Date.now()}`, dateTaken: new Date().toISOString().replace(/\.\d{3}Z$/, '') };

      // Upload full
      const fullPath = `images/screenshots/ghost/full/${info.id}.webp`;
      await githubPut(fullPath, result.fullBuffer.toString('base64'), `Add Ghost screenshot: ${info.id}`);

      // Upload thumb
      const thumbPath = `images/screenshots/ghost/thumb/${info.id}.webp`;
      await githubPut(thumbPath, result.thumbBuffer.toString('base64'), `Add Ghost screenshot thumb: ${info.id}`);

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

  // Update ghost-images.json
  if (uploaded > 0) {
    imagesData.last_updated = today;
    imagesData.total = imagesData.images.length;
    const jsonStr = JSON.stringify(imagesData, null, 2);
    const jsonB64 = Buffer.from(jsonStr).toString('base64');
    await githubPut('data/ghost-images.json', jsonB64, `Sync ${uploaded} Ghost screenshot(s)`, imagesSha);
    // Also save locally for local preview
    const localManifest = path.join(PROJECT_ROOT, 'data', 'ghost-images.json');
    fs.writeFileSync(localManifest, jsonStr, 'utf-8');
    log(`✅ ghost-images.json 已更新 (${imagesData.total} 张) [本地+远程]`);
  } else {
    // Get the latest existing image as fallback
    const sorted = [...(imagesData.images || [])].sort(
      (a, b) => new Date(b.date_taken) - new Date(a.date_taken)
    );
    if (sorted.length > 0) {
      latestId = sorted[0].id;
      latestFile = sorted[0].filename;
    }
    // Ensure local file exists even if no new uploads
    const localManifest = path.join(PROJECT_ROOT, 'data', 'ghost-images.json');
    if (!fs.existsSync(localManifest)) {
      const jsonStr = JSON.stringify(imagesData, null, 2);
      fs.writeFileSync(localManifest, jsonStr, 'utf-8');
      log('   本地 ghost-images.json 已创建');
    }
    log('   没有新截图');
  }

  return { uploaded, latestId, latestFile };
}
