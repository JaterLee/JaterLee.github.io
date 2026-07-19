# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Grounded 存档分享站** — A static website hosted on GitHub Pages (`jaterlee.github.io`) for sharing Grounded game save files, adventure logs, and screenshots with friends.

- **Domain**: `jaterlee.github.io` (CNAME configured)
- **Repo**: `github.com/JaterLee/JaterLee.github.io`
- **Branch**: `master` (deploys via GitHub Pages)

## Architecture

Static HTML + vanilla JS + CSS. All data is stored as JSON files in `data/`. No framework, no build step. JavaScript uses the IIFE pattern (`(function () { 'use strict'; ... })()`).

### Page Structure

| Page | File | Purpose |
|------|------|---------|
| Home | `index.html` | Hero + Coverflow carousel + Save cards + Changelog timeline |
| Gallery | `gallery.html` | Screenshot grid with lightbox |
| Admin | `admin.html` | Upload saves, changelogs, and screenshots via GitHub API |

### Data Files (editable via GitHub API from admin page)

- `data/saves.json` — Save file entries (title, filename, stats, thumbnail, tags)
- `data/changelog.json` — Adventure log entries (type, date, title, description)
- `data/images.json` — Grounded screenshot manifest (id, date_taken, dimensions, file sizes)
- `data/ghost-images.json` — Ghost of Tsushima screenshot manifest
- `data/wow-images.json` — World of Warcraft screenshot manifest
- `data/modules.json` — Module registry + per-module screenshots config

### Asset Conventions

- `saves/` — Save zip files
- `images/screenshots/full/` — Grounded full-size WebP (1920px, ~80KB)
- `images/screenshots/thumb/` — Grounded thumbnails (400px, ~10KB)
- `images/screenshots/ghost/full/`, `images/screenshots/ghost/thumb/` — Ghost screenshots
- `images/screenshots/wow/full/`, `images/screenshots/wow/thumb/` — WoW screenshots
- `assets/css/` — Stylesheets (one per page/feature)
- `assets/js/` — Scripts (one per page/feature)

### CSS Design System

All styles use CSS custom properties defined in `:root` in `style.css`:
- Colors: `--green-*`, `--brown-*`, `--amber-*`
- Typography: `--font-serif` (Georgia), `--font-sans` (system stack)
- Spacing scale: `--space-1` (0.25rem) through `--space-20` (5rem)
- Shadows, radius, transitions all tokenized
- Dark header with `backdrop-filter: blur()`, fixed positioning

### JavaScript Patterns

- IIFE with `'use strict'`
- `$` / `$$` shortcuts for `querySelector` / `querySelectorAll`
- `STATE` object for all mutable state
- `dom` object collecting all DOM refs
- `hidden` class toggling for empty/error/loading states
- `defer` script loading

## Common Commands

### Sync screenshots from local game folders (all modules)
```bash
node scripts/sync-all.js                # 同步所有模块
node scripts/sync-all.js --module=wow   # 仅同步指定模块
```
Scans each module's configured local folder for new PNGs/JPGs, compresses to WebP, batch-commits via Git Data API.

### Sync screenshots (single module — convenience wrappers)
```bash
node scripts/sync-images.js        # Grounded
node scripts/sync-ghost-images.js  # Ghost of Tsushima
```

### One-click publish (screenshots + save)
```bash
node scripts/publish.js <save-zip-path> --title="标题" --days=28 --tier="Tier 2"
```
Syncs screenshots, uploads the save zip, updates `data/saves.json` with latest screenshot as cover.

### Install sync script dependencies (first time)
```bash
npm install --prefix scripts
```

### Local preview
Open any HTML file directly in browser, or use any static server:
```bash
npx serve .
```

## GitHub API Integration

Two API layers in `scripts/sync-lib.js`:

### Contents API (single-file)
- `githubGet(path)` / `githubPut(path, base64content, message, sha)` — read/write individual files via Contents API
- Each `githubPut` creates one commit. Used by `admin.js` (browser) and `publish.js` for single operations
- **Do NOT use for batch screenshot uploads** — would create one commit per file, bloating repo history

### Git Data API (batch commit)
- `githubBatchCommit(files, message)` — creates blobs → tree → commit → ref update in one go
- All screenshots + manifest combined into **1 commit per module per sync run**
- Flow: `GET /git/refs/heads/master` → `GET /git/commits/{sha}` → `POST /git/blobs` (per file) → `POST /git/trees` → `POST /git/commits` → `PATCH /git/refs/heads/master`
- This is the correct approach for multi-file uploads — avoids the N+1 commits problem

### Auth
- Token stored in `scripts/.env` (`GITHUB_TOKEN=ghp_xxx`), never committed
- Admin page stores token in `localStorage` (`gh_pat_grounded_saves`)
- Shared in `scripts/sync-lib.js` for Node.js, inline in `admin.js` for browser

## Key Design Decisions

