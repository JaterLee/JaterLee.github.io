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
- `data/images.json` — Screenshot manifest (id, date_taken, dimensions, file sizes)

### Asset Conventions

- `saves/` — Save zip files
- `images/screenshots/full/` — Full-size WebP screenshots (1920px, ~80KB)
- `images/screenshots/thumb/` — Thumbnail WebP (400px, ~10KB)
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

### Sync screenshots from local game folder
```bash
node scripts/sync-images.js
```
Scans `C:\Users\admin\Pictures\Grounded` for new PNGs, compresses to WebP, uploads via GitHub API, updates `data/images.json`.

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

The admin page and sync scripts use the GitHub Contents API to commit files directly:
- Token stored in `scripts/.env` (`GITHUB_TOKEN=ghp_xxx`), never committed
- Admin page stores token in `localStorage` (`gh_pat_grounded_saves`)
- API helpers: `githubGet(path)` and `githubPut(path, base64content, message, sha)`
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
