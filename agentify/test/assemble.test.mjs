import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(__dirname, '..');
const assembler = path.join(skillRoot, 'renderers', 'doc', 'assemble-doc.mjs');

function run(mdPath, outPath) {
  return spawnSync(process.execPath, [assembler, mdPath, outPath], { encoding: 'utf8' });
}

test('assemble: markdown constructs become the styled design document', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agentify-assemble-'));
  // A minimal standalone SVG so the diagram embed is hermetic.
  fs.writeFileSync(path.join(tmp, 'diag.svg'), '<svg viewBox="0 0 10 10"><rect class="c-agent" width="10" height="10"/></svg>');
  const md = `---
title: Test Design
subtitle: exercising the assembler
mode: production
date: 2026-07-14
---

## 1. Summary

A **paragraph** with \`code\`, a [link](https://example.com), and _emphasis_.

<div class="callout">raw html passthrough</div>

## 2. Details

| Component | Tier |
|---|---|
| reader | 0 |
| writer | 2 |

- one
- two

1. step one
2. step two

### Subsection

Body text.

![Figure 1. A diagram.](diag.svg)
`;
  const mdPath = path.join(tmp, 'design.md');
  const outPath = path.join(tmp, 'out.html');
  fs.writeFileSync(mdPath, md);

  const res = run(mdPath, outPath);
  assert.equal(res.status, 0, res.stderr);
  const html = fs.readFileSync(outPath, 'utf8');

  assert.match(html, /<title>Test Design<\/title>/);
  // The visible heading must be filled too, not just the <title>: the template
  // has [DOC TITLE] in both places (replaceAll, not replace).
  assert.match(html, /<h1>Test Design<\/h1>/);
  assert.doesNotMatch(html, /\[DOC (TITLE|SUBTITLE|MODE|DATE)\]/);
  assert.match(html, /<section class="doc-section" id="summary">/);
  assert.match(html, /<section class="doc-section" id="details">/);
  assert.match(html, /<table>/);
  assert.ok(html.includes('<ul>') && html.includes('<ol>'), 'has both list types');
  assert.ok(html.includes('<strong>') && html.includes('<code>') && html.includes('<em>') && html.includes('<a href'), 'inline formatting');
  assert.match(html, /<h3>Subsection<\/h3>/);
  assert.ok(html.includes('<figure class="diagram-slot">') && html.includes('<svg'), 'diagram embedded');
  assert.match(html, /callout">raw html passthrough/);

  fs.rmSync(tmp, { recursive: true, force: true });
});

test('assemble: multi-paragraph raw HTML (details, callouts) survives blank lines', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agentify-assemble-html-'));
  const md = `---
title: HTML Block
---

## 1. Section

<details class="interview"><summary>Interview notes</summary>

<p><strong>Strong answer.</strong> First paragraph.</p>

<p><strong>Tradeoffs.</strong> Second paragraph after a blank line.</p>

</details>

A trailing paragraph.
`;
  const mdPath = path.join(tmp, 'design.md');
  const outPath = path.join(tmp, 'out.html');
  fs.writeFileSync(mdPath, md);
  const res = run(mdPath, outPath);
  assert.equal(res.status, 0, res.stderr);
  const html = fs.readFileSync(outPath, 'utf8');
  // The whole details block, including the paragraph after the blank line, must
  // be inside one raw block, not escaped or split into literal text.
  assert.match(html, /<details class="interview">[\s\S]*Second paragraph after a blank line[\s\S]*<\/details>/);
  assert.match(html, /<p>A trailing paragraph\.<\/p>/);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('assemble: a diagram that fails post-render checks is not embedded', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agentify-assemble-badfig-'));
  // A rendered diagram HTML with a diagonal arrow (fails the orthogonal_arrows check).
  fs.writeFileSync(path.join(tmp, 'bad.html'),
    '<!doctype html><svg viewBox="0 0 200 100"><path d="M 10 10 L 190 90" class="a-default" marker-end="url(#arrowhead)"/></svg>');
  const md = '---\ntitle: Bad Fig\n---\n\n## 1. Section\n\ntext\n\n![fig](bad.html)\n';
  const mdPath = path.join(tmp, 'design.md');
  fs.writeFileSync(mdPath, md);
  const res = run(mdPath, path.join(tmp, 'out.html'));
  assert.notEqual(res.status, 0, 'should refuse to embed an unchecked diagram');
  assert.match(res.stderr, /post-render checks/i);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('assemble: an em dash in the design is rejected', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agentify-assemble-neg-'));
  // Build the em dash from its code point so this test file itself stays lint-clean.
  const emDash = String.fromCharCode(0x2014);
  const md = `---\ntitle: Bad\n---\n\n## 1. Summary\n\nThis has an em dash ${emDash} which is banned.\n`;
  const mdPath = path.join(tmp, 'design.md');
  fs.writeFileSync(mdPath, md);
  const res = run(mdPath, path.join(tmp, 'out.html'));
  assert.notEqual(res.status, 0, 'should exit non-zero on em dash');
  assert.match(res.stderr, /em dash/i);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('assemble: missing section headings fails clearly', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agentify-assemble-nosec-'));
  const mdPath = path.join(tmp, 'design.md');
  fs.writeFileSync(mdPath, '---\ntitle: Empty\n---\n\nJust a paragraph, no headings.\n');
  const res = run(mdPath, path.join(tmp, 'out.html'));
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /section/i);
  fs.rmSync(tmp, { recursive: true, force: true });
});
