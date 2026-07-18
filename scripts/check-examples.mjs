#!/usr/bin/env node
// Validate every gallery example in examples/ the way CONTRIBUTING.md promises:
// rendered diagrams pass the post-render checks, and assembled design documents
// have every embedded diagram pass them too (each <svg> is extracted and
// checked individually, since a design document embeds several).
//
// Diff reports (*.diff.html) carry no diagrams; they get a structural check.
//
// Run from anywhere: node scripts/check-examples.mjs

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const examplesDir = path.join(root, 'examples');
const checker = path.join(root, 'agentify', 'scripts', 'check-render-output.mjs');

const failures = [];

function checkWithPostRender(label, htmlPath) {
  const res = spawnSync(process.execPath, [checker, htmlPath], { encoding: 'utf8' });
  if (res.status !== 0) {
    failures.push(`${label}: post-render checks failed\n${(res.stdout || '') + (res.stderr || '')}`.trim());
  }
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentify-examples-check-'));
try {
  const files = fs.readdirSync(examplesDir).filter((f) => f.endsWith('.html')).sort();
  if (!files.length) { console.error('no .html files found in examples/'); process.exit(2); }

  for (const f of files) {
    const p = path.join(examplesDir, f);
    const content = fs.readFileSync(p, 'utf8');

    if (f.endsWith('.diff.html')) {
      // A diff report has no diagrams; require a well-formed self-contained page.
      if (!/<html/i.test(content) || !/diff/i.test(content)) {
        failures.push(`${f}: does not look like a diff report`);
      }
      continue;
    }

    const svgs = content.match(/<svg[\s\S]*?<\/svg>/g) || [];
    if (!svgs.length) {
      failures.push(`${f}: no <svg> found`);
      continue;
    }

    if (svgs.length === 1) {
      checkWithPostRender(f, p);
      continue;
    }

    // A design document with several embedded diagrams: check each one alone,
    // wrapped in a minimal shell so the single-SVG checker applies per figure.
    svgs.forEach((svg, i) => {
      const wrapped = path.join(tmpDir, `${f}.figure-${i + 1}.html`);
      fs.writeFileSync(wrapped, `<!doctype html><html><body>${svg}</body></html>`);
      checkWithPostRender(`${f} (figure ${i + 1} of ${svgs.length})`, wrapped);
    });
  }

  if (failures.length) {
    console.error(`${failures.length} example(s) failed:\n`);
    for (const msg of failures) console.error(`- ${msg}\n`);
    process.exit(1);
  }
  console.log(`ok: ${files.length} example page(s) validated`);
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
