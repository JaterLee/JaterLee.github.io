/**
 * sync-images.js — Grounded 截图同步（便捷入口）
 *
 * 用法:
 *   node scripts/sync-images.js
 *
 * 也可用通用入口:
 *   node scripts/sync-all.js --module=grounded
 */

import { getToken, loadModuleScreenshotConfigs, loadLocalSourceDirs, syncScreenshots } from './sync-lib.js';

const MODULE_ID = 'grounded';

console.log('🌿 Grounded 截图同步工具\n');

const token = getToken();
if (!token) {
  console.error('❌ 请设置 GitHub Token (scripts/.env 中 GITHUB_TOKEN=ghp_xxx)');
  process.exit(1);
}
console.log('✅ Token 已配置\n');

// Load config for this module
const moduleConfigs = loadModuleScreenshotConfigs();
const modCfg = moduleConfigs.find((m) => m.moduleId === MODULE_ID);
if (!modCfg) {
  console.error(`❌ 模块 "${MODULE_ID}" 未在 modules.json 中配置 screenshots`);
  process.exit(1);
}

const localDirs = loadLocalSourceDirs();
const localDir = localDirs[MODULE_ID];
if (!localDir) {
  console.error(`❌ 请在 scripts/screenshot-config.json 中配置 "${MODULE_ID}" 的 local_source_dir`);
  process.exit(1);
}

syncScreenshots(MODULE_ID, modCfg.sc, localDir, { log: console.log })
  .then((result) => {
    console.log(`\n✅ 完成！同步 ${result.uploaded} 张`);
    if (result.uploaded > 0) {
      console.log('🌐 https://jaterlee.github.io/gallery.html\n');
    }
  })
  .catch((err) => {
    console.error('\n❌ 同步失败:', err.message);
    process.exit(1);
  });
