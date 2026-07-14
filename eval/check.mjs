#!/usr/bin/env node
// Reasoning eval for the agentify skill.
//
// The skill's value is its design reasoning, not the diagram engine, yet only
// the engine had tests. This harness checks that a produced design lands on the
// expected decisions (escalation rung, weight class, key concepts present,
// over-engineering markers absent), so a SKILL.md or knowledge change that
// quietly regresses the reasoning is caught.
//
// The skill is driven by a model, so producing a design is a manual or
// agent-run step (see eval/README.md). This tool grades a produced design and
// validates the case file. It does not call a model.
//
// Usage:
//   node eval/check.mjs --validate                 validate cases.jsonl shape
//   node eval/check.mjs --seeded                   check every case with a `design` path
//   node eval/check.mjs <case-id> <design-file>    check one produced design

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const casesPath = path.join(__dirname, 'cases.jsonl');

function loadCases() {
  const lines = fs.readFileSync(casesPath, 'utf8').split('\n').filter((l) => l.trim());
  return lines.map((l, i) => {
    try { return JSON.parse(l); }
    catch (e) { console.error(`cases.jsonl line ${i + 1} is not valid JSON: ${e.message}`); process.exit(2); }
  });
}

function validateCases(cases) {
  let bad = 0;
  const ids = new Set();
  for (const c of cases) {
    const problems = [];
    if (!c.id) problems.push('missing id');
    if (ids.has(c.id)) problems.push(`duplicate id ${c.id}`);
    ids.add(c.id);
    if (!c.prompt) problems.push('missing prompt');
    if (!c.expect || typeof c.expect !== 'object') problems.push('missing expect');
    else {
      for (const k of ['mustMention', 'mustNot']) {
        if (c.expect[k] && !Array.isArray(c.expect[k])) problems.push(`${k} must be an array`);
      }
      if (c.expect.rung != null && typeof c.expect.rung !== 'number') problems.push('rung must be a number');
    }
    if (problems.length) { bad += 1; console.error(`  FAIL ${c.id || '(no id)'}: ${problems.join('; ')}`); }
  }
  if (bad) { console.error(`\n${bad} case(s) invalid`); process.exit(1); }
  console.log(`ok: ${cases.length} cases well-formed`);
}

function checkDesign(c, text) {
  const hay = text.toLowerCase();
  const failures = [];
  const e = c.expect || {};
  if (e.rung != null && !new RegExp(`rung\\s*${e.rung}`, 'i').test(text)) {
    failures.push(`expected Rung ${e.rung} not stated`);
  }
  if (e.weightClass && !hay.includes(e.weightClass.toLowerCase())) {
    failures.push(`expected weight class "${e.weightClass}" not stated`);
  }
  for (const m of e.mustMention || []) {
    if (!hay.includes(m.toLowerCase())) failures.push(`missing expected concept: "${m}"`);
  }
  for (const m of e.mustNot || []) {
    if (hay.includes(m.toLowerCase())) failures.push(`over-engineering marker present: "${m}"`);
  }
  return failures;
}

function readDesign(p) {
  const abs = path.isAbsolute(p) ? p : path.join(repoRoot, p);
  if (!fs.existsSync(abs)) { console.error(`design file not found: ${p}`); process.exit(2); }
  return fs.readFileSync(abs, 'utf8');
}

const args = process.argv.slice(2);
const cases = loadCases();

if (args[0] === '--validate') {
  validateCases(cases);
  process.exit(0);
}

if (args[0] === '--seeded') {
  const seeded = cases.filter((c) => c.design);
  if (!seeded.length) { console.log('no seeded cases (none have a `design` path)'); process.exit(0); }
  let failed = 0;
  for (const c of seeded) {
    const failures = checkDesign(c, readDesign(c.design));
    if (failures.length) { failed += 1; console.error(`  FAIL ${c.id}:\n    - ${failures.join('\n    - ')}`); }
    else console.log(`  ok   ${c.id}`);
  }
  if (failed) { console.error(`\n${failed} seeded case(s) failed`); process.exit(1); }
  console.log(`\nall ${seeded.length} seeded cases passed`);
  process.exit(0);
}

const [caseId, designFile] = args;
if (!caseId || !designFile) {
  console.error('Usage: check.mjs --validate | --seeded | <case-id> <design-file>');
  process.exit(2);
}
const c = cases.find((x) => x.id === caseId);
if (!c) { console.error(`no case with id "${caseId}"`); process.exit(2); }
const failures = checkDesign(c, readDesign(designFile));
if (failures.length) {
  console.error(`FAIL ${c.id}:\n  - ${failures.join('\n  - ')}`);
  process.exit(1);
}
console.log(`ok ${c.id}: all expectations met`);
