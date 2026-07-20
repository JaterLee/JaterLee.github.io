---
name: publish-save
description: 发布存档到网站——同步截图、上传存档、用最新截图做封面。当用户说"发布存档"、"更新存档"、"上传存档"、"publish save"时使用。
---

# Publish Save Skill

发布存档到网站：同步截图 → 上传存档 → 用最新截图做封面。

## 触发条件
用户说"发布存档"、"更新存档"、"上传存档"、"publish save"等。

## 执行步骤

### 1. 收集信息
向用户确认以下内容（已有默认值则跳过）：
- 存档 zip 文件路径（如 `saves/save-logout.zip`）
- 存档标题
- 游戏天数
- 装备等级（默认 Tier 2）
- 玩家列表（默认 Jater, Alex, Sam, Mike）

### 2. 一键执行
```bash
node scripts/publish.js "<zip路径>" --title="标题" --days=天数 --tier="Tier 2" --players="Jater,Alex,Sam,Mike"
```

### 3. 脚本自动完成
1. 扫描 `C:\Users\admin\Pictures\Grounded` 同步新截图
2. 上传 zip 到 `saves/` 目录
3. 更新 `data/saves.json`，最新截图设为封面
4. 输出发布结果摘要

### 4. 推送到 GitHub
```bash
cd D:/Developer/JaterLee.github.io && git pull origin master && git push origin master
```

## 注意事项
- Token 已配置在 `scripts/.env`
- 截图目录：`C:\Users\admin\Pictures\Grounded`
- 网站部署后等 1-2 分钟刷新查看
