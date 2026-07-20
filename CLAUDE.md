# CLAUDE.md

## Project Overview

**Grounded 存档分享站** — Static site on GitHub Pages (`jaterlee.github.io`) sharing Grounded game saves, adventure logs, and screenshots. Vanilla HTML + CSS + JS, no framework, no build step. IIFE pattern with `'use strict'`.

| Page | File | Purpose |
|------|------|---------|
| Home | `index.html` | DW-themed two-panel: arc-stack nav (left) + module content (right) |
| Gallery | `gallery.html` | Screenshot grid with lightbox |
| Admin | `admin.html` | Upload saves/changelogs/screenshots via GitHub API |

### Data Files (editable via GitHub API)

| File | Purpose |
|------|---------|
| `data/saves.json` | Save entries (title, filename, stats, thumbnail, tags) |
| `data/changelog.json` | Adventure log (type, date, title, description) |
| `data/images.json` | Grounded screenshots manifest |
| `data/ghost-images.json` | Ghost of Tsushima screenshots manifest |
| `data/wow-images.json` | WoW screenshots manifest |
| `data/modules.json` | Module registry + per-module screenshot config |
| `data/history-notes.json` | History module content (built from .md files) |

### Asset Conventions

- `saves/` — Save zip files
- `images/screenshots/{grounded,ghost,wow}/{full,thumb}/` — WebP screenshots (full ~80KB, thumb ~10KB)
- `assets/css/` — Stylesheets: `style.css` (base + CSS vars), `dw-theme.css` (layout), `module-*.css` (per-module)
- `assets/js/` — Scripts: one per feature, `defer` loaded
- `content/history/` — History module source .md files → `scripts/sync-history.js` → `data/history-notes.json`

## CSS Design System

All styles use CSS custom properties from `:root` in `style.css`:
- Colors: `--green-*`, `--brown-*`, `--amber-*`, `--dw-*` (DW theme tokens)
- Typography: `--font-serif` (Georgia), `--font-sans` (system stack)
- Spacing: `--space-1` (0.25rem) through `--space-20` (5rem)
- Module accent colors: Grounded `#4a7c59` (green), Ghost `#c0392b` (red), History `#dbb42c` (gold)

## Common Commands

```bash
node scripts/sync-all.js                 # Sync screenshots (all modules)
node scripts/sync-all.js --module=wow    # Sync single module
node scripts/publish.js <zip> --title="标题" --days=28 --tier="Tier 2"  # One-click publish
node scripts/sync-history.js             # Rebuild history-notes.json from .md files
npx serve .                              # Local preview
```

## GitHub API Integration (`scripts/sync-lib.js`)

Two API layers:
- **Contents API** (`githubGet`/`githubPut`): Single-file read/write. One commit per call. Used by `admin.js` (browser) and `publish.js`.
- **Git Data API** (`githubBatchCommit`): Blobs → tree → commit → ref update in one batch. Used for screenshot sync — all files in **1 commit per module per run**. Never use `githubPut` for batch uploads.

Auth: token in `scripts/.env` (`GITHUB_TOKEN`), never committed. Admin page uses `localStorage`.

## DW Theme Architecture

Two-panel layout (`.dw-main`): left panel (280px, fixed) + right panel (flex: 1, scrollable).

**Arc Stack Navigation** (`dw-navigation.js` + `dw-theme.css`):
- Cards on a left-bulging arc via `transform: translate(-50%, -50%) translate3d(x, y, 0) rotate(deg) scale(s)`
- Active card bulges left 55px; others retract 18px/step, rotate ±6°/step, get blur(0~2px) + brightness(1~0.9) + opacity fade
- Cyclic wrapping via `shortestDelta()`, perspective 1400px, transitions 0.55s cubic-bezier
- Wheel throttle: 420ms cooldown; touch: swipe >40px; keyboard: ↑↓ or ←→
- Mobile (<640px): cards flatten to horizontal scrollable row with `!important` overrides

**Module System**: Three modules registered in `data/modules.json`. Content in `.module-content` containers, toggled via `.active` class. `dw:modulechange` event triggers lazy-load on first activation. Coverflow, Ghost, WoW, History each have their own JS module file.

**Design evolution**: Went through disc wheel → diamond scatter → vertical stack → arc trajectory. Arc won because blur + brightness creates depth-of-field that pure opacity can't match. Old `#dw-disc-ring` DOM container reused through all iterations.

## Coverflow Reusable Component

`JaterCoverflow.create(config)` factory — shared by Grounded, Ghost, WoW. Config: `container`, `images` (or `dataUrl`), `thumbPath`/`fullPath`, `title`, `moduleClass` for background variant. Each instance gets isolated namespace, DOM, lightbox.

**Virtual Window**: Only 7 cards max in DOM (visible ±3). `syncCards()` does incremental O(1) updates. Dot nav becomes compact `◀ N/M ▶` counter above 20 images. CSS: `.ghost-coverflow`, `.wow-coverflow` bg variants.

## Screenshot Sync Architecture

**Config layer**: `data/modules.json` (repo: paths, filename patterns, date group maps) + `scripts/screenshot-config.json` (local: source dirs, gitignored).

**Flow**: Scan local dir → fetch remote manifest → compress new files to WebP (full + thumb) via `sharp` → batch commit via Git Data API.

**Multiple filename patterns**: `filename_patterns` array support (e.g. WoW has `WoWScrnShot_MMDDYY_...` and `WowClassic_YYYY-MM-DD_...`). `date_group_map` maps regex groups to date components; `year_is_short: true` for 2-digit years.

**Pre-commit hook**: `scripts/pre-commit` → `.git/hooks/pre-commit` runs `sync-all.js` before each commit. Exits 0 on failure (won't block commits).

## History Module

Content-driven module: `content/history/*.md` (YAML frontmatter) → `scripts/sync-history.js` (zero-dep parser) → `data/history-notes.json` → frontend. Two content types: `passage` (gold left border, historical excerpts) and `reflection` (celadon border, personal analysis). Masonry layout via CSS `columns` with `break-inside: avoid`. Module-specific modal (`#history-modal-overlay`), lightweight ~50-line `renderMarkdown()` in client.

## Force Push Prevention

- **Never `git push --force`** without checking remote state first
- Git Data API sync creates remote-only commits → `git push` can be rejected → temptation to force push
- If `git pull` times out (large binary repo), use GitHub API to inspect remote: `GET /repos/:owner/:repo/events`
- Recover orphaned commits via Contents API with full SHA: `GET /repos/:owner/:repo/contents/:path?ref=<sha>`
- After force push recovery, run `sync-all.js` to restore binary files (manifest JSON alone isn't enough)
- `git stash` before any risky remote operation
