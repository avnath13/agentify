#!/usr/bin/env node
// Export a set of Architecture Decision Records (ADRs) from a decision log.
//
// This is the tool behind `agentify adr`. A design's decision record already
// captures the key choices with their rejected alternatives; the skill writes
// those as a simple ADR log and this emits standard numbered ADR files plus an
// index, the artifact teams keep in-repo (Nygard/MADR style).
//
// Input log format (markdown):
//   ---
//   title: <optional project name>
//   date: 2026-07-14
//   ---
//   ## Use a single tool-using agent, not multi-agent
//   Status: Accepted
//   Context: The path is open-ended; the number of steps depends on results.
//   Decision: One bounded agent with a tool loop.
//   Consequences: Simpler and cheaper than multi-agent; gives up parallelism we do not need.
//
//   ## Permission-aware retrieval, not one shared index
//   ...
//
// Each `## ` heading starts one ADR. Status/Context/Decision/Consequences
// labels are optional and forgiving; Status defaults to Accepted.
//
// Usage: node adr.mjs <decision-log.md> [output-dir]   (default output: adr/)

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function fail(m) { console.error(m); process.exit(2); }

const [input, outDirArg] = process.argv.slice(2);
if (!input) fail('Usage: adr.mjs <decision-log.md> [output-dir]');
if (!fs.existsSync(input)) fail(`No such file: ${input}`);
const raw = fs.readFileSync(input, 'utf8');
const outDir = path.resolve(outDirArg || path.join(path.dirname(path.resolve(input)), 'adr'));

// front matter
const fm = { title: '', date: '' };
let body = raw;
const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n?/);
if (fmMatch) {
  for (const line of fmMatch[1].split('\n')) {
    const m = line.match(/^([a-zA-Z_]+):\s*(.*)$/);
    if (m) fm[m[1]] = m[2].trim();
  }
  body = raw.slice(fmMatch[0].length);
}

// split into ADR blocks on `## ` headings
const blocks = [];
let cur = null;
for (const line of body.split('\n')) {
  const h = line.match(/^##\s+(.*)$/);
  if (h) { cur = { title: h[1].trim(), lines: [] }; blocks.push(cur); }
  else if (cur) cur.lines.push(line);
}
if (!blocks.length) fail('No "## " decision headings found in the log.');

const FIELDS = ['status', 'context', 'decision', 'consequences'];
function parseFields(lines) {
  const found = {};
  let key = null;
  for (const line of lines) {
    const m = line.match(/^\s*(?:\*\*|###\s*)?(status|context|decision|consequences)\b\s*[:*]*\s*(.*)$/i);
    if (m) { key = m[1].toLowerCase(); found[key] = (m[2] || '').trim(); }
    else if (key) found[key] = (found[key] ? found[key] + '\n' : '') + line;
    else { found._pre = (found._pre ? found._pre + '\n' : '') + line; }
  }
  for (const k of Object.keys(found)) found[k] = found[k].trim();
  return found;
}

function slug(t) {
  return t.replace(/^\s*\d+[.)]\s*/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'decision';
}
const pad = (n) => String(n).padStart(4, '0');
const EMDASH = String.fromCharCode(0x2014);

fs.mkdirSync(outDir, { recursive: true });
const index = [];
blocks.forEach((b, i) => {
  const n = i + 1;
  const f = parseFields(b.lines);
  const status = f.status || 'Accepted';
  const context = f.context || f._pre || '';
  const decision = f.decision || '';
  const consequences = f.consequences || '';
  const dateLine = fm.date ? `\nDate: ${fm.date}\n` : '';
  const adr = `# ${n}. ${b.title}\n${dateLine}
## Status

${status}

## Context

${context || 'Not recorded.'}

## Decision

${decision || 'Not recorded.'}

## Consequences

${consequences || 'Not recorded.'}
`;
  if (adr.includes(EMDASH)) fail(`ADR ${n} contains an em dash; replace it before exporting.`);
  const file = `${pad(n)}-${slug(b.title)}.md`;
  fs.writeFileSync(path.join(outDir, file), adr);
  index.push({ n, title: b.title, file, status });
});

const heading = fm.title ? `# ${fm.title}: architecture decision records` : '# Architecture decision records';
const indexMd = `${heading}\n\n${index.map((a) => `- [${a.n}. ${a.title}](${a.file}) - ${a.status}`).join('\n')}\n`;
if (indexMd.includes(EMDASH)) fail('ADR index contains an em dash.');
const indexPath = path.join(outDir, 'README.md');
fs.writeFileSync(indexPath, indexMd);

console.log(pathToFileURL(indexPath).href);
console.log(`${outDir}`);
console.log(`(${blocks.length} ADR${blocks.length === 1 ? '' : 's'} + index)`);
