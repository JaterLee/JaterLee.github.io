---
name: end-game
description: 结束游戏后的全自动发布流程——同步截图、自动检测存档、打包发布、推送。当用户说"结束游戏"、"游戏打完了"、发布存档、"end game"时使用。
---

# End Game Skill

结束游戏后的全自动发布流程：同步截图 → 自动检测存档 → 打包发布 → 推送。

## 触发条件
用户说"结束游戏"、"游戏打完了"、"发布"、"end game"、"publish"等。

## 执行步骤

### 1. 同步截图
```bash
node scripts/sync-all.js --module=grounded
```

### 2. 自动检测最新存档
扫描 Grounded 存档目录，找到今天最新的存档文件夹：

```bash
ls -lt "C:/Users/admin/Saved Games/Grounded/" --time-style=long-iso 2>/dev/null | head -20
```

存档命名规则：
- `(ID-xxx)(AUTOSAVE-N)` — 自动存档（N=0 是最新的）
- `(ID-xxx)(LOGOUT-SAVE)` — 退出存档
- `(ID-xxx)(GameTime-Xd, Xm, Xs)(Area-区域名)` — 手动存档（含游戏时间和区域）

**自动选择逻辑**：
1. 优先选今天修改过的 AUTOSAVE 文件夹（按修改时间最新）
2. 如果 AUTOSAVE 都没有，检查 LOGOUT-SAVE
3. 从文件夹名提取信息：`GameTime-88d` → days=88，`Area-草地` → area

### 3. 确认信息
找到存档后，告诉用户检测结果，只确认两个关键信息：
- **标题**（必填，如"第88天·树篱基地"）— 自动从 area 和 days 生成建议
- **天数**（必填，如 88）— 自动从 GameTime 提取

不需要问的信息（有默认值）：
- Tier：默认 Tier 2
- 玩家：默认 Jater, Alex, Sam, Mike

### 4. 打包存档
用 PowerShell 压缩（bash 没有 zip 命令）：

```powershell
Compress-Archive -Path '<存档文件夹路径>\*' -DestinationPath '<repo>/saves/save-day<N>-<slug>.zip' -Force
```

### 5. 一键发布
```bash
node scripts/publish.js "<repo>/saves/save-day<N>-<slug>.zip" --title="标题" --days=天数 --tier="Tier 2" --players="Jater,Alex,Sam,Mike"
```

### 6. 推送到 GitHub
发布脚本通过 API 直接推送内容到 GitHub，本地只需拉取同步：
```bash
cd D:/Developer/JaterLee.github.io && git pull origin master
```
如果 git pull 超时（二进制文件多），不影响发布 — 内容已在 GitHub 上。

### 7. 清理
发布成功后删除本地临时 zip 文件（存档内容已在 GitHub 上，不必留在仓库里）。

### 8. 输出结果
告诉用户发布了什么、网站链接，等 1-2 分钟刷新即可看到。

## 关键路径
- 存档目录：`C:\Users\admin\Saved Games\Grounded`
- 截图目录：`C:\Users\admin\Pictures\Grounded`
- Token：`scripts/.env`（已配置）
- 网站：https://jaterlee.github.io/
