/**
 * sync-life.js
 * 将 content/life/*.md 编译为 data/life-notes.json
 *
 * 比 sync-history.js 更轻量——没有 excerpt 自动生成，也没有 source/chapter 字段。
 *
 * .md 文件格式：
 *   ---
 *   title: 周末爬山记
 *   date: 2026-07-25
 *   type: journal          // journal = 简记润色, diary = 亲笔日记
 *   tags: [户外, 周末]
 *   ---
 *   正文（Markdown）...
 *
 * 用法：node scripts/sync-life.js
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const CONTENT_DIR = path.join(PROJECT_ROOT, 'content', 'life');
const OUTPUT_PATH = path.join(PROJECT_ROOT, 'data', 'life-notes.json');

/* ==========================================================
   简易 YAML Frontmatter 解析器
   ========================================================== */

function parseFrontmatter(raw) {
  const trimmed = raw.trimStart();

  if (!trimmed.startsWith('---')) {
    throw new Error('缺少 frontmatter 头部 (---)');
  }

  const endIdx = trimmed.indexOf('\n---', 3);
  if (endIdx === -1) {
    throw new Error('frontmatter 未闭合（缺少结束的 ---）');
  }

  const fmBlock = trimmed.slice(4, endIdx);
  const body = trimmed.slice(endIdx + 4).trim();

  const attributes = {};
  const lines = fmBlock.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!line.trim() || line.trim().startsWith('#')) continue;

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).trim();
    const rawValue = line.slice(colonIdx + 1).trim();

    if (!key) continue;

    let value = rawValue;

    if (value === '') {
      const continuation = [];
      while (i + 1 < lines.length && (lines[i + 1].startsWith('  ') || lines[i + 1].startsWith('\t'))) {
        i++;
        continuation.push(lines[i].trim());
      }
      if (continuation.length > 0) {
        value = continuation.join('\n');
      }
    }

    if (value === 'true')  { attributes[key] = true;  continue; }
    if (value === 'false') { attributes[key] = false; continue; }
    if (value === 'null' || value === '~') { attributes[key] = null; continue; }

    if (value.startsWith('[') && value.endsWith(']')) {
      const inner = value.slice(1, -1).trim();
      if (inner === '') {
        attributes[key] = [];
      } else {
        attributes[key] = inner.split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
      }
      continue;
    }

    if (/^-?\d+(\.\d+)?$/.test(value)) {
      attributes[key] = parseFloat(value);
      continue;
    }

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    attributes[key] = value;
  }

  return { attributes, body };
}

/* ==========================================================
   构建主流程
   ========================================================== */

async function build() {
  if (!fs.existsSync(CONTENT_DIR)) {
    fs.mkdirSync(CONTENT_DIR, { recursive: true });
    console.log('📁 已创建 content/life/ 目录');
  }

  const allFiles = fs.readdirSync(CONTENT_DIR);
  const mdFiles = allFiles
    .filter(f => f.endsWith('.md'))
    .sort();

  if (mdFiles.length === 0) {
    console.log('⚠️  content/life/ 中没有 .md 文件');

    // 保留现有 JSON 不变
    if (fs.existsSync(OUTPUT_PATH)) {
      console.log('    data/life-notes.json 保持不变');
    } else {
      fs.writeFileSync(OUTPUT_PATH, JSON.stringify({
        last_updated: new Date().toISOString().slice(0, 10),
        notes: [],
      }, null, 2), 'utf-8');
      console.log('✅ 已写入空 JSON');
    }
    return;
  }

  console.log(`📄 找到 ${mdFiles.length} 个 .md 文件\n`);

  const notes = [];
  const errors = [];

  for (const file of mdFiles) {
    const filePath = path.join(CONTENT_DIR, file);

    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = parseFrontmatter(raw);
      const attrs = parsed.attributes;

      if (!attrs.title) throw new Error('缺少必填字段: title');
      if (!attrs.date)  throw new Error('缺少必填字段: date');

      const noteId = attrs.id || file.replace(/\.md$/, '');

      let tags = attrs.tags;
      if (typeof tags === 'string') {
        tags = tags.split(',').map(s => s.trim());
      }
      if (!Array.isArray(tags)) tags = [];

      const entry = {
        id: noteId,
        title: attrs.title,
        date: attrs.date,
        tags: tags,
        body: parsed.body,
      };

      // 如果有 type 字段则保留
      if (attrs.type) {
        entry.type = attrs.type;
      }

      notes.push(entry);
      console.log(`  ✅ ${file} → ${noteId}${attrs.type ? ' (' + attrs.type + ')' : ''}`);
    } catch (err) {
      errors.push({ file, error: err.message });
      console.log(`  ❌ ${file}: ${err.message}`);
    }
  }

  // 按日期降序
  notes.sort((a, b) => {
    if (a.date < b.date) return 1;
    if (a.date > b.date) return -1;
    return 0;
  });

  const output = {
    last_updated: new Date().toISOString().slice(0, 10),
    notes: notes,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`\n✅ 已写入 ${OUTPUT_PATH} (${notes.length} 条笔记)`);

  if (errors.length > 0) {
    console.log(`⚠️  ${errors.length} 个文件处理失败`);
  }
}

build().catch(err => {
  console.error('❌ 构建失败:', err.message);
  console.error(err.stack);
  process.exit(1);
});
