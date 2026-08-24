/**
 * sync-pokong.js
 * 将 content/pokong/*.md 编译为 data/pokong-notes.json
 * 「破空：春秋异客传」— 连载小说章节
 *
 * .md 文件格式：
 *   ---
 *   id: chapter-001
 *   title: 第一章 标题
 *   chapter: 第一章
 *   date: 2026-08-24
 *   type: 正文          // 正文 | 番外 | 设定
 *   tags: [穿越, 春秋]
 *   ---
 *   正文（Markdown）...
 *
 * 用法：node scripts/sync-pokong.js
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const CONTENT_DIR = path.join(PROJECT_ROOT, 'content', 'pokong');
const OUTPUT_PATH = path.join(PROJECT_ROOT, 'data', 'pokong-notes.json');

function parseFrontmatter(raw) {
  const trimmed = raw.trimStart();
  if (!trimmed.startsWith('---')) throw new Error('缺少 frontmatter 头部 (---)');
  const endIdx = trimmed.indexOf('\n---', 3);
  if (endIdx === -1) throw new Error('frontmatter 未闭合');
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
      if (continuation.length > 0) value = continuation.join('\n');
    }
    if (value === 'true') { attributes[key] = true; continue; }
    if (value === 'false') { attributes[key] = false; continue; }
    if (value === 'null' || value === '~') { attributes[key] = null; continue; }
    if (value.startsWith('[') && value.endsWith(']')) {
      const inner = value.slice(1, -1).trim();
      attributes[key] = inner === '' ? [] : inner.split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
      continue;
    }
    if (/^-?\d+(\.\d+)?$/.test(value)) { attributes[key] = parseFloat(value); continue; }
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    attributes[key] = value;
  }
  return { attributes, body };
}

function generateExcerpt(body, maxLen) {
  maxLen = maxLen || 150;
  var text = body
    .replace(/^#{1,4}\s+/gm, '')
    .replace(/\*{1,3}(.+?)\*{1,3}/g, '$1')
    .replace(/`{1,3}[^`]*`{1,3}/g, '')
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')
    .replace(/^>\s+/gm, '')
    .replace(/^[-*]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/\n{2,}/g, ' ')
    .replace(/\n/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (text.length > maxLen) text = text.slice(0, maxLen).trim() + '...';
  return text;
}

async function build() {
  if (!fs.existsSync(CONTENT_DIR)) {
    fs.mkdirSync(CONTENT_DIR, { recursive: true });
    console.log('📁 已创建 content/pokong/ 目录');
  }

  const allFiles = fs.readdirSync(CONTENT_DIR);
  const mdFiles = allFiles.filter(f => f.endsWith('.md')).sort();

  if (mdFiles.length === 0) {
    console.log('⚠️  content/pokong/ 中没有 .md 文件');

    if (fs.existsSync(OUTPUT_PATH)) {
      console.log('    data/pokong-notes.json 保持不变');
    } else {
      fs.writeFileSync(OUTPUT_PATH, JSON.stringify({
        last_updated: new Date().toISOString().slice(0, 10),
        total: 0,
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
      if (!attrs.date) throw new Error('缺少必填字段: date');

      const noteId = attrs.id || file.replace(/\.md$/, '');

      let tags = attrs.tags;
      if (typeof tags === 'string') tags = tags.split(',').map(s => s.trim());
      if (!Array.isArray(tags)) tags = [];

      const excerpt = generateExcerpt(parsed.body);

      notes.push({
        id: noteId,
        title: attrs.title,
        type: attrs.type || '正文',
        chapter: attrs.chapter || null,
        date: attrs.date,
        tags: tags,
        excerpt: excerpt,
        body: parsed.body,
        file: file,
      });
      console.log(`  ✅ ${file} → ${noteId}${attrs.chapter ? ' (' + attrs.chapter + ')' : ''}`);
    } catch (err) {
      errors.push({ file, error: err.message });
      console.log(`  ❌ ${file}: ${err.message}`);
    }
  }

  // 按日期降序（最新章节在前）
  notes.sort((a, b) => {
    if (a.date < b.date) return 1;
    if (a.date > b.date) return -1;
    return 0;
  });

  const output = {
    last_updated: new Date().toISOString().slice(0, 10),
    total: notes.length,
    notes: notes,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`\n✅ 已写入 ${OUTPUT_PATH} (${notes.length} 章)`);

  if (errors.length > 0) {
    console.log(`⚠️  ${errors.length} 个文件处理失败`);
  }
}

build().catch(err => {
  console.error('❌ 构建失败:', err.message);
  console.error(err.stack);
  process.exit(1);
});
