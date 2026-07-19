/**
 * publish.js — 一键发布：同步截图 + 上传存档 + 更新封面
 *
 * 用法:
 *   node scripts/publish.js <save-zip-path>
 *   node scripts/publish.js <save-zip-path> --title="第87天存档" --days=87
 *
 * 流程:
 *   1. 同步 C:/Users/admin/Pictures/Grounded 中的新截图
 *   2. 上传存档 zip 文件
 *   3. 更新 saves.json，用最新截图作为封面
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getToken, githubGet, githubPut, syncScreenshots,
  loadModuleScreenshotConfigs, loadLocalSourceDirs,
} from './sync-lib.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================================
// Parse Args
// ============================================================

function parseArgs() {
  const args = { zipPath: null, title: null, days: null, version: null, tier: null, players: null, bases: null };

  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--title=')) args.title = arg.split('=')[1];
    else if (arg.startsWith('--days=')) args.days = parseInt(arg.split('=')[1]);
    else if (arg.startsWith('--version=')) args.version = arg.split('=')[1];
    else if (arg.startsWith('--tier=')) args.tier = arg.split('=')[1];
    else if (arg.startsWith('--players=')) args.players = arg.split('=')[1].split(',').map((s) => s.trim());
    else if (arg.startsWith('--bases=')) args.bases = arg.split('=')[1].split(',').map((s) => s.trim());
    else if (!arg.startsWith('--')) args.zipPath = arg;
  }

  return args;
}

// ============================================================
// Helpers
// ============================================================

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^\w一-鿿]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// ============================================================
// Main
// ============================================================

async function main() {
  console.log('🌿 Grounded 一键发布\n');
  console.log('='.repeat(50));

  const token = getToken();
  if (!token) {
    console.error('❌ 请设置 GitHub Token (scripts/.env 中 GITHUB_TOKEN=ghp_xxx)');
    process.exit(1);
  }

  const args = parseArgs();

  // ========== Step 1: Sync Screenshots ==========
  console.log('\n📸 [1/3] 同步截图...\n');

  const MODULE_ID = 'grounded';
  const moduleConfigs = loadModuleScreenshotConfigs();
  const modCfg = moduleConfigs.find((m) => m.moduleId === MODULE_ID);
  if (!modCfg) {
    console.error(`❌ 模块 "${MODULE_ID}" 未在 modules.json 中配置 screenshots`);
    process.exit(1);
  }
  const localDirs = loadLocalSourceDirs();
  const localDir = localDirs[MODULE_ID];

  const syncResult = await syncScreenshots(MODULE_ID, modCfg.sc, localDir, { log: console.log });
  console.log('');

  let coverThumbPath = null;
  if (syncResult.latestId) {
    coverThumbPath = `${modCfg.sc.image_path}/thumb/${syncResult.latestId}.webp`;
    console.log(`🖼️  封面截图: ${syncResult.latestFile || syncResult.latestId}`);
  } else {
    console.log('⚠️  没有找到截图，将不设置封面');
  }

  // ========== Step 2: Upload Save ==========
  if (!args.zipPath) {
    console.log('\n💾 [2/3] 未提供存档路径，跳过存档上传');
    console.log('   用法: node scripts/publish.js <save-zip-path> --title="标题"');
    console.log('\n' + '='.repeat(50));
    console.log('✅ 步骤 1/3 完成：截图已同步');
    return;
  }

  if (!fs.existsSync(args.zipPath)) {
    console.error(`\n❌ 存档文件不存在: ${args.zipPath}`);
    process.exit(1);
  }

  console.log('\n💾 [2/3] 上传存档...\n');

  const zipBuf = fs.readFileSync(args.zipPath);
  const zipBase64 = zipBuf.toString('base64');
  const zipName = path.basename(args.zipPath);
  const stat = fs.statSync(args.zipPath);

  // Generate safe filename
  const dateStr = todayStr();
  const title = args.title || path.basename(args.zipPath, '.zip');
  const slug = slugify(title);
  const zipFilename = `save-${dateStr}-${slug}.zip`;
  const saveId = `save-${dateStr}-${slug}`;

  console.log(`   标题: ${title}`);
  console.log(`   文件: ${zipName} → ${zipFilename}`);
  console.log(`   大小: ${formatSize(stat.size)}`);

  // Upload zip
  console.log(`   上传 zip...`);
  await githubPut(`saves/${zipFilename}`, zipBase64, `Add save: ${title}`);

  // ========== Step 3: Update saves.json ==========
  console.log('\n📋 [3/3] 更新 saves.json...\n');

  let savesData, savesSha;
  try {
    const res = await githubGet('data/saves.json');
    savesData = JSON.parse(Buffer.from(res.content, 'base64').toString('utf-8'));
    savesSha = res.sha;
  } catch (err) {
    console.error(`   ❌ 读取 saves.json 失败: ${err.message}`);
    process.exit(1);
  }

  const newSave = {
    id: saveId,
    title: title,
    description: `${title}。游戏版本 1.4.7。`,
    filename: zipFilename,
    file_size_bytes: stat.size,
    date_added: dateStr,
    game_version: args.version || '1.4.7',
    thumbnail: coverThumbPath || null,
    stats: {
      days_survived: args.days || 1,
      players: args.players || ['Jater'],
      tier_reached: args.tier || 'Tier 2',
      bases: args.bases || [],
      biomes_explored: [],
      bosses_defeated: [],
    },
    highlights: [],
    tags: [],
  };

  // Add to front (newest first)
  savesData.saves.unshift(newSave);
  savesData.last_updated = dateStr;
  savesData.total_saves = savesData.saves.length;

  const savesJson = JSON.stringify(savesData, null, 2);
  const savesBase64 = Buffer.from(savesJson).toString('base64');

  await githubPut('data/saves.json', savesBase64, `Add save: ${title}`, savesSha);

  console.log('='.repeat(50));
  console.log('\n✅ 发布完成！');
  console.log(`   📸 同步截图: ${syncResult.uploaded} 张`);
  if (coverThumbPath) console.log(`   🖼️  封面: ${coverThumbPath}`);
  console.log(`   💾 存档: ${title} (${saveId})`);
  console.log(`   🌐 https://jaterlee.github.io/\n`);
}

main().catch((err) => {
  console.error('\n❌ 发布失败:', err.message);
  process.exit(1);
});
