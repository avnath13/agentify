import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(__dirname, '..');
const diff = path.join(skillRoot, 'renderers', 'doc', 'diff-doc.mjs');

test('diff: aligns sections, detects deltas, and renders a colored line diff', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agentify-diff-'));
  const a = `---
title: Design A
---

## 1. Executive summary
The recommendation is Rung 1, a lightweight design.

## 2. Only in A
This section is removed in B.
`;
  const b = `---
title: Design B
---

## 1. Executive summary
The recommendation is Rung 3, an enterprise weight class design.

## 3. Only in B
This section is added in B.
`;
  const aPath = path.join(tmp, 'a.md');
  const bPath = path.join(tmp, 'b.md');
  const out = path.join(tmp, 'diff.html');
  fs.writeFileSync(aPath, a);
  fs.writeFileSync(bPath, b);

  const res = spawnSync(process.execPath, [diff, aPath, bPath, out], { encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr);
  const html = fs.readFileSync(out, 'utf8');

  // Headline metric deltas detected and shown before/after.
  assert.match(html, /Escalation rung/);
  assert.match(html, /class="d-del-c">1</);
  assert.match(html, /class="d-add-c">3</);
  // Section alignment: summary changed, one added, one removed.
  assert.match(html, /b-changed">changed<\/span> 1\. Executive summary/);
  assert.match(html, /b-added">added<\/span> 3\. Only in B/);
  assert.match(html, /b-removed">removed<\/span> 2\. Only in A/);
  // Line-level diff with add and del lines.
  assert.ok(html.includes('class="d-add"') && html.includes('class="d-del"'), 'has colored diff lines');

  fs.rmSync(tmp, { recursive: true, force: true });
});
