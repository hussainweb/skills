#!/usr/bin/env node
// Build a single-file HTML walkthrough from <dir>/story.md and <dir>/scenes/*.d2.
// Usage: node build.mjs <dir> [--out file.html] [--layout tala|elk|dagre] [--lenient] [--fetch-d2]
import { readFileSync, writeFileSync, readdirSync, mkdtempSync, rmSync, existsSync, mkdirSync, chmodSync } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';
import { execFileSync } from 'node:child_process';
import { tmpdir, platform, arch, homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ASSETS = join(here, '..', 'assets');
const D2_VERSION = 'v0.9.0';
const D2_LOCAL = join(here, '..', '.bin', `d2-${D2_VERSION}`, 'd2');

// D2 is the parser, layout engine (TALA, ELK, dagre) and SVG renderer; the
// build only needs it at build time. Resolve it without touching any global
// config: $D2_BIN, then PATH, then a copy inside this skill's .bin/ which
// --fetch-d2 downloads from the GitHub release.
function whichD2() {
  if (process.env.D2_BIN) return process.env.D2_BIN;
  try { execFileSync('d2', ['--version'], { stdio: 'ignore' }); return 'd2'; } catch {}
  if (existsSync(D2_LOCAL)) return D2_LOCAL;
  return null;
}
async function fetchD2() {
  const os = { linux: 'linux', darwin: 'macos', win32: 'windows' }[platform()];
  const cpu = { x64: 'amd64', arm64: 'arm64' }[arch()];
  if (!os || !cpu) throw new Error(`no D2 release for ${platform()}/${arch()}`);
  const name = `d2-${D2_VERSION}-${os}-${cpu}.tar.gz`;
  const url = `https://github.com/terrastruct/d2/releases/download/${D2_VERSION}/${name}`;
  const dir = dirname(D2_LOCAL); mkdirSync(dir, { recursive: true });
  process.stderr.write(`fetching ${url}\n`);
  const res = await fetch(url); if (!res.ok) throw new Error(`${res.status} fetching ${url}`);
  const tgz = join(dir, name); writeFileSync(tgz, Buffer.from(await res.arrayBuffer()));
  execFileSync('tar', ['-xzf', tgz, '-C', dir, '--strip-components=2', `d2-${D2_VERSION}/bin/d2`]);
  rmSync(tgz); chmodSync(D2_LOCAL, 0o755);
  return D2_LOCAL;
}
const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const dir = resolve(argv.find((a) => !a.startsWith('--') && !['--out', '--layout'].includes(argv[argv.indexOf(a) - 1])) || '.');
const out = resolve(flag('--out', join(dir, 'index.html')));
const layout = flag('--layout', 'tala');
const lenient = argv.includes('--lenient');
let D2 = whichD2();
if (!D2 && argv.includes('--fetch-d2')) D2 = await fetchD2();
if (!D2) {
  console.error(`d2 not found. Put it on PATH, set D2_BIN, or run with --fetch-d2 to download ${D2_VERSION} into ${dirname(D2_LOCAL)} (nothing outside this skill directory is touched).`);
  process.exit(1);
}
const LIST = ['reveal', 'only', 'hide', 'highlight', 'flow'];
const DIRECTIVE = /^(scene|reveal|only|hide|highlight|camera|flow|evidence|all|reset|caption):\s*(.*)$/;

// ---- story -----------------------------------------------------------------
function parseKV(s) { const o = {}; for (const l of s.split('\n')) { const m = /^(\w+):\s*(.*)$/.exec(l); if (m) o[m[1]] = m[2].trim(); } return o; }
function parseStory(src) {
  let meta = {}, body = src;
  if (src.startsWith('---')) { const end = src.indexOf('\n---', 3); meta = parseKV(src.slice(3, end)); body = src.slice(end + 4); }
  const chapters = []; let chapter = null, step = null, lastScene = null;
  for (const line of body.split('\n')) {
    let m;
    if ((m = /^# (.+)/.exec(line))) { chapter = { title: m[1].trim(), intro: [], steps: [] }; chapters.push(chapter); step = null; continue; }
    if ((m = /^## (.+)/.exec(line))) {
      if (!chapter) throw new Error('A "## step" appeared before any "# chapter"');
      step = { title: m[1].trim(), d: {}, evidence: [], body: [] }; chapter.steps.push(step); continue;
    }
    if (step && (m = DIRECTIVE.exec(line))) {
      const [, k, v] = m;
      if (k === 'evidence') step.evidence.push(...v.split(',').map((s) => s.trim()).filter(Boolean));
      else if (LIST.includes(k)) step.d[k] = v.split(',').map((s) => s.trim()).filter(Boolean);
      else if (k === 'camera') step.d.camera = ['all', 'fit'].includes(v.trim()) ? v.trim() : v.split(',').map((s) => s.trim()).filter(Boolean);
      else if (k === 'all' || k === 'reset') step.d[k] = v.trim() !== 'false';
      else step.d[k] = v.trim();
      continue;
    }
    (step ? step.body : chapter ? chapter.intro : []).push(line);
  }
  for (const c of chapters) for (const s of c.steps) {
    if (!s.d.scene) s.d.scene = lastScene; lastScene = s.d.scene;
    if (!s.d.scene) throw new Error(`Step "${s.title}" has no scene and none to inherit`);
  }
  return { meta, chapters };
}
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');
}
function md(lines) {
  const out = []; let para = [], list = [], table = [];
  const cells = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
  const flush = () => {
    if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = []; }
    if (list.length) { out.push(`<ul>${list.map((l) => `<li>${inline(l)}</li>`).join('')}</ul>`); list = []; }
    if (table.length) {
      const [head, ...rows] = table.filter((r) => !/^\|?\s*:?-+/.test(r));
      out.push(`<table><thead><tr>${cells(head).map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>` +
        rows.map((r) => `<tr>${cells(r).map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('') + `</tbody></table>`);
      table = [];
    }
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) { flush(); continue; }
    if (/^\|/.test(line)) { if (para.length || list.length) flush(); table.push(line); continue; }
    if (table.length) flush();
    if (/^- /.test(line)) { if (para.length) flush(); list.push(line.slice(2)); continue; }
    if (list.length) flush();
    para.push(line.trim());
  }
  flush(); return out.join('\n');
}

// ---- scenes ----------------------------------------------------------------
const B64 = /^[A-Za-z0-9+/]+={0,2}$/;
function decodeId(cls) {
  if (!B64.test(cls) || cls.length % 4) return null;
  const s = Buffer.from(cls, 'base64').toString('utf8');
  return /^[\x20-\x7E]+$/.test(s) ? s : null;
}
function renderScene(name, src, tmp) {
  const d2 = join(tmp, name + '.d2'), svgPath = join(tmp, name + '.svg');
  writeFileSync(d2, readFileSync(join(ASSETS, 'c4.d2'), 'utf8') + '\n' + src);
  try {
    execFileSync(D2, ['--layout', layout, '--pad', '40', '--no-xml-tag', '--theme', '0', d2, svgPath], { stdio: ['ignore', 'ignore', 'pipe'] });
  } catch (e) { console.error(`d2 failed on scene ${name}:\n${e.stderr}`); process.exit(1); }
  let svg = readFileSync(svgPath, 'utf8').trim();
  const nodes = new Set(), edges = new Map();
  // D2 wraps the diagram in an outer <svg> whose viewBox differs from the inner
  // one. Unwrap it so getBBox() and the viewBox share one coordinate system.
  if (/^<svg[^>]*>\s*<svg/.test(svg)) svg = svg.slice(svg.indexOf('>') + 1).replace(/<\/svg>\s*$/, '');
  svg = svg.replace(/<svg([^>]*)>/, (m, attrs) => {
    attrs = attrs.replace(/\s(width|height)="[^"]*"/g, '');
    return `<svg xmlns="http://www.w3.org/2000/svg"${attrs} data-scene="${name}" preserveAspectRatio="xMidYMid meet">`;
  });
  svg = svg.replace(/<g class="([^"]+)">/g, (m, cls) => {
    const id = decodeId(cls.split(' ')[0]); if (!id) return m;
    const e = /^(?:(.*)\.)?\((.+?) (-&gt;|&lt;-|&lt;-&gt;|--) (.+?)\)\[(\d+)\]$/.exec(id);
    if (e) {
      const [, scope, a, , b, n] = e;
      const abs = (x) => (scope ? scope + '.' + x : x);
      const eid = `${abs(a)}->${abs(b)}` + (n !== '0' ? `#${n}` : '');
      edges.set(eid, [abs(a), abs(b)]);
      return `<g class="${cls}" data-id="${esc(eid)}" data-kind="edge" data-from="${esc(abs(a))}" data-to="${esc(abs(b))}">`;
    }
    nodes.add(id);
    return `<g class="${cls}" data-id="${esc(id)}" data-kind="node">`;
  });
  return { svg, nodes, edges };
}
function matchCount(pat, sc) {
  if (pat === '*') return sc.nodes.size;
  if (pat.includes('->')) {
    const [a, b] = pat.split('->').map((s) => s.trim());
    const one = (p, id) => p === '*' || (p.endsWith('.*') ? id === p.slice(0, -2) || id.startsWith(p.slice(0, -2) + '.') : id === p);
    return [...sc.edges.values()].filter(([f, t]) => one(a, f) && one(b, t)).length;
  }
  if (pat.endsWith('.*')) { const base = pat.slice(0, -2); return [...sc.nodes].filter((id) => id === base || id.startsWith(base + '.')).length; }
  return sc.nodes.has(pat) ? 1 : 0;
}

// ---- main ------------------------------------------------------------------
const storyPath = join(dir, 'story.md');
if (!existsSync(storyPath)) { console.error(`No story.md in ${dir}`); process.exit(1); }
const { meta, chapters } = parseStory(readFileSync(storyPath, 'utf8'));
const sceneDir = join(dir, 'scenes');
const sceneFiles = existsSync(sceneDir) ? readdirSync(sceneDir).filter((f) => f.endsWith('.d2')).sort() : [];
if (!sceneFiles.length) { console.error(`No scenes/*.d2 in ${dir}`); process.exit(1); }
const tmp = mkdtempSync(join(tmpdir(), 'wt-'));
const scenes = {};
for (const f of sceneFiles) {
  const name = basename(f, '.d2');
  process.stderr.write(`rendering scene ${name} (${layout})\n`);
  scenes[name] = renderScene(name, readFileSync(join(sceneDir, f), 'utf8'), tmp);
}
rmSync(tmp, { recursive: true, force: true });

const problems = [];
let stepCount = 0;
for (const c of chapters) for (const s of c.steps) {
  stepCount++;
  const sc = scenes[s.d.scene];
  if (!sc) { problems.push(`step "${s.title}": unknown scene "${s.d.scene}"`); continue; }
  for (const k of ['reveal', 'only', 'hide', 'highlight', 'flow', ...(Array.isArray(s.d.camera) ? ['camera'] : [])])
    for (const pat of s.d[k] || []) if (!matchCount(pat, sc)) problems.push(`step "${s.title}": ${k} "${pat}" matches nothing in scene ${s.d.scene}`);
  for (const ev of s.evidence) {
    const [p] = ev.split(':'); const abs = p.startsWith('/') ? p : meta.repo ? join(meta.repo, p) : null;
    if (abs && !existsSync(abs)) problems.push(`step "${s.title}": evidence file missing: ${p}`);
  }
}
if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n  ` + problems.join('\n  '));
  if (!lenient) { console.error('\nFix these or pass --lenient.'); process.exit(2); }
}
for (const [name, sc] of Object.entries(scenes)) process.stderr.write(`  ${name}: ${sc.nodes.size} nodes, ${sc.edges.size} edges\n`);

const editorScheme = { vscode: 'vscode://file/', cursor: 'cursor://file/', zed: 'zed://file/', idea: 'idea://open?file=' }[meta.editor || 'vscode'];
function evidenceHtml(list) {
  if (!list.length) return '';
  return `<ul class="evidence">` + list.map((ev) => {
    const m = /^([^:]+)(?::(\d+))?/.exec(ev); const p = m[1], line = m[2];
    const label = esc(ev);
    const parts = [];
    const abs = p.startsWith('/') ? p : meta.repo ? join(meta.repo, p) : null;
    if (abs) parts.push(`<a href="${editorScheme}${esc(abs)}${line ? ':' + line : ''}" title="Open in editor">${label}</a>`);
    else parts.push(`<span>${label}</span>`);
    if (meta.remote && meta.commit && !p.startsWith('/')) parts.push(`<a class="gh" href="${esc(meta.remote.replace(/\/$/, ''))}/blob/${esc(meta.commit)}/${esc(p)}${line ? '#L' + line : ''}" title="Open on remote">remote</a>`);
    return `<li>${parts.join(' ')}</li>`;
  }).join('') + `</ul>`;
}
const attr = (o) => JSON.stringify(o).replace(/&/g, '&amp;').replace(/'/g, '&#39;').replace(/</g, '&lt;');
let si = 0;
const text = chapters.map((c, ci) => `
<section class="chapter" id="ch-${ci}">
  <h2>${inline(c.title)}</h2>
  ${c.intro.join('').trim() ? `<div class="intro">${md(c.intro)}</div>` : ''}
  ${c.steps.map((s) => `
  <article class="step" id="s-${++si}" data-chapter="${ci}" data-state='${attr(s.d)}'>
    <h3>${inline(s.title)}</h3>
    ${md(s.body)}
    ${evidenceHtml(s.evidence)}
  </article>`).join('')}
</section>`).join('');

const css = readFileSync(join(ASSETS, 'style.css'), 'utf8');
const js = readFileSync(join(ASSETS, 'runtime.js'), 'utf8');
const title = meta.title || basename(dir);
const built = new Date().toISOString().slice(0, 10);
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>${css}</style>
</head>
<body>
<div class="wt-progress"></div>
<header class="wt-header">
  <h1>${esc(title)}</h1>
  ${meta.subtitle ? `<p>${inline(meta.subtitle)}</p>` : ''}
  <p class="meta">Built ${built}${meta.commit ? ` from <code>${esc(meta.commit)}</code>` : ''} · ${stepCount} steps in ${chapters.length} chapters · scroll or press ↓ / ↑ · drag to pan, ctrl+wheel or pinch to zoom, o for overview</p>
</header>
<nav class="wt-nav"><ol>${chapters.map((c, i) => `<li data-chapter="${i}"><a href="#ch-${i}">${i + 1}. ${inline(c.title)}</a></li>`).join('')}</ol></nav>
<main class="wt">
  <div class="wt-text">${text}</div>
  <aside class="wt-figure">
    <div class="wt-stage">
      <div class="wt-controls" aria-label="Diagram controls">
        <button type="button" data-act="out" title="Zoom out (-)">−</button>
        <button type="button" data-act="in" title="Zoom in (+)">+</button>
        <button type="button" data-act="fit" title="Back to the step's framing (0 or double-click)">⤢</button>
        <button type="button" data-act="overview" title="Show the whole scene (o)">◎</button>
      </div>
      ${Object.values(scenes).map((s) => s.svg).join('\n')}
    </div>
    <div class="wt-caption"></div>
  </aside>
</main>
<footer class="wt-footer">Generated walkthrough. Diagrams are a model of the code at the commit above, with evidence links on each step; where the diagram and the code disagree, the code wins.</footer>
<script>${js}</script>
</body>
</html>`;
writeFileSync(out, html);
process.stderr.write(`wrote ${out} (${(html.length / 1024).toFixed(0)} KB)\n`);
