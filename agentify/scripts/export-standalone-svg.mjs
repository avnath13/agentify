#!/usr/bin/env node
// Export a self-contained, dual-theme SVG from a rendered diagram HTML.
//
// The renderer emits an SVG whose colors come from CSS custom properties
// defined in the surrounding HTML <style> (dark under :root, light under
// [data-theme="light"]). A bare SVG therefore has no colors on its own.
// This script inlines that stylesheet into the SVG and rewrites the light
// theme selector as an @media (prefers-color-scheme: light) block, so the
// SVG stands alone and follows the reader's theme. That makes it embeddable
// in a GitHub README, the same approach Archify uses for its README SVGs.
//
// Usage: node scripts/export-standalone-svg.mjs <rendered.html> <out.svg>

import fs from 'node:fs';
import path from 'node:path';

function fail(message) {
  console.error(message);
  process.exit(1);
}

const [inputHtml, outSvg] = process.argv.slice(2);
if (!inputHtml || !outSvg) fail('Usage: export-standalone-svg.mjs <rendered.html> <out.svg>');

const html = fs.readFileSync(inputHtml, 'utf8');

const svgMatch = html.match(/<svg[\s\S]*?<\/svg>/);
if (!svgMatch) fail(`No <svg> found in ${inputHtml}`);
const svg = svgMatch[0];

const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/);
if (!styleMatch) fail(`No <style> found in ${inputHtml}`);
let css = styleMatch[1];

// Find the [data-theme="light"] { ... } block by brace matching and lift its
// declarations into an @media (prefers-color-scheme: light) override.
const lightSelector = '[data-theme="light"] {';
const start = css.indexOf(lightSelector);
if (start !== -1) {
  const bodyStart = start + lightSelector.length;
  let depth = 1;
  let i = bodyStart;
  for (; i < css.length && depth > 0; i += 1) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') depth -= 1;
  }
  const inner = css.slice(bodyStart, i - 1).trim();
  // Remove the original block (it would never match inside a standalone SVG).
  css = css.slice(0, start) + css.slice(i);
  css += `\n@media (prefers-color-scheme: light) {\n  :root {\n    ${inner}\n  }\n}\n`;
}

// The default (dark) variables live under ":root, [data-theme="dark"]"; the
// :root part already applies standalone, so no change is needed there.

// Wrap in CDATA: the stylesheet can contain characters ("<", "&") that are
// illegal in XML text and would break SVG parsing when loaded via <img> on
// GitHub. CDATA is safe here because the CSS never contains the "]]>" terminator.
if (css.includes(']]>')) fail('Stylesheet contains "]]>"; cannot safely wrap in CDATA.');
const styleEl = `<style type="text/css"><![CDATA[\n${css.trim()}\n]]></style>`;

// Inject the stylesheet as the first child of the SVG, right after the opening tag.
const openTagEnd = svg.indexOf('>') + 1;
const standalone =
  svg.slice(0, openTagEnd) +
  '\n' + styleEl + '\n' +
  svg.slice(openTagEnd);

fs.mkdirSync(path.dirname(outSvg), { recursive: true });
fs.writeFileSync(outSvg, standalone.trimStart() + '\n');
console.log(`wrote ${outSvg} (${standalone.length} bytes)`);
