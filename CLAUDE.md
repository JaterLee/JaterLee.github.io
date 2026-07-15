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
