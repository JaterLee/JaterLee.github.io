/**
 * sync-marketing.js
 * 将 content/marketing/*.md 编译为 data/marketing-notes.json
 *
 * 用法：node scripts/sync-marketing.js
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const CONTENT_DIR = path.join(PROJECT_ROOT, 'content', 'marketing');
const OUTPUT_PATH = path.join(PROJECT_ROOT, 'data', 'marketing-notes.json');

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
    console.log('⚠️  content/marketing/ 目录不存在，已跳过');
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify({
      last_updated: new Date().toISOString().slice(0, 10),
      total: 0,
      notes: [],
    }, null, 2), 'utf-8');
    console.log('✅ 已写入空 JSON 到 ' + OUTPUT_PATH);
    return;
  }
  const allFiles = fs.readdirSync(CONTENT_DIR);
  const mdFiles = allFiles.filter(f => f.endsWith('.md')).sort();
  if (mdFiles.length === 0) {
    console.log('⚠️  content/marketing/ 中没有 .md 文件');
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify({
      last_updated: new Date().toISOString().slice(0, 10),
      total: 0,
      notes: [],
    }, null, 2), 'utf-8');
    return;
  }
  console.log('\u{1F4C4} 找到 ' + mdFiles.length + ' 个 .md 文件\n');
  const notes = [];
  const errors = [];
  for (var i = 0; i < mdFiles.length; i++) {
    var file = mdFiles[i];
    var filePath = path.join(CONTENT_DIR, file);
    try {
      var raw = fs.readFileSync(filePath, 'utf-8');
      var parsed = parseFrontmatter(raw);
      var attrs = parsed.attributes;
      if (!attrs.title) throw new Error('缺少必填字段: title');
      if (!attrs.date) throw new Error('缺少必填字段: date');
      var noteId = attrs.id || file.replace(/\.md$/, '');
      var date = attrs.date;
      if (!date) { var stat = fs.statSync(filePath); date = stat.mtime.toISOString().slice(0, 10); }
      var tags = attrs.tags;
      if (typeof tags === 'string') tags = tags.split(',').map(s => s.trim());
      if (!Array.isArray(tags)) tags = [];
      var excerpt = generateExcerpt(parsed.body);
      notes.push({
        id: noteId,
        title: attrs.title,
        type: attrs.type || 'note',
        date: date,
        source: attrs.source || null,
        chapter: attrs.chapter || null,
        tags: tags,
        excerpt: excerpt,
        body: parsed.body,
        file: file,
      });
      console.log('  ✅ ' + file + ' → ' + noteId);
    } catch (err) {
      errors.push({ file: file, error: err.message });
      console.log('  ❌ ' + file + ': ' + err.message);
    }
  }
  notes.sort((a, b) => { if (a.date < b.date) return 1; if (a.date > b.date) return -1; return 0; });
  var output = {
    last_updated: new Date().toISOString().slice(0, 10),
    total: notes.length,
    notes: notes,
  };
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), 'utf-8');
  console.log('\n✅ 已写入 ' + OUTPUT_PATH + ' (' + notes.length + ' 条笔记)');
  if (errors.length > 0) console.log('⚠️  ' + errors.length + ' 个文件处理失败');
}

build().catch(err => { console.error('❌ 构建失败:', err.message); process.exit(1); });
