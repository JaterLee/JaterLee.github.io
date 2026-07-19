/**
 * sync-ghost-images.js — 对马岛之魂截图同步
 *
 * 用法:
 *   node scripts/sync-ghost-images.js
 */
import { getToken, syncGhostScreenshots } from './sync-lib.js';

console.log('🗡️  对马岛之魂截图同步工具\n');

const token = getToken();
if (!token) {
  console.error('❌ 请设置 GitHub Token (scripts/.env 中 GITHUB_TOKEN=ghp_xxx)');
  process.exit(1);
}
console.log('✅ Token 已配置\n');

syncGhostScreenshots({ log: console.log })
  .then((result) => {
    console.log(`\n✅ 完成！同步 ${result.uploaded} 张`);
    if (result.uploaded > 0) {
      console.log('🌐 https://jaterlee.github.io/\n');
    }
  })
  .catch((err) => {
    console.error('\n❌ 同步失败:', err.message);
    process.exit(1);
  });
