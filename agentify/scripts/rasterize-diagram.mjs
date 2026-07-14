#!/usr/bin/env node
// Rasterize a rendered diagram HTML to light and dark PNG previews using
// headless Chrome. PNGs render reliably in a GitHub README, where an inline
// SVG stylesheet may be stripped. The SVG and its stylesheet are lifted from
// the rendered HTML and re-wrapped at a fixed size with the theme applied, so
// the PNG matches the engine's output exactly.
//
// Usage: node scripts/rasterize-diagram.mjs <rendered.html> <out-prefix>
//   writes <out-prefix>-dark.png and <out-prefix>-light.png
//
// Requires Google Chrome. Override the binary with CHROME_BIN.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const CHROME = process.env.CHROME_BIN
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

function fail(m) { console.error(m); process.exit(1); }

const [inputHtml, outPrefix] = process.argv.slice(2);
if (!inputHtml || !outPrefix) fail('Usage: rasterize-diagram.mjs <rendered.html> <out-prefix>');
if (!fs.existsSync(CHROME)) fail(`Chrome not found at ${CHROME}; set CHROME_BIN.`);

const html = fs.readFileSync(inputHtml, 'utf8');
const svg = (html.match(/<svg[\s\S]*?<\/svg>/) || [])[0];
const style = (html.match(/<style>([\s\S]*?)<\/style>/) || [])[1];
if (!svg || !style) fail(`Could not extract <svg> and <style> from ${inputHtml}`);

const vb = (svg.match(/viewBox="([\d.\s]+)"/) || [])[1];
if (!vb) fail('SVG has no viewBox');
const [, , vbW, vbH] = vb.trim().split(/\s+/).map(Number);

const PAD = 28;
const WIDTH = Math.round(vbW);              // CSS px; scale factor doubles the pixels
const svgH = Math.round(WIDTH * (vbH / vbW));
const winW = WIDTH + PAD * 2;
const winH = svgH + PAD * 2;

const BG = { dark: '#0b1220', light: '#f8fafc' };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agentify-raster-'));

for (const theme of ['dark', 'light']) {
  const page = `<!doctype html><html data-theme="${theme}"><head><meta charset="utf-8"><style>
${style}
html,body{margin:0;padding:0}
body{background:${BG[theme]};padding:${PAD}px;box-sizing:border-box}
svg{display:block;width:${WIDTH}px;height:${svgH}px}
</style></head><body>${svg}</body></html>`;
  const pageFile = path.join(tmp, `${theme}.html`);
  fs.writeFileSync(pageFile, page);
  const out = `${outPrefix}-${theme}.png`;
  fs.mkdirSync(path.dirname(out), { recursive: true });
  execFileSync(CHROME, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=2',
    `--window-size=${winW},${winH}`,
    `--screenshot=${out}`,
    `file://${pageFile}`,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  console.log(`wrote ${out} (${winW}x${winH} @2x)`);
}

fs.rmSync(tmp, { recursive: true, force: true });
