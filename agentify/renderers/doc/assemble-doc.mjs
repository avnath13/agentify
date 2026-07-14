#!/usr/bin/env node
// Assemble a self-contained design document HTML from a markdown design file.
//
// This is the tool behind `agentify assemble`. The skill writes the design as
// markdown (natural for a model), renders diagrams to HTML with the diagram
// engine, then calls this to produce the final self-contained design.html using
// templates/design-doc.html. It keeps the headline deliverable a reliable tool
// call rather than hand-edited HTML.
//
// Input markdown format:
//   ---
//   title: ...
//   subtitle: ...
//   mode: production | interview
//   date: 2026-07-14
//   ---
//   ## 1. Section Title
//   Markdown body (paragraphs, - lists, 1. lists, | tables |, **bold**,
//   `code`, [links](url)). Lines starting with < are passed through as raw
//   HTML (use for callouts and <details> interview blocks).
//   ![Figure caption](rendered-diagram.html)   embeds that diagram's SVG.
//
// Usage: node assemble-doc.mjs <design.md> [output.html]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(__dirname, '..', '..');

function fail(m) { console.error(m); process.exit(2); }

const [input, output] = process.argv.slice(2);
if (!input) fail('Usage: assemble-doc.mjs <design.md> [output.html]');
if (!fs.existsSync(input)) fail(`No such file: ${input}`);
const srcDir = path.dirname(path.resolve(input));
const raw = fs.readFileSync(input, 'utf8');

// ---- front matter ----
const fm = { title: 'Design', subtitle: '', mode: 'production', date: '' };
let body = raw;
const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n?/);
if (fmMatch) {
  for (const line of fmMatch[1].split('\n')) {
    const m = line.match(/^([a-zA-Z_]+):\s*(.*)$/);
    if (m) fm[m[1]] = m[2].trim();
  }
  body = raw.slice(fmMatch[0].length);
}

// ---- inline markdown ----
function inline(text) {
  return text
    .replace(/!?\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/\b_([^_]+)_\b/g, '<em>$1</em>');
}

function slug(title) {
  return title.replace(/^\s*\d+[.)]\s*/, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'section';
}

// ---- diagram embed: read a rendered diagram HTML (or .svg) and lift its SVG ----
let figureCount = 0;
function diagramFigure(file, caption) {
  const p = path.resolve(srcDir, file);
  if (!fs.existsSync(p)) fail(`Diagram not found: ${file} (resolved ${p})`);
  const content = fs.readFileSync(p, 'utf8');
  const svg = (content.match(/<svg[\s\S]*?<\/svg>/) || [])[0];
  if (!svg) fail(`No <svg> found in ${file}`);
  const cap = caption ? `<figcaption>${inline(caption)}</figcaption>` : '';
  figureCount += 1;
  return `<figure class="diagram-slot">${svg}${cap}</figure>`;
}

// Net open-tag delta for a line (opens minus closes); self-closing and void
// tags count as zero, so raw-HTML blocks can span blank lines until balanced.
const VOID = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'source', 'wbr', 'col']);
function tagDelta(line) {
  let d = 0;
  for (const m of line.matchAll(/<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g)) {
    const [, close, name, , selfClose] = m;
    if (close) d -= 1;
    else if (selfClose || VOID.has(name.toLowerCase())) continue;
    else d += 1;
  }
  return d;
}

