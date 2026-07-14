#!/usr/bin/env node
// Build the GitHub Pages site into _site/.
//
// The landing page and its committed assets live in docs/. The gallery pages
// are the current design documents in examples/, copied in fresh at build time
// so the published site can never drift from the repo. Run by the Pages
// workflow on every push; also runnable locally to preview.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docs = path.join(root, 'docs');
const site = path.join(root, '_site');

fs.rmSync(site, { recursive: true, force: true });

// Copy docs/ (index.html, .nojekyll, assets/) into _site, but not any stale
// examples/ copy; the gallery is regenerated below.
fs.cpSync(docs, site, {
  recursive: true,
  filter: (src) => {
    const rel = path.relative(docs, src);
    return rel !== 'examples' && !rel.startsWith(`examples${path.sep}`);
  },
});

// Copy the current design documents in as the live gallery.
const examplesOut = path.join(site, 'examples');
fs.mkdirSync(examplesOut, { recursive: true });
const designs = fs.readdirSync(path.join(root, 'examples')).filter((f) => f.endsWith('.design.html'));
for (const f of designs) {
  fs.copyFileSync(path.join(root, 'examples', f), path.join(examplesOut, f));
}

console.log(`built _site: index + ${designs.length} gallery pages`);
