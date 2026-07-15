# 🌿 Grounded Saves — 后院存档分享站

朋友之间的 Grounded 存档分享、冒险记录和截图展示网站。

**[jaterlee.github.io](https://jaterlee.github.io)**

---

## 功能

- 💾 **存档下载** — 上传和分享 Grounded 游戏存档
- 📝 **冒险日志** — 时间线记录每次游戏进展
- 📸 **截图画廊** — 游戏内截图展示，支持 Lightbox 浏览
- 🎠 **Coverflow 轮播** — 首页 3D 卡片轮播展示最新截图
- 🔧 **管理后台** — 浏览器端上传存档、日志和截图

## 技术栈

纯静态网站，托管在 GitHub Pages，零构建步骤。

- HTML5 + CSS3 + Vanilla JavaScript
- GitHub Contents API（管理后台上传）
- 客户端 Canvas API + Node.js sharp（图片压缩为 WebP）
- CSS 自定义属性设计系统

## 项目结构

```
├── index.html              # 首页（Coverflow + 存档 + 日志）
├── gallery.html            # 截图画廊
├── admin.html              # 管理后台
├── data/
│   ├── saves.json          # 存档清单
│   ├── changelog.json      # 日志清单
│   └── images.json         # 截图清单
├── saves/                  # 存档 zip 文件
├── images/screenshots/     # 截图（full/ 和 thumb/）
├── assets/
│   ├── css/                # 样式文件
│   └── js/                 # 脚本文件
└── scripts/
    ├── sync-lib.js         # 共享库（API + 压缩）
    ├── sync-images.js      # 截图同步
    └── publish.js          # 一键发布（截图 + 存档）
```

## 本地使用

```bash
# 安装脚本依赖（首次）
npm install --prefix scripts

# 同步游戏截图
node scripts/sync-images.js

# 一键发布存档（截图 + 存档 + 封面）
node scripts/publish.js <存档.zip> --title="橡树堡垒 — 第87天" --days=87
```

截图自动从 `C:\Users\<用户名>\Pictures\Grounded` 读取并压缩上传。

## 图片压缩

原始 PNG 截图（~5MB）→ WebP 完整图（~80KB）+ 缩略图（~10KB），压缩比约 50x。

| 方式 | 工具 |
|------|------|
| 浏览器端 | Canvas API（`assets/js/image-util.js`） |
| 本地脚本 | sharp（`scripts/sync-lib.js`） |

## 许可

MIT

---

*Grounded 是 Obsidian Entertainment 的商标。本站点与其无关。*