// ---- block-level markdown for a section body ----
function renderBlocks(lines) {
  const out = [];
  let i = 0;
  const isTableSep = (s) => /^\s*\|?\s*:?-{2,}.*\|/.test(s) || /^\s*\|(\s*:?-+:?\s*\|)+\s*$/.test(s);
  while (i < lines.length) {
    let line = lines[i];
    if (line.trim() === '') { i += 1; continue; }

    // Raw HTML passthrough: consume lines (including blank ones) until the
    // opened tags balance, so multi-paragraph callouts and <details> blocks work.
    if (line.trimStart().startsWith('<')) {
      const buf = [];
      let depth = 0;
      do {
        depth += tagDelta(lines[i]);
        buf.push(lines[i]);
        i += 1;
      } while (i < lines.length && depth > 0);
      out.push(buf.join('\n'));
      continue;
    }

    // Diagram embed: ![caption](file)
    const dg = line.match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/);
    if (dg) { out.push(diagramFigure(dg[2].trim(), dg[1].trim())); i += 1; continue; }

    // h3
    if (/^###\s+/.test(line)) { out.push(`<h3>${inline(line.replace(/^###\s+/, ''))}</h3>`); i += 1; continue; }

    // table: header line then separator line
    if (line.includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const cells = (s) => s.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const head = cells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') { rows.push(cells(lines[i])); i += 1; }
      const th = head.map((c) => `<th>${inline(c)}</th>`).join('');
      const trs = rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('\n');
      out.push(`<table>\n<thead><tr>${th}</tr></thead>\n<tbody>\n${trs}\n</tbody>\n</table>`);
      continue;
    }

    // lists
    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) { items.push(inline(lines[i].replace(/^\s*[-*]\s+/, ''))); i += 1; }
      out.push(`<ul>\n${items.map((t) => `<li>${t}</li>`).join('\n')}\n</ul>`);
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) { items.push(inline(lines[i].replace(/^\s*\d+[.)]\s+/, ''))); i += 1; }
      out.push(`<ol>\n${items.map((t) => `<li>${t}</li>`).join('\n')}\n</ol>`);
      continue;
    }

    // paragraph: consecutive non-blank, non-special lines
    const para = [];
    while (i < lines.length && lines[i].trim() !== '' && !lines[i].trimStart().startsWith('<')
      && !/^!\[/.test(lines[i]) && !/^###\s+/.test(lines[i]) && !/^\s*[-*]\s+/.test(lines[i])
      && !/^\s*\d+[.)]\s+/.test(lines[i]) && !(lines[i].includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1]))) {
      para.push(lines[i]); i += 1;
    }
    if (para.length) out.push(`<p>${inline(para.join(' '))}</p>`);
  }
  return out.join('\n');
}

// ---- split body into sections on '## ' headings ----
const sections = [];
let cur = null;
for (const line of body.split('\n')) {
  const h2 = line.match(/^##\s+(.*)$/);
  if (h2) { cur = { title: h2[1].trim(), lines: [] }; sections.push(cur); }
  else if (cur) cur.lines.push(line);
}
if (!sections.length) fail('No "## " section headings found in the design markdown.');

const main = sections.map((s) =>
  `<section class="doc-section" id="${slug(s.title)}">\n<h2>${inline(s.title)}</h2>\n${renderBlocks(s.lines)}\n</section>`
).join('\n\n');

// ---- fill the template ----
let template = fs.readFileSync(path.join(skillRoot, 'templates', 'design-doc.html'), 'utf8');
template = template.replace(/<!--\s*\n  Agentify design document shell.*?-->\n/s, '');
// replaceAll: [DOC TITLE] appears in both the <title> and the <h1>, so a
// single-match replace would leave the visible heading as the placeholder.
template = template.replaceAll('[DOC TITLE]', fm.title)
  .replaceAll('[DOC SUBTITLE]', fm.subtitle)
  .replaceAll('[DOC MODE]', `${fm.mode} mode`)
  .replaceAll('[DOC DATE]', fm.date);
const ms = template.indexOf('<main id="doc-body">');
const me = template.indexOf('</main>') + '</main>'.length;
const final = template.slice(0, ms) + '<main id="doc-body">\n' + main + '\n    </main>' + template.slice(me);

// ---- house-rule guard: no em dashes in the deliverable ----
// The em dash is written by code point so this source file stays lint-clean.
if (final.includes(String.fromCharCode(0x2014))) fail('Assembled document contains an em dash; replace it before assembling.');

const outPath = output || path.join(srcDir, `${slug(fm.title)}.design.html`);
fs.writeFileSync(outPath, final);
console.log(`${outPath} (${sections.length} sections, ${figureCount} figure${figureCount === 1 ? '' : 's'} embedded)`);
