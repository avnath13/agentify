#!/usr/bin/env node
// Compare two design documents and render a visual diff report.
//
// This is the tool behind `agentify diff`. Given two design markdown files for
// the same use case (for example the same system under two different
// constraints), it shows what the change did: a summary of the key decision and
// metric deltas up top, then a section-by-section, color-coded line diff. The
// output is one self-contained themed HTML file.
//
// Usage: node diff-doc.mjs <design-a.md> <design-b.md> [output.html]

import fs from 'node:fs';
import path from 'node:path';

function fail(m) { console.error(m); process.exit(2); }

const [aPath, bPath, outArg] = process.argv.slice(2);
if (!aPath || !bPath) fail('Usage: diff-doc.mjs <design-a.md> <design-b.md> [output.html]');
for (const p of [aPath, bPath]) if (!fs.existsSync(p)) fail(`No such file: ${p}`);

function parse(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const fm = { title: path.basename(file) };
  let body = raw;
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  if (m) {
    for (const line of m[1].split('\n')) {
      const kv = line.match(/^([a-zA-Z_]+):\s*(.*)$/);
      if (kv) fm[kv[1]] = kv[2].trim();
    }
    body = raw.slice(m[0].length);
  }
  const sections = [];
  let cur = null;
  for (const line of body.split('\n')) {
    const h = line.match(/^##\s+(.*)$/);
    if (h) { cur = { title: h[1].trim(), lines: [] }; sections.push(cur); }
    else if (cur) cur.lines.push(line);
  }
  return { fm, sections, text: raw };
}

const A = parse(aPath);
const B = parse(bPath);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Section-heading normalizer so "1. Executive summary" matches across drafts.
const norm = (t) => t.replace(/^\s*\d+[.)]\s*/, '').trim().toLowerCase();

