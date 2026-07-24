# 架构设计：生活小记

## 技术方案

参考五代十国史模块（`module-history`）的模式，简化适配为日记/随笔风格。不做 masonry 瀑布流，改用**时间线列表**，每篇文章一行，按日期倒序。

### 核心差异 vs 历史模块

| 特性 | 历史模块 | 生活小记 |
|------|---------|---------|
| 布局 | masonry 瀑布流 | 时间线列表 |
| 筛选 | passage/reflection | 无筛选 |
| 弹窗 | 详情弹窗 | 同左（复用） |
| 配色 | 鎏金/古籍 | 暖色调/生活感 |
| Markdown | 内联渲染 | 同左 |

## 文件变更清单

### 新增文件
1. `assets/css/module-life.css` — 生活小记样式
2. `assets/js/module-life.js` — 生活小记 JS 逻辑
3. `content/life/` — 文章存放目录
4. `data/life-notes.json` — 文章索引数据
5. `docs/requirements/life-notes.md` — ✅ 已完成
6. `docs/design/life-notes.md` — 本文档

### 修改文件
1. `data/modules.json` — 新增 `life` 模块配置
2. `index.html` — 新增 `#module-life` 面板 + 引用 CSS/JS
3. `assets/js/module-life.js` — 注册到 `JaterMod.register('life', ...)`

### 不变的文件
- `dw-navigation.js` — 自动从 `modules.json` 渲染卡片，无需改动
- `module-registry.js` — 自动处理注册，无需改动

## 关键接口

### 模块注册
```javascript
// module-life.js
window.JaterMod.register('life', { init: init });
```

### 数据源: `data/life-notes.json`
```json
{
  "last_updated": "2026-07-24",
  "notes": [
    {
      "id": "life-001",
      "title": "...",
      "date": "2026-07-24",
      "body": "# markdown content..."
    }
  ]
}
```

### modules.json 新增配置
```json
{
  "id": "life",
  "name": "看生活小记",
  "subtitle": "Life Notes",
  "icon": "🌱",
  "primary_color": "#b58d6b",
  "theme": "life"
}
```

## 影响范围

- 仅在 `index.html` 中增加一个 module-content 面板
- 导航卡片由 `dw-navigation.js` 自动渲染，不需要手动改导航
- 不影响其他模块（grounded/ghost/history/wow）
- 不影响画廊页（gallery.html）和管理后台（admin.html）
