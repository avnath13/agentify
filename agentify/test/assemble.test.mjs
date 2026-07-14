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

test('assemble: an em dash in the design is rejected', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agentify-assemble-neg-'));
  const md = '---\ntitle: Bad\n---\n\n## 1. Summary\n\nThis has an em dash — which is banned.\n';
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
