/**
 * sync-images.js — Grounded 截图批量同步脚本
 *
 * 用法:
 *   node scripts/sync-images.js [--token=ghp_xxx]
 *
 * 流程:
 *   1. 扫描 C:/Users/admin/Pictures/Grounded 目录中的 PNG
 *   2. 通过 GitHub API 读取 data/images.json 现有清单
 *   3. 对比找出新图片
 *   4. 用 sharp 压缩为 WebP（完整图 + 缩略图）
 *   5. 通过 GitHub API 上传到 images/screenshots/
 *   6. 更新 data/images.json
 *
 * 依赖: npm install --prefix scripts
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ============================================================
// Config
// ============================================================

const REPO_OWNER = 'JaterLee';
const REPO_NAME = 'JaterLee.github.io';
const API_BASE = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents`;

// Grounded 截图默认路径
const SCREENSHOTS_DIR = 'C:\\Users\\admin\\Pictures\\Grounded';

// 压缩参数
const FULL_MAX = 1920;
const FULL_QUALITY = 85;   // sharp 的 quality 是 1-100
const THUMB_WIDTH = 400;
const THUMB_QUALITY = 82;

// ============================================================
// Helpers
// ============================================================

function getToken() {
  // 1. 命令行参数 --token=xxx
  const tokenArg = process.argv.find((a) => a.startsWith('--token='));
  if (tokenArg) return tokenArg.split('=')[1];

  // 2. 环境变量 GITHUB_TOKEN
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;

  // 3. .env 文件（简单解析）
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    const match = content.match(/^GITHUB_TOKEN=(.+)$/m);
    if (match) return match[1].trim();
  }

  return null;
}

function log(msg, type = 'info') {
  const prefixes = { info: '  ℹ', success: '  ✅', error: '  ❌', warn: '  ⚠️' };
  console.log(`${prefixes[type] || '  ·'} ${msg}`);
}

/**
 * 从文件名解析时间戳
 * Grounded_2026.07.15-23.49.20.png → { id, dateTaken }
 */
