---
name: sync-screenshots
description: 同步截图到网站（不更新存档）。当用户说"同步截图"、"上传截图"、"sync screenshots"时使用。
---

# Sync Screenshots Skill

仅同步截图到网站，不更新存档。

## 触发条件
用户说"同步截图"、"上传截图"、"sync screenshots"等。

## 执行步骤

```bash
node scripts/sync-images.js
```

## 后续
同步完成后会自动更新 `data/images.json`，刷新画廊页面即可看到新截图。