- **WebP only**: Original PNG screenshots (~5MB) are compressed client-side to WebP (~80KB). Originals never committed.
- **Client-side compression**: `assets/js/image-util.js` uses Canvas API in browser; `scripts/sync-lib.js` uses `sharp` in Node.js.
- **Screenshot IDs**: Parsed from Grounded filename pattern `Grounded_YYYY.MM.DD-HH.MM.SS.png` → `grounded-YYYYMMDD-HHMMSS`
- **Coverflow carousel**: 3D CSS perspective transforms on `index.html`, positioned between hero and saves sections. Center card opens full-screen lightbox.
- **No frameworks**: Vanilla everything for zero build overhead on GitHub Pages.

### DW Theme Architecture (2026-07-19)

The homepage uses a Dynasty Warriors (真三国无双) aesthetic: a dual-panel layout where the left panel holds an **arc-trajectory card stack** for module selection, and the right panel shows module content.

**Layout**: Two-panel flex — `.dw-main` fills the viewport below the header. `.dw-left-panel` (fixed width `--dw-left-width`, ~280px) + `.dw-right-panel` (flex: 1, scrollable).

**Arc Stack Navigation** (`assets/js/dw-navigation.js` + `assets/css/dw-theme.css`):
- Cards are absolutely positioned at `top: 50%; left: 50%` and offset via `transform: translate(-50%, -50%) translate3d(x, y, 0) rotate(deg) scale(s)`
- Cards form a **left-bulging arc**: the active card bulges furthest left (`BULGE_X=55px`), cards further away retract back toward center (`RETRACT_STEP=18px` per step) and rotate (±6° per step, fanning out above/below)
- `shortestDelta(i, cur, N)` enables **cyclic wrapping** — supports any number of modules, cards wrap around in the shortest direction
- **Depth cues**: non-active cards get `filter: blur(0~2px) brightness(1~0.9)` + opacity fade + scale reduction — creates natural depth-of-field beyond what pure opacity can achieve
- Stage has `perspective: 1400px` for 3D depth on card rotation
- Transitions: `cubic-bezier(0.22, 0.85, 0.32, 1)` over 0.55s — smooth ease-out, no bounce
- **Wheel throttle**: 420ms cooldown lock prevents rapid-fire switching during trackpad scrolling
- **Touch**: swipe Y delta > 40px triggers navigation
- **Keyboard**: ↑↓ primary, ←→ also supported
- Cards have module-specific active fills: Grounded green `#2d5a3d`, Ghost red `#5c1a1a`, History gold `#3d3018`
- Aged paper texture background (pure CSS multi-layer `repeating-linear-gradient` + `radial-gradient`)
- Active card: solid fill + white text + glow shadow; side cards: semi-transparent bg + dimmed text
- On mobile (<640px), stack flattens to horizontal scrollable row with `!important` overrides for JS-inline styles

**Design iteration history (disc → diamond → stack → arc)**:
1. **Disc wheel (360°)** — cards on a rotating ring. Felt too mechanical, hard to see all options at once.
2. **Diamond scatter** — square cards rotated 45° into diamonds, spread horizontally. Required counter-rotation for text, visual noise from 45° angles.
3. **Vertical stack** — cards stacked along Y-axis with translateY + scale. Clean but flat — lacked spatial depth.
4. **Arc trajectory (current)** — adds X-axis bulge + rotation + blur filters. Feels like physical cards fanned on a table.

**Key lessons from this evolution**:
1. **A working demo beats a text description**: the user provided a complete HTML/CSS/JS demo which served as an unambiguous spec. Porting its logic directly was faster and more accurate than interpreting text descriptions — the arc math, throttle timing, and filter values were all explicit.
2. **Filter for depth > opacity alone**: `blur()` + `brightness()` on distant cards creates a depth-of-field effect that pure opacity can't match. The eye reads it as "out of focus" rather than just "faded."
3. **Parameter scaling for constrained spaces**: the full-viewport demo used `BULGE_X=150px`; our 280px panel needed ~55px. Scale parameters proportionally, but verify card edges don't clip with `overflow: hidden`.
4. **Inline styles need `!important` mobile overrides**: since JS sets `transform`, `opacity`, `filter`, `pointerEvents` as inline styles, mobile responsive CSS must use `!important` to flatten the layout.
5. **Wheel throttle is essential**: without the 420ms lock, a single trackpad flick could jump 3-4 cards. The cooldown makes navigation feel deliberate.
6. **Don't delete the old DOM shell**: `#dw-disc-ring` container was reused through all 4 iterations — HTML stayed the same, only CSS class names and JS logic changed.

**Module System**:
- Three modules: Grounded (禁闭求生), Ghost of Tsushima (对马岛之魂), Five Dynasties History (五代十国史)
- Module registry in `data/modules.json`
- Module content in `<div class="module-content">` containers, toggled via `.active` class
- Custom event `dw:modulechange` dispatched on switch — allows each module to lazy-load its data on first activation
- Each module has its own CSS file: `module-grounded.css`, `module-ghost.css`, `module-history.css`
- Module-specific accent colors: Grounded (green `#4a7c59`), Ghost (red `#c0392b`), History (gold `#dbb42c`)
- Ghost and History modules are framework-only — placeholder content with sample cards, ready for future data

