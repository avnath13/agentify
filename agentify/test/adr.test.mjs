import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(__dirname, '..');
const adr = path.join(skillRoot, 'renderers', 'doc', 'adr.mjs');

function run(logPath, outDir) {
  return spawnSync(process.execPath, [adr, logPath, outDir], { encoding: 'utf8' });
}

test('adr: a decision log becomes numbered ADR files plus an index', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agentify-adr-'));
  const log = `---
title: Test System
date: 2026-07-14
---

## Use a single agent, not multi-agent
Status: Accepted
Context: The path is open-ended.
Decision: One bounded agent.
Consequences: Cheaper than multi-agent; gives up parallelism we do not need.

## Retrieval, not fine-tuning
Context: Knowledge changes weekly.
Decision: Advanced RAG.
Consequences: Stays current.
`;
  const logPath = path.join(tmp, 'log.md');
  const out = path.join(tmp, 'adr');
  fs.writeFileSync(logPath, log);

  const res = run(logPath, out);
  assert.equal(res.status, 0, res.stderr);

  const files = fs.readdirSync(out).sort();
  assert.ok(files.includes('README.md'), 'index exists');
  assert.ok(files.some((f) => f.startsWith('0001-')), 'first ADR numbered');
  assert.ok(files.some((f) => f.startsWith('0002-')), 'second ADR numbered');

  const a1 = fs.readFileSync(path.join(out, files.find((f) => f.startsWith('0001-'))), 'utf8');
  assert.match(a1, /# 1\. Use a single agent, not multi-agent/);
  for (const h of ['## Status', '## Context', '## Decision', '## Consequences']) assert.ok(a1.includes(h), `has ${h}`);

  // Status defaults to Accepted when the label is absent.
  const a2 = fs.readFileSync(path.join(out, files.find((f) => f.startsWith('0002-'))), 'utf8');
  assert.match(a2, /## Status\s*\n\s*Accepted/);

  const index = fs.readFileSync(path.join(out, 'README.md'), 'utf8');
  assert.match(index, /Test System: architecture decision records/);
  assert.match(index, /\[1\. Use a single agent[^\]]*\]\(0001-/);

  fs.rmSync(tmp, { recursive: true, force: true });
});

test('adr: an em dash in a decision is rejected', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agentify-adr-neg-'));
  const dash = String.fromCharCode(0x2014);
  const log = `## A decision\nDecision: this has an em dash ${dash} which is banned.\n`;
  const logPath = path.join(tmp, 'log.md');
  fs.writeFileSync(logPath, log);
  const res = run(logPath, path.join(tmp, 'adr'));
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /em dash/i);
  fs.rmSync(tmp, { recursive: true, force: true });
});