// Longest-common-subsequence line diff.
function diffLines(a, b) {
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) {
    dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  }
  const ops = []; let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { ops.push({ t: 'same', s: a[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push({ t: 'del', s: a[i] }); i++; }
    else { ops.push({ t: 'add', s: b[j] }); j++; }
  }
  while (i < n) { ops.push({ t: 'del', s: a[i++] }); }
  while (j < m) { ops.push({ t: 'add', s: b[j++] }); }
  return ops;
}

// Best-effort detection of headline decisions and metrics for the summary.
const METRICS = [
  { label: 'Escalation rung', re: /\bRung\s*([0-4])\b/i },
  { label: 'Weight class', re: /\b(lightweight|enterprise)\b(?=[\s\S]{0,40}?weight class)|weight class[\s\S]{0,40}?\b(lightweight|enterprise)\b/i },
  { label: 'Cost per unit', re: /([0-9]+(?:\.[0-9]+)?\s*USD\s*(?:per|\/)\s*[a-z]+)/i },
  { label: 'Availability', re: /\b(99\.\d+\s*%)/ },
];
function metric(re, text) {
  const m = text.match(re);
  if (!m) return null;
  return (m.slice(1).find(Boolean) || m[0]).trim();
}
const deltas = [];
for (const { label, re } of METRICS) {
  const va = metric(re, A.text), vb = metric(re, B.text);
  if ((va || vb) && va !== vb) deltas.push({ label, a: va || 'not stated', b: vb || 'not stated' });
}

// Align sections by normalized heading, preserving B's order then A-only extras.
const aByNorm = new Map(A.sections.map((s) => [norm(s.title), s]));
const bByNorm = new Map(B.sections.map((s) => [norm(s.title), s]));
const rows = [];
for (const s of B.sections) {
  const a = aByNorm.get(norm(s.title));
  if (!a) rows.push({ status: 'added', title: s.title, ops: diffLines([], s.lines) });
  else {
    const ops = diffLines(a.lines, s.lines);
    const changed = ops.some((o) => o.t !== 'same');
    rows.push({ status: changed ? 'changed' : 'unchanged', title: s.title, ops });
  }
}
for (const s of A.sections) {
  if (!bByNorm.has(norm(s.title))) rows.push({ status: 'removed', title: s.title, ops: diffLines(s.lines, []) });
}
const counts = rows.reduce((c, r) => (c[r.status] = (c[r.status] || 0) + 1, c), {});

function renderDiff(ops) {
  // Collapse long runs of unchanged context to keep the diff readable.
  const out = [];
  let run = 0;
  for (const o of ops) {
    if (o.t === 'same') {
      run += 1;
      if (run <= 2) out.push(`<span class="d-same"> ${esc(o.s)}</span>`);
      else if (run === 3) out.push('<span class="d-skip">...</span>');
    } else {
      run = 0;
      const sign = o.t === 'add' ? '+' : '-';
      out.push(`<span class="d-${o.t}">${sign} ${esc(o.s)}</span>`);
    }
  }
  return out.join('\n');
}

const badge = { changed: 'changed', added: 'added', removed: 'removed', unchanged: 'unchanged' };
const sectionsHtml = rows.map((r, i) => {
  const body = r.status === 'unchanged'
    ? '<p class="unchanged-note">No changes.</p>'
    : `<pre class="diff">${renderDiff(r.ops)}</pre>`;
  return `<section class="sec" id="s${i}">
  <h3><span class="badge b-${r.status}">${badge[r.status]}</span> ${esc(r.title)}</h3>
  ${body}
</section>`;
}).join('\n');

const deltasHtml = deltas.length
  ? `<table class="deltas"><thead><tr><th>What changed</th><th>Before</th><th>After</th></tr></thead><tbody>${
      deltas.map((d) => `<tr><td>${esc(d.label)}</td><td class="d-del-c">${esc(d.a)}</td><td class="d-add-c">${esc(d.b)}</td></tr>`).join('')
    }</tbody></table>`
  : '<p class="muted">No headline metric changes were detected automatically. See the section diffs below.</p>';

const EMDASH = String.fromCharCode(0x2014);
const html = `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="generator" content="agentify diff">
<title>Design comparison: ${esc(A.fm.title)} vs ${esc(B.fm.title)}</title>
<script>(function(){try{var t=null;try{t=localStorage.getItem('agentify-theme');}catch(e){}if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';}document.documentElement.setAttribute('data-theme',t);}catch(e){}})();</script>
<style>
:root,[data-theme="dark"]{--bg:#0b1220;--panel:#0f172a;--border:#1e293b;--text:#e2e8f0;--muted:#94a3b8;--dim:#64748b;--accent:#818cf8;
 --add:#4ade80;--add-bg:rgba(34,197,94,.13);--del:#f87171;--del-bg:rgba(239,68,68,.13)}
[data-theme="light"]{--bg:#f8fafc;--panel:#ffffff;--border:#e2e8f0;--text:#0f172a;--muted:#475569;--dim:#94a3b8;--accent:#4f46e5;
 --add:#15803d;--add-bg:rgba(34,197,94,.14);--del:#b91c1c;--del-bg:rgba(239,68,68,.10)}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--text);font-family:ui-sans-serif,-apple-system,"Segoe UI",Roboto,sans-serif;line-height:1.6;padding:32px 24px 80px}
.wrap{max-width:980px;margin:0 auto}
header.top{border-bottom:1px solid var(--border);padding-bottom:18px;margin-bottom:24px;display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap}
h1{font-size:22px;letter-spacing:-.01em}
.vs{color:var(--muted);font-size:14px;margin-top:6px}
.vs b{color:var(--text)}
#theme{background:var(--panel);border:1px solid var(--border);color:var(--text);border-radius:8px;padding:6px 12px;cursor:pointer;font:inherit;font-size:13px}
.summary{background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:18px;margin-bottom:22px}
.summary h2{font-size:15px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin-bottom:12px}
.chips{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}
.chip{font-size:12.5px;border:1px solid var(--border);border-radius:999px;padding:3px 10px;color:var(--muted)}
table.deltas{width:100%;border-collapse:collapse;font-size:13.5px}
table.deltas th,table.deltas td{border:1px solid var(--border);padding:7px 11px;text-align:left;vertical-align:top}
table.deltas th{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.05em}
.d-add-c{color:var(--add)}.d-del-c{color:var(--del)}
.muted{color:var(--muted);font-size:14px}
.sec{border:1px solid var(--border);border-radius:12px;margin:12px 0;overflow:hidden}
.sec h3{font-size:15px;padding:12px 16px;background:var(--panel);border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px}
.badge{font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;border-radius:5px;padding:2px 7px;font-weight:700}
.b-changed{background:rgba(129,140,248,.18);color:var(--accent)}
.b-added{background:var(--add-bg);color:var(--add)}
.b-removed{background:var(--del-bg);color:var(--del)}
.b-unchanged{background:transparent;color:var(--dim);border:1px solid var(--border)}
pre.diff{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12.5px;line-height:1.7;padding:8px 0;overflow-x:auto;white-space:pre-wrap;word-break:break-word}
pre.diff span{display:block;padding:1px 16px;border-left:3px solid transparent}
.d-add{background:var(--add-bg);border-left-color:var(--add);color:var(--text)}
.d-del{background:var(--del-bg);border-left-color:var(--del);color:var(--text)}
.d-same{color:var(--dim)}
.d-skip{color:var(--dim);opacity:.6}
.unchanged-note{color:var(--dim);font-size:13.5px;padding:10px 16px}
</style></head>
<body><div class="wrap">
<header class="top">
  <div>
    <h1>Design comparison</h1>
    <div class="vs"><b>${esc(A.fm.title)}</b> &rarr; <b>${esc(B.fm.title)}</b></div>
  </div>
  <button id="theme" type="button">Theme</button>
</header>

<div class="summary">
  <h2>What changed</h2>
  <div class="chips">
    <span class="chip">${counts.changed || 0} changed</span>
    <span class="chip">${counts.added || 0} added</span>
    <span class="chip">${counts.removed || 0} removed</span>
    <span class="chip">${counts.unchanged || 0} unchanged</span>
  </div>
  ${deltasHtml}
</div>

${sectionsHtml}

<script>(function(){var h=document.documentElement,b=document.getElementById('theme');b.addEventListener('click',function(){var t=h.getAttribute('data-theme')==='dark'?'light':'dark';h.setAttribute('data-theme',t);try{localStorage.setItem('agentify-theme',t);}catch(e){}});})();</script>
</div></body></html>`;

if (html.includes(EMDASH)) fail('Diff report contains an em dash; check the inputs.');
const out = outArg || path.join(path.dirname(path.resolve(bPath)), 'design-diff.html');
fs.writeFileSync(out, html);
console.log(`${out} (${counts.changed || 0} changed, ${counts.added || 0} added, ${counts.removed || 0} removed sections)`);