**CSS Architecture**:
- `style.css`: Base reset, typography, header, footer, modal + all CSS custom properties (including DW `--dw-*` tokens)
- `dw-theme.css`: DW layout system (two-panel, arc stack cards, transitions, responsive)
- `module-*.css`: Per-module dark-theme overrides and module-specific component styles
- Module CSS uses scoped selectors (e.g. `.module-header.ghost-header`, `.ghost-content`)

**Integration with existing code**:
- `app.js` (Grounded data) was minimally modified: removed hero IntersectionObserver, updated scroll-to-top to watch right panel
- `coverflow.js` unchanged — `#coverflow-section` still exists inside the Grounded module container
- `gallery.html`, `admin.html` completely unaffected
- All existing Grounded DOM IDs preserved (`#saves-grid`, `#changelog-timeline`, etc.)
- `#dw-disc-ring` DOM container reused through all 4 navigation redesigns — HTML shell untouched

### Screenshot Sync Architecture (2026-07-19)

Cross-module screenshot synchronization with centralized config and batch commits.

**Configuration Layer**:

| File | Scope | Contents |
|------|-------|----------|
| `data/modules.json` | Repo (committed) | Per-module `screenshots` config: `data_file`, `image_path`, `filename_pattern`/`filename_patterns`, `id_prefix`, `date_group_map`, `year_is_short` |
| `scripts/screenshot-config.json` | Local (gitignored) | Per-module `local_source_dir` — absolute paths to game screenshot folders |

**Filename Pattern System**:
- `filename_pattern` (string) — single regex for the module's screenshot naming convention
- `filename_patterns` (array) — multiple patterns when a game has different naming formats (e.g. WoW: `WoWScrnShot_MMDDYY_HHMMSS.jpg` and `WowClassic_YYYY-MM-DD_HH-MM-SS.png`)
- `date_group_map` — maps regex capture groups to date components `[yearIdx, monthIdx, dayIdx, hourIdx, minuteIdx, secondIdx]`. Default `[1,2,3,4,5,6]`. WoW uses `[3,1,2,4,5,6]` because `WoWScrnShot_MMDDYY_...` puts month first.
- `year_is_short: true` — for 2-digit years (WoW old format), auto-prepends "20"
- Each sub-pattern in `filename_patterns` inherits `id_prefix` from parent config if not specified

**Sync Flow** (`scripts/sync-lib.js` → `syncScreenshots`):
1. Scan local source directory for image files
2. Fetch remote manifest (`data/{module}-images.json`) to get existing IDs
3. For each new file: parse filename with configured pattern(s), compress to WebP (full + thumb)
4. Stage all new files + updated manifest
5. Single batch commit via Git Data API — all files in one commit

**Pre-commit Hook** (`scripts/pre-commit` → `.git/hooks/pre-commit`):
- Runs `sync-all.js` before each commit to auto-sync new screenshots
- Hook exits 0 even on failure (won't block commits)
- Uses `git rev-parse --show-toplevel` to resolve repo root correctly
- First sync is the heaviest (all historical screenshots); subsequent commits only upload new ones

**Frontend Integration**:
- `module-ghost.js` and `module-wow.js` read `data_file` and `image_path` from `JaterMod.getModuleConfig(id).screenshots` instead of hardcoding
- `module-registry.js` exposes `setModuleConfigs(mods)` (called by `dw-navigation.js` after loading `modules.json`) and `getModuleConfig(id)`
- Each module falls back to hardcoded defaults if config isn't loaded yet

**Key lessons from this implementation**:
1. **GitHub Contents API creates one commit per file**: `githubPut` on 131 screenshots × 2 (full + thumb) = 262 commits. Always use Git Data API batch commit for multi-file operations.
2. **Batch commit flow is fragile**: get HEAD ref → get tree → create blobs → create tree → create commit → update ref. If the process dies mid-way, created blobs are orphaned. The manifest reset + sync pattern handles recovery.
3. **Binary files in git make fetch slow regardless of commit count**: even with batch commits, git fetch downloads all new blobs. 15MB of screenshots over slow network = timeout. For daily use, incremental syncs (2-3 new screenshots) are fast enough.
4. **Separate repo config from local config**: `modules.json` holds repo-level settings (paths, patterns); `screenshot-config.json` holds machine-specific source directories. The latter is gitignored — different machines have different game install paths.
5. **Multiple filename patterns are common**: WoW has two formats (`WoWScrnShot_` legacy and `WowClassic_` modern). Support `filename_patterns` array from the start — don't force one pattern per module.
6. **Ghost's actual filenames didn't match the assumed pattern**: assumed `Ghost of Tsushima_YYYY.MM.DD-HH.MM.SS.png`, actual files from the screenshot tool were `Screenshot_YYYY-MM-DD_HH-MM-SS.png`. Always verify filename patterns against real files before writing config.
