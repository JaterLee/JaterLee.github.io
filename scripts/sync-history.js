/**
 * sync-history.js
 * 将 content/history/*.md 编译为 data/history-notes.json
 *
 * 流程：
 *   1. 读取 content/history/ 目录下所有 .md 文件
 *   2. 解析 frontmatter (YAML 头)
 *   3. 提取 excerpt (正文前 150 字符，去除 markdown 标记)
 *   4. 构建 notes 数组，按 date 降序排列
 *   5. 写入 data/history-notes.json
 *
 * 用法：node scripts/sync-history.js
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const CONTENT_DIR = path.join(PROJECT_ROOT, 'content', 'history');
const OUTPUT_PATH = path.join(PROJECT_ROOT, 'data', 'history-notes.json');

/* ==========================================================
   简易 YAML Frontmatter 解析器
   ========================================================== */

/**
 * 解析 markdown 文件的 frontmatter 头
 * 格式：
 *   ---
 *   key: value
 *   tags: [a, b, c]
 *   ---
 *   正文...
 *
 * @param {string} raw 文件原始内容
 * @returns {{ attributes: object, body: string }}
 */
function parseFrontmatter(raw) {
  const trimmed = raw.trimStart();

  // 必须以 --- 开头
  if (!trimmed.startsWith('---')) {
    throw new Error('缺少 frontmatter 头部 (---)');
  }

  // 查找第二个 ---
  const endIdx = trimmed.indexOf('\n---', 3);
  if (endIdx === -1) {
    throw new Error('frontmatter 未闭合（缺少结束的 ---）');
  }

  const fmBlock = trimmed.slice(4, endIdx); // 跳过开头的 "---\n"
  const body = trimmed.slice(endIdx + 4).trim(); // 跳过结束的 "\n---"

  const attributes = {};
  const lines = fmBlock.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 跳过空行和注释
    if (!line.trim() || line.trim().startsWith('#')) continue;

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).trim();
    const rawValue = line.slice(colonIdx + 1).trim();

    if (!key) continue;

    let value = rawValue;

    // 如果值为空，可能是多行值（如 tags 数组）
    if (value === '') {
      // 读取缩进的后续行
      const continuation = [];
      while (i + 1 < lines.length && (lines[i + 1].startsWith('  ') || lines[i + 1].startsWith('\t'))) {
        i++;
        continuation.push(lines[i].trim());
      }
      if (continuation.length > 0) {
        value = continuation.join('\n');
      }
    }

    // 布尔值
    if (value === 'true') {
      attributes[key] = true;
      continue;
    }
    if (value === 'false') {
      attributes[key] = false;
      continue;
    }
    if (value === 'null' || value === '~') {
      attributes[key] = null;
      continue;
    }

    // 数组：以 [ 开头
    if (value.startsWith('[') && value.endsWith(']')) {
      const inner = value.slice(1, -1).trim();
      if (inner === '') {
        attributes[key] = [];
      } else {
        attributes[key] = inner.split(',').map(function (s) { return s.trim().replace(/^["']|["']$/g, ''); });
      }
      continue;
    }

    // 数字
    if (/^-?\d+(\.\d+)?$/.test(value)) {
      attributes[key] = parseFloat(value);
      continue;
    }

    // 字符串（去除引号）
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    attributes[key] = value;
  }

  return { attributes, body };
}

/* ==========================================================
   Excerpt 生成
   ========================================================== */

/**
 * 从 markdown 正文生成预览摘要
 * @param {string} body markdown 正文
 * @param {number} maxLen 最大长度
 * @returns {string} 纯文本摘要
 */
function generateExcerpt(body, maxLen) {
  maxLen = maxLen || 150;

  // 移除 markdown 标记
  var text = body
    .replace(/^#{1,4}\s+/gm, '')        // 标题
    .replace(/\*{1,3}(.+?)\*{1,3}/g, '$1') // 加粗/斜体
    .replace(/`{1,3}[^`]*`{1,3}/g, '')   // 行内代码
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')  // 链接
    .replace(/^>\s+/gm, '')              // 引用
    .replace(/^[-*]\s+/gm, '')           // 列表
    .replace(/^\d+\.\s+/gm, '')          // 有序列表
    .replace(/\n{2,}/g, ' ')             // 多换行 → 空格
    .replace(/\n/g, ' ')                 // 单换行 → 空格
    .replace(/\s{2,}/g, ' ')             // 多空格 → 单空格
    .trim();

  if (text.length > maxLen) {
    // 在 maxLen 处截断，尽量在完整字符边界
    text = text.slice(0, maxLen).trim() + '...';
  }

  return text;
}

/* ==========================================================
   构建主流程
   ========================================================== */

async function build() {
  // 确保 content/history/ 存在
  if (!fs.existsSync(CONTENT_DIR)) {
    console.log('⚠️  content/history/ 目录不存在，已跳过');
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify({
      last_updated: new Date().toISOString().slice(0, 10),
      total: 0,
      notes: [],
    }, null, 2), 'utf-8');
    console.log('✅ 已写入空 JSON 到 ' + OUTPUT_PATH);
    return;
  }

  // 扫描 .md 文件
  const allFiles = fs.readdirSync(CONTENT_DIR);
  const mdFiles = allFiles
    .filter(function (f) { return f.endsWith('.md'); })
    .sort();

  if (mdFiles.length === 0) {
    console.log('⚠️  content/history/ 中没有 .md 文件');
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

      // 验证必填字段
      if (!attrs.title) {
        throw new Error('缺少必填字段: title');
      }
      if (!attrs.type) {
        throw new Error('缺少必填字段: type');
      }
      if (!['passage', 'reflection'].includes(attrs.type)) {
        throw new Error('type 必须是 "passage" 或 "reflection"，当前值：' + attrs.type);
      }
      if (!attrs.date) {
        throw new Error('缺少必填字段: date');
      }
      if (attrs.type === 'passage' && !attrs.source) {
        throw new Error('摘录类型需要 source 字段');
      }

      // 如果没有指定 id，用文件名（去 .md 后缀）
      var noteId = attrs.id || file.replace(/\.md$/, '');

      // 如果没有指定 date，用文件修改时间
      var date = attrs.date;
      if (!date) {
        var stat = fs.statSync(filePath);
        date = stat.mtime.toISOString().slice(0, 10);
      }

      // 确保 tags 是数组
      var tags = attrs.tags;
      if (typeof tags === 'string') {
        tags = tags.split(',').map(function (s) { return s.trim(); });
      }
      if (!Array.isArray(tags)) {
        tags = [];
      }

      var excerpt = generateExcerpt(parsed.body);

      notes.push({
        id: noteId,
        title: attrs.title,
        type: attrs.type,
        date: date,
        source: attrs.source || null,
        chapter: attrs.chapter || null,
        tags: tags,
        excerpt: excerpt,
        body: parsed.body,
        file: file,
      });

      console.log('  ✅ ' + file + ' → ' + noteId + ' (' + attrs.type + ')');
    } catch (err) {
      errors.push({ file: file, error: err.message });
      console.log('  ❌ ' + file + ': ' + err.message);
    }
  }

  // 按日期降序排列
  notes.sort(function (a, b) {
    if (a.date < b.date) return 1;
    if (a.date > b.date) return -1;
    return 0;
  });

  // 输出 JSON
  var output = {
    last_updated: new Date().toISOString().slice(0, 10),
    total: notes.length,
    notes: notes,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), 'utf-8');
  console.log('\n✅ 已写入 ' + OUTPUT_PATH + ' (' + notes.length + ' 条笔记)');

  if (errors.length > 0) {
    console.log('⚠️  ' + errors.length + ' 个文件处理失败，请检查上面的错误信息');
  }
}

build().catch(function (err) {
  console.error('❌ 构建失败:', err.message);
  console.error(err.stack);
  process.exit(1);
});