function parseFilename(filename) {
  const match = filename.match(/Grounded_(\d{4})\.(\d{2})\.(\d{2})-(\d{2})\.(\d{2})\.(\d{2})/);
  if (match) {
    const id = `grounded-${match[1]}${match[2]}${match[3]}-${match[4]}${match[5]}${match[6]}`;
    const dateTaken = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}`;
    return { id, dateTaken };
  }
  return null;
}

// ============================================================
// GitHub API
// ============================================================

async function githubGet(apiPath) {
  const url = `${API_BASE}/${apiPath}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `token ${getToken()}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'grounded-sync-script',
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`GET ${apiPath}: ${res.status} ${err.message || ''}`);
  }
  return res.json();
}

async function githubPut(apiPath, contentBase64, message, sha) {
  const url = `${API_BASE}/${apiPath}`;
  const body = { message, content: contentBase64 };
  if (sha) body.sha = sha;

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `token ${getToken()}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'grounded-sync-script',
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
// Image Processing
// ============================================================

async function loadSharp() {
  try {
    const sharp = (await import('sharp')).default;
    return sharp;
  } catch {
    console.error('❌ 未安装 sharp 依赖。请运行: npm install --prefix scripts');
    process.exit(1);
  }
}

async function compressImage(sharp, inputPath) {
  // 完整图：最长边缩放到 FULL_MAX
  const fullPipeline = sharp(inputPath).resize({
    width: FULL_MAX,
    height: FULL_MAX,
    fit: 'inside',
    withoutEnlargement: true,
  });
  const fullBuffer = await fullPipeline.webp({ quality: FULL_QUALITY }).toBuffer();
  const fullMeta = await sharp(fullBuffer).metadata();

  // 缩略图：先缩放到 THUMB_WIDTH 宽，再居中裁剪到 16:10
  const thumbHeight = Math.round(THUMB_WIDTH / (16 / 10));
  const resizedThumb = await sharp(inputPath)
    .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
    .toBuffer({ resolveWithObject: true });

  const rMeta = await sharp(resizedThumb.data).metadata();
  const resizedH = rMeta.height;
  const resizedW = rMeta.width;

  // 确保裁剪区域合法
  const cropW = Math.min(resizedW, THUMB_WIDTH);
  const cropH = Math.min(resizedH, Math.round(cropW / (16 / 10)));
  const topOffset = Math.max(0, Math.round((resizedH - cropH) / 2));
  const leftOffset = Math.max(0, Math.round((resizedW - cropW) / 2));

  const thumbBuffer = await sharp(resizedThumb.data)
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
// Main Sync
// ============================================================

async function main() {
  console.log('🌿 Grounded 截图同步工具\n');

  // 检查 Token
  const token = getToken();
  if (!token) {
    console.error('❌ 请设置 GitHub Token:');
    console.error('   node scripts/sync-images.js --token=ghp_xxx');
    console.error('   或在 scripts/.env 中设置 GITHUB_TOKEN=ghp_xxx');
    process.exit(1);
  }
  console.log('✅ Token 已配置\n');

  // 检查截图目录
  if (!fs.existsSync(SCREENSHOTS_DIR)) {
    console.error(`❌ 截图目录不存在: ${SCREENSHOTS_DIR}`);
    process.exit(1);
  }

  // 加载 sharp
  const sharp = await loadSharp();

  // 1. 扫描本地 PNG
  const localFiles = fs.readdirSync(SCREENSHOTS_DIR)
    .filter((f) => /\.(png|jpe?g)$/i.test(f))
    .sort();
  console.log(`📂 本地截图: ${localFiles.length} 张`);
  localFiles.forEach((f) => console.log(`   ${f}`));
  console.log('');

  if (!localFiles.length) {
    console.log('没有新截图需要同步。');
    return;
  }

  // 2. 读取远程 images.json
  console.log('🌐 读取远程 images.json...');
  let imagesData, imagesSha;
  try {
    const res = await githubGet('data/images.json');
    const jsonStr = Buffer.from(res.content, 'base64').toString('utf-8');
    imagesData = JSON.parse(jsonStr);
    imagesSha = res.sha;
    console.log(`   当前 ${imagesData.total || 0} 张\n`);
  } catch (err) {
    console.log(`   文件不存在，将创建新文件 (${err.message})\n`);
    imagesData = { last_updated: new Date().toISOString().slice(0, 10), total: 0, images: [] };
    imagesSha = undefined;
  }

  const existingIds = new Set((imagesData.images || []).map((img) => img.id));

  // 3. 找出新文件
  const newFiles = [];
  for (const filename of localFiles) {
    const parsed = parseFilename(filename);
    if (parsed && existingIds.has(parsed.id)) {
      console.log(`⏭️  跳过: ${filename} (已存在)`);
    } else {
      newFiles.push({ filename, parsed });
    }
  }

  if (!newFiles.length) {
    console.log('\n✅ 没有新截图需要同步。');
    return;
  }

  console.log(`\n📸 发现 ${newFiles.length} 张新截图\n`);

  // 4. 逐张处理
  let uploaded = 0;
  for (const { filename, parsed } of newFiles) {
    const inputPath = path.join(SCREENSHOTS_DIR, filename);
    const stat = fs.statSync(inputPath);
    const sizeMB = (stat.size / (1024 * 1024)).toFixed(1);

    try {
      log(`处理: ${filename} (${sizeMB} MB)`);

      // 压缩
      const result = await compressImage(sharp, inputPath);
      const fullKB = (result.fullBuffer.length / 1024).toFixed(1);
      const thumbKB = (result.thumbBuffer.length / 1024).toFixed(1);
      log(`压缩完成: 完整图 ${fullKB} KB, 缩略图 ${thumbKB} KB`);

      // 生成 ID
      const info = parsed || {
        id: `img-${Date.now()}`,
        dateTaken: new Date().toISOString().replace(/\.\d{3}Z$/, ''),
      };

      // 上传完整图
      const fullB64 = result.fullBuffer.toString('base64');
      const fullPath = `images/screenshots/full/${info.id}.webp`;
      await githubPut(fullPath, fullB64, `Add screenshot: ${info.id}`);
      log(`上传: ${fullPath}`, 'success');

      // 上传缩略图
      const thumbB64 = result.thumbBuffer.toString('base64');
      const thumbPath = `images/screenshots/thumb/${info.id}.webp`;
      await githubPut(thumbPath, thumbB64, `Add screenshot thumb: ${info.id}`);
      log(`上传: ${thumbPath}`, 'success');

      // 更新清单
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
    } catch (err) {
      log(`${filename}: ${err.message}`, 'error');
    }
  }

  // 5. 更新 images.json
  if (uploaded > 0) {
    imagesData.last_updated = new Date().toISOString().slice(0, 10);
    imagesData.total = imagesData.images.length;
    const jsonStr = JSON.stringify(imagesData, null, 2);
    const jsonB64 = Buffer.from(jsonStr).toString('base64');

    log('更新 images.json...');
    await githubPut('data/images.json', jsonB64, `Sync ${uploaded} screenshot(s)`, imagesSha);
    log(`images.json 已更新 (${imagesData.total} 张)`, 'success');
  }

  console.log(`\n✅ 完成！成功同步 ${uploaded} 张截图`);
  if (uploaded > 0) {
    console.log(`🌐 查看: https://jaterlee.github.io/gallery.html\n`);
  }
}

main().catch((err) => {
  console.error('\n❌ 同步失败:', err.message);
  process.exit(1);
});
