/**
 * sync-all.js — 同步所有模块的截图
 *
 * 用法:
 *   node scripts/sync-all.js
 *   node scripts/sync-all.js --module=grounded   # 仅同步指定模块
 */

import { getToken, loadModuleScreenshotConfigs, loadLocalSourceDirs, syncScreenshots } from './sync-lib.js';

// Parse --module=xxx flag
const moduleFilter = process.argv
  .find((a) => a.startsWith('--module='))
  ?.split('=')[1] || null;

console.log('🔄 截图同步工具\n');

const token = getToken();
if (!token) {
  console.error('❌ 请设置 GitHub Token (scripts/.env 中 GITHUB_TOKEN=ghp_xxx)');
  process.exit(1);
}
console.log('✅ Token 已配置\n');

const moduleConfigs = loadModuleScreenshotConfigs();
const localDirs = loadLocalSourceDirs();

console.log(`已配置模块: ${moduleConfigs.map((m) => m.moduleId).join(', ')}`);
console.log(`本地目录: ${Object.keys(localDirs).join(', ') || '(无)'}\n`);

const toSync = moduleFilter
  ? moduleConfigs.filter((m) => m.moduleId === moduleFilter)
  : moduleConfigs;

if (moduleFilter && toSync.length === 0) {
  console.error(`❌ 未找到模块: ${moduleFilter}`);
  console.error(`   可用模块: ${moduleConfigs.map((m) => m.moduleId).join(', ')}`);
  process.exit(1);
}

let totalUploaded = 0;

for (const { moduleId, sc } of toSync) {
  const localDir = localDirs[moduleId];
  if (!localDir) {
    console.log(`⚠️  [${moduleId}] 未配置本地源目录 (scripts/screenshot-config.json)，跳过\n`);
    continue;
  }

  try {
    const result = await syncScreenshots(moduleId, sc, localDir, { log: console.log });
    totalUploaded += result.uploaded;
    console.log('');
  } catch (err) {
    console.error(`❌ [${moduleId}] 同步失败: ${err.message}\n`);
  }
}

console.log(`✅ 完成！共同步 ${totalUploaded} 张截图`);
if (totalUploaded > 0) {
  console.log('🌐 https://jaterlee.github.io/\n');
}
