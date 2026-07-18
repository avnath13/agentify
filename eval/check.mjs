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
// Grading semantics:
//   - `mustMention` entries are substring matches, so stems like "escalat"
//     match "escalation" and "escalates".
//   - `mustNot` entries are whole-word matches against the design's visible
//     text (tags, style, and script stripped). A trailing `*` makes an entry a
//     stem ("diagnos*" matches "diagnosis" and "diagnose"). An occurrence whose
//     surrounding text rejects or negates the marker does not count: the
//     section templates require naming rejected alternatives, so "we rejected a
//     vector database" must not fail an over-engineering check.
//
// Usage:
//   node eval/check.mjs --validate                 validate cases.jsonl shape
//   node eval/check.mjs --seeded                   check every case with a `design` path
//   node eval/check.mjs <case-id> <design-file>    check one produced design

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const casesPath = path.join(__dirname, 'cases.jsonl');

export function loadCases() {
  const lines = fs.readFileSync(casesPath, 'utf8').split('\n').filter((l) => l.trim());
  return lines.map((l, i) => {
    try { return JSON.parse(l); }
    catch (e) { console.error(`cases.jsonl line ${i + 1} is not valid JSON: ${e.message}`); process.exit(2); }
  });
}

export function validateCases(cases) {
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
  return bad;
}

// Reduce a design (HTML or markdown) to the text a reader sees, so mustNot
// grading is not tripped by CSS class names, script identifiers, or comments.
export function stripHtml(text) {
  return text
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
}

// Cues that the surrounding text is rejecting the marker rather than
// recommending it: decision-record language ("rejected", "alternatives
// considered"), comparative language ("instead of", "rather than"), and plain
// negation ("not", "no need", "without", "avoid").
const NEGATION_CUES = /(reject|declin|rule[sd]?\s+out|instead|rather\s+than|alternativ|unnecessar|overkill|over-engineer|avoid|without|skip|defer|\bnot?\b|n['’]t\b)/;

function markerPattern(marker) {
  const stem = marker.endsWith('*');
  const body = (stem ? marker.slice(0, -1) : marker)
    .toLowerCase()
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\s+/g, '\\s+');
  const tail = stem ? '' : '(?![a-z0-9])';
  return new RegExp(`(?<![a-z0-9])${body}${tail}`, 'gi');
}

// Returns a short context snippet for the first occurrence of the marker that
// is being recommended (no negation cue nearby), or null if every occurrence
// is negated or the marker is absent.
export function findMustNotViolation(plainText, marker) {
  for (const m of plainText.matchAll(markerPattern(marker))) {
    const start = Math.max(0, m.index - 150);
    const end = Math.min(plainText.length, m.index + m[0].length + 100);
    const window = plainText.slice(start, end).toLowerCase();
    if (!NEGATION_CUES.test(window)) {
      const snipStart = Math.max(0, m.index - 40);
      const snipEnd = Math.min(plainText.length, m.index + m[0].length + 40);
      return plainText.slice(snipStart, snipEnd).trim();
    }
  }
  return null;
}

export function checkDesign(c, text) {
  const hay = text.toLowerCase();
  const plain = stripHtml(text);
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
    const hit = findMustNotViolation(plain, m);
    if (hit) failures.push(`over-engineering marker recommended: "${m}" (context: "...${hit}...")`);
  }
  return failures;
}

function readDesign(p) {
  const abs = path.isAbsolute(p) ? p : path.join(repoRoot, p);
  if (!fs.existsSync(abs)) { console.error(`design file not found: ${p}`); process.exit(2); }
  return fs.readFileSync(abs, 'utf8');
}

function main() {
  const args = process.argv.slice(2);
  const cases = loadCases();

  if (args[0] === '--validate') {
    const bad = validateCases(cases);
    if (bad) { console.error(`\n${bad} case(s) invalid`); process.exit(1); }
    console.log(`ok: ${cases.length} cases well-formed`);
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
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main();
}
