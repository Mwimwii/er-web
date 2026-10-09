// Generates a static, browsable version of the ELDEN-RING-Combat-Rewrite repo:
// rendered README with a table of contents, every source file syntax-highlighted
// with clickable line numbers and permalinks, prev/next file navigation, a
// client-side full-text search, and a verified status panel.
import { marked } from "marked";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import hljs from "highlight.js";

const REPO = process.env.ER_SRC || process.cwd();
const OUT = process.env.ER_OUT || path.join(process.cwd(), "site");
const REPO_URL = "https://github.com/Mwimwii/er-web";
const HLJS_DARK = path.join(process.cwd(), "node_modules", "highlight.js", "styles", "github-dark.min.css");
const HLJS_LIGHT = path.join(process.cwd(), "node_modules", "highlight.js", "styles", "github.min.css");

marked.setOptions({ gfm: true, breaks: false });

// heading ids for TOC / anchors
function slugify(text) {
  return text
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}
const renderer = new marked.Renderer();
renderer.heading = function ({ tokens, depth }) {
  const text = this.parser.parseInline(tokens);
  const id = slugify(text);
  return `<h${depth} id="${id}">${text}</h${depth}>`;
};
marked.use({ renderer });

// ---------- walk ----------
const SKIP = new Set([".git", "target", "node_modules", "__pycache__", "site", ".github"]);
const MAX_TEXT = 1_000_000;

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

const files = walk(REPO).map((abs) => ({ abs, rel: path.relative(REPO, abs) }));

function readMaybe(abs) {
  try {
    const buf = fs.readFileSync(abs);
    if (buf.length > 4_000_000) return null;
    const n = Math.min(buf.length, 8000);
    for (let i = 0; i < n; i++) if (buf[i] === 0) return null;
    return { buf, text: buf.toString("utf8") };
  } catch { return null; }
}

const CODE_EXT = {
  ".rs": "rust", ".py": "python", ".toml": "ini", ".md": "markdown",
  ".txt": "plaintext", ".json": "json", ".js": "javascript", ".mjs": "javascript",
  ".ts": "typescript", ".html": "xml", ".css": "css", ".sh": "bash",
  ".yml": "yaml", ".yaml": "yaml", ".h": "cpp", ".c": "cpp", ".cpp": "cpp",
  ".hpp": "cpp", ".license": "plaintext",
};

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ---------- stats ----------
const sha = execSync(`git -C ${REPO} rev-parse --short HEAD`).toString().trim();
const fullSha = execSync(`git -C ${REPO} rev-parse HEAD`).toString().trim();
const branch = execSync(`git -C ${REPO} rev-parse --abbrev-ref HEAD`).toString().trim();
let rsFiles = 0, rsLines = 0, pyFiles = 0, pyLines = 0, textFiles = 0;
for (const f of files) {
  const r = readMaybe(f.abs);
  if (!r) continue;
  const ext = path.extname(f.rel);
  textFiles++;
  if (ext === ".rs") { rsFiles++; rsLines += r.text.split("\n").length; }
  if (ext === ".py") { pyFiles++; pyLines += r.text.split("\n").length; }
}
const genDate = new Date().toUTCString();

// ---------- tree ----------
const tree = {};
for (const f of files) {
  const parts = f.rel.split(path.sep);
  let node = tree;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (i === parts.length - 1) node[part] = { __file: f };
    else { node[part] ??= {}; node = node[part]; }
  }
}

function sortEntries(node) {
  return Object.entries(node).sort(([a, av], [b, bv]) => {
    const af = !!av.__file, bf = !!bv.__file;
    return af === bf ? a.localeCompare(b) : af ? 1 : -1;
  });
}

function renderTree(node, depth) {
  let html = `<ul class="tree">`;
  for (const [name, v] of sortEntries(node)) {
    if (v.__file) {
      const rel = v.__file.rel;
      html += `<li><a href="/files/${encodeURI(rel)}.html" title="${esc(rel)}" data-name="${esc(name.toLowerCase())}" data-path="${esc(rel.toLowerCase())}">${esc(name)}</a></li>`;
    } else {
      html += `<li><details ${depth < 2 ? "open" : ""}><summary title="${esc(name)}/" data-name="${esc(name.toLowerCase())}">${esc(name)}/</summary>`;
      html += renderTree(v, depth + 1);
      html += `</details></li>`;
    }
  }
  return html + "</ul>";
}

// ---------- ordered list (tree order, for prev/next) ----------
function flatFiles(node, out = []) {
  for (const [, v] of sortEntries(node)) {
    if (v.__file) out.push(v.__file);
    else flatFiles(v, out);
  }
  return out;
}
const ordered = flatFiles(tree);
const navPos = new Map(ordered.map((f, i) => [f.rel, i]));

// ---------- css / shell ----------
const css = `
:root{--bg:#0e0d0b;--panel:#171512;--panel2:#1e1a15;--border:#2e2820;--gold:#c8a24a;--gold2:#e8cf8a;--fg:#e6dfcf;--dim:#9a917e;--code:#14120f;--header-h:54px}
body.light{--bg:#f6f1e7;--panel:#fffdf6;--panel2:#f1ead9;--border:#ddd2b8;--gold:#8a6d1f;--gold2:#6e5514;--fg:#2b2517;--dim:#6f6650;--code:#fbf7ec;}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.65 -apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;transition:background .15s,color .15s}
a{color:var(--gold2);text-decoration:none}a:hover{text-decoration:underline}
header{position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:12px;height:var(--header-h);padding:0 18px;background:var(--panel);border-bottom:1px solid var(--border)}
header .brand{font-weight:700;color:var(--gold);letter-spacing:.4px;white-space:nowrap;min-width:0;overflow:hidden;text-overflow:ellipsis}
header .sub{color:var(--dim);font-size:12.5px;white-space:nowrap}
header .spacer{flex:1}
header form{display:flex;gap:6px;min-width:0}
header input.search{width:200px;min-width:0;flex:1 1 auto;background:var(--code);border:1px solid var(--border);border-radius:6px;color:var(--fg);padding:6px 10px;font-size:13px}
header input.search:focus{outline:none;border-color:var(--gold)}
header a.btn,header button.btn{font-size:12.5px;border:1px solid var(--border);border-radius:6px;padding:5px 10px;color:var(--fg);background:var(--panel2);white-space:nowrap;cursor:pointer}
header a.btn:hover,header button.btn:hover{border-color:var(--gold);color:var(--gold2);text-decoration:none}
button.btn{font-size:12.5px;border:1px solid var(--border);border-radius:6px;padding:4px 11px;color:var(--fg);background:var(--panel2);cursor:pointer}
button.btn:hover{border-color:var(--gold);color:var(--gold2)}
.layout{display:grid;grid-template-columns:270px 1fr;min-height:calc(100vh - var(--header-h))}
aside{border-right:1px solid var(--border);background:var(--panel);padding:14px 10px 40px;overflow:auto;max-height:calc(100vh - var(--header-h));position:sticky;top:var(--header-h)}
aside .filter{width:100%;background:var(--code);border:1px solid var(--border);border-radius:6px;color:var(--fg);padding:7px 9px;font-size:13px;margin-bottom:10px}
.tree,.tree ul{list-style:none;margin:0;padding-left:12px}
.tree{padding-left:0;font-size:13.5px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.tree summary{cursor:pointer;color:var(--dim);padding:2px 0}
.tree summary::marker{color:var(--gold)}
.tree a{display:block;padding:1.5px 6px;border-radius:5px;color:var(--fg);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:240px}
.tree a:hover{background:var(--panel2);text-decoration:none}
.tree a.active{background:var(--panel2);color:var(--gold2);box-shadow:inset 2px 0 0 var(--gold)}
main{padding:30px 44px 60px;max-width:1000px;min-width:0}
h1,h2,h3,h4{color:var(--gold2);font-weight:650;line-height:1.3}
h1{font-size:29px;border-bottom:1px solid var(--border);padding-bottom:12px;margin-top:6px}
h2{font-size:22px;margin-top:38px;border-bottom:1px solid var(--border);padding-bottom:6px}h3{font-size:18px;margin-top:28px}
h4{font-size:16px;margin-top:22px}
.card{background:var(--panel);border:1px solid var(--border);border-radius:10px;padding:16px 20px;margin:18px 0}
.card h3{margin-top:0}
.kv{display:grid;grid-template-columns:180px minmax(0,1fr);gap:4px 14px;font-size:14px;margin:0}
.kv dt{color:var(--dim)}.kv dd{margin:0;min-width:0}
.kv code{overflow-wrap:anywhere}
.badges span{display:inline-block;background:var(--panel2);border:1px solid var(--border);color:var(--gold2);border-radius:20px;padding:1px 12px;font-size:12px;margin:0 6px 6px 0}
pre{background:var(--code);border:1px solid var(--border);border-radius:8px;padding:14px 16px;overflow:auto;font-size:13px;line-height:1.55}
code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
p code,li code,td code,h code{background:var(--code);border:1px solid var(--border);border-radius:4px;padding:1px 5px;font-size:.88em}
blockquote{border-left:3px solid var(--gold);margin:14px 0;padding:2px 16px;color:var(--dim);background:var(--panel);border-radius:0 6px 6px 0}
table{border-collapse:collapse;margin:14px 0;width:100%;display:block;overflow:auto}
th,td{border:1px solid var(--border);padding:6px 12px;text-align:left}
th{background:var(--panel2);color:var(--gold2)}
img,video{max-width:100%;border-radius:8px;border:1px solid var(--border)}
hr{border:none;border-top:1px solid var(--border);margin:26px 0}
.crumbs{color:var(--dim);font-size:13px;font-family:ui-monospace,Menlo,Consolas,monospace;margin-bottom:10px;word-break:break-all}
.filehead{display:flex;align-items:center;gap:10px;margin-bottom:8px;font-size:13px;color:var(--dim);flex-wrap:wrap}
.filehead .path{font-family:ui-monospace,Menlo,Consolas,monospace;color:var(--fg)}
.navfiles{display:flex;justify-content:space-between;gap:10px;margin:14px 0 26px;font-size:13.5px}
.navfiles a{max-width:48%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.navfiles .next{margin-left:auto;text-align:right}
.codewrap{display:flex;overflow:auto;background:var(--code);border:1px solid var(--border);border-radius:8px}
.gutter{position:sticky;left:0;flex:none;background:var(--code);border-right:1px solid var(--border);user-select:none;z-index:2}
.gutter a,.code .cl{display:block;height:auto;font:13px/1.55 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;white-space:pre}
.gutter a{color:var(--dim);text-align:right;padding:0 12px 0 16px;text-decoration:none}
.gutter a:hover{color:var(--gold2);text-decoration:none}
.code{flex:1;min-width:0;margin:0;padding:14px 18px;border:none;border-radius:0;overflow:visible;background:transparent}
.code .cl{padding:0 4px}
.code .cl:target,.code .cl.flash{background:rgba(200,162,74,.16);box-shadow:inset 2px 0 0 var(--gold)}
pre code.hljs{background:transparent;padding:0;display:block}
.mdpre{position:relative}
.mdpre .copy{position:absolute;top:8px;right:8px;opacity:.75}
.hidden{display:none!important}
mark{background:#6b5a1e;color:#ffe9a8;border-radius:2px;padding:0 1px}
body.light mark{background:#f0d98c;color:#3a2f10}
footer{color:var(--dim);font-size:12.5px;border-top:1px solid var(--border);padding:16px 44px;margin-top:20px}
.toc{columns:2;column-gap:34px}
.toc a{display:block;padding:2px 0;font-size:13.5px}
.kbd{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11.5px;background:var(--panel2);border:1px solid var(--border);border-bottom-width:2px;border-radius:4px;padding:0 5px;color:var(--fg)}
#hamburger{display:none}
@media(max-width:900px){
  .layout{grid-template-columns:1fr}
  aside{position:fixed;left:0;top:var(--header-h);bottom:0;width:270px;max-height:none;z-index:15;transform:translateX(-100%);transition:transform .18s;box-shadow:6px 0 24px rgba(0,0,0,.4)}
  aside.open{transform:none}
  main{padding:18px 16px 60px;max-width:100%}
  #hamburger{display:inline-block}
  header{gap:8px;padding:0 12px}
  header .sub{display:none}
  header input.search{width:110px}
  footer{padding:16px}
  .toc{columns:1}
}
@media(max-width:640px){
  header .brand-sub{display:none}
  .kv{grid-template-columns:minmax(0,1fr)}
  .kv dd{margin-bottom:8px}
}
@media(max-width:430px){header .gh{display:none}}
`;

function page(title, body, activeRel, nav) {
  const crumb = activeRel ? `<div class="crumbs">${esc(activeRel)}</div>` : "";
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · Elden Ring Combat Rewrite</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ctext y='26' font-size='26'%3E%E2%9A%94%3C/text%3E%3C/svg%3E">
<link rel="stylesheet" href="/hljs/github-dark.min.css" id="hljs-dark">
<link rel="stylesheet" href="/hljs/github.min.css" id="hljs-light" disabled>
<style>${css}</style>
</head><body>
<header>
  <button class="btn" id="hamburger" aria-label="Toggle file tree">☰</button>
  <a class="brand" href="/" title="Elden Ring Combat Rewrite">⚔ ER<span class="brand-sub"> Combat Rewrite</span></a>
  <span class="sub">${esc(sha)}</span>
  <span class="spacer"></span>
  <form action="/search.html" method="get"><input class="search" name="q" type="search" placeholder="Search files…  ( / )" autocomplete="off"></form>
  <button class="btn" id="theme" title="Toggle light/dark (t)">◐</button>
  <a class="btn gh" href="${REPO_URL}" target="_blank">GitHub ↗</a>
</header>
<div class="layout">
<aside id="sidebar">
  <input class="filter" id="filter" type="search" placeholder="Filter files… (e.g. player.rs)">
  ${renderTree(tree, 0)}
</aside>
<main>${crumb}${body}${nav ?? ""}</main>
</div>
<footer>Static site generated from this checkout · ${esc(genDate)} · upstream repo is MIT licensed ·
shortcuts: <span class="kbd">/</span> search · <span class="kbd">t</span> theme · <span class="kbd">[</span>/<span class="kbd">]</span> prev/next file</footer>
<script>
(function(){
  var saved = null;
  try { saved = localStorage.getItem('er-theme'); } catch(e) {}
  if (saved === 'light') setTheme('light');
  function setTheme(t) {
    document.body.classList.toggle('light', t === 'light');
    var d = document.getElementById('hljs-dark'), l = document.getElementById('hljs-light');
    if (d && l) { d.disabled = (t === 'light'); l.disabled = (t !== 'light'); }
    try { localStorage.setItem('er-theme', t); } catch(e) {}
  }
  var themeBtn = document.getElementById('theme');
  if (themeBtn) themeBtn.addEventListener('click', function(){ setTheme(document.body.classList.contains('light') ? 'dark' : 'light'); });

  var ham = document.getElementById('hamburger'), side = document.getElementById('sidebar');
  if (ham && side) ham.addEventListener('click', function(){ side.classList.toggle('open'); });

  document.addEventListener('keydown', function(e){
    var tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') {
      if (e.key === 'Escape') e.target.blur();
      return;
    }
    if (e.key === '/') { e.preventDefault(); var s = document.querySelector('header input.search'); if (s) s.focus(); }
    else if (e.key === 't') { setTheme(document.body.classList.contains('light') ? 'dark' : 'light'); }
    else if (e.key === '[') { var p = document.querySelector('.navfiles .prev'); if (p) location.href = p.href; }
    else if (e.key === ']') { var n = document.querySelector('.navfiles .next'); if (n) location.href = n.href; }
  });

  var filter = document.getElementById('filter');
  if (filter) filter.addEventListener('input', function(){
    var q = filter.value.trim().toLowerCase();
    document.querySelectorAll('.tree a').forEach(function(a){
      var hit = !q || (a.dataset.name && a.dataset.name.includes(q)) || (a.dataset.path && a.dataset.path.includes(q));
      a.classList.toggle('hidden', !hit);
    });
    document.querySelectorAll('.tree details').forEach(function(d){ if (q) d.open = true; });
  });

  // copy buttons on markdown code fences
  document.querySelectorAll('main pre > code').forEach(function(code){
    var pre = code.parentElement;
    if (pre.parentElement && pre.parentElement.classList.contains('codewrap')) return;
    pre.classList.add('mdpre');
    var b = document.createElement('button');
    b.className = 'btn copy'; b.textContent = 'Copy';
    b.addEventListener('click', function(){
      var t = code.innerText;
      function done(){ b.textContent = 'Copied ✓'; setTimeout(function(){ b.textContent = 'Copy'; }, 1500); }
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done, function(){ fallback(); });
      else fallback();
      function fallback(){ var ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch(e) {} ta.remove(); done(); }
    });
    pre.appendChild(b);
  });

  // gutter line numbers copy permalinks
  document.querySelectorAll('.gutter a').forEach(function(a){
    a.addEventListener('click', function(e){
      e.preventDefault();
      var href = a.getAttribute('href');
      var url = location.origin + location.pathname + href;
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).catch(function(){});
      var el = document.getElementById(href.slice(1));
      if (el) { el.classList.add('flash'); setTimeout(function(){ el.classList.remove('flash'); }, 1200); }
      history.replaceState(null, '', href);
      a.textContent = '✓'; setTimeout(function(){ a.textContent = a.dataset.n; }, 1200);
    });
  });

  // highlight the line from the incoming hash
  function flashHash(){
    var h = location.hash;
    if (h && h.indexOf('#L') === 0) {
      var el = document.getElementById(h.slice(1));
      if (el) { el.classList.add('flash'); setTimeout(function(){ el.classList.remove('flash'); }, 1500); el.scrollIntoView({block:'center'}); }
    }
  }
  window.addEventListener('hashchange', flashHash);
  flashHash();
})();
</script>
</body></html>`;
}

// ---------- line-wrapped highlighted code ----------
// Splits highlight.js output into per-line spans without breaking multi-line tokens.
function wrapLines(html) {
  const lines = [];
  let cur = "";
  const stack = [];
  for (let i = 0; i < html.length; i++) {
    const ch = html[i];
    if (ch === "<") {
      const end = html.indexOf(">", i);
      if (end === -1) { cur += ch; continue; }
      const tag = html.slice(i, end + 1);
      if (/^<\/[a-zA-Z]/.test(tag)) { stack.pop(); cur += tag; }
      else if (/^<[a-zA-Z]/.test(tag) && !/\/>$/.test(tag)) {
        stack.push(tag.slice(1).split(/[\s>]/)[0]);
        cur += tag;
      } else cur += tag;
      i = end;
      continue;
    }
    if (ch === "\n") {
      if (stack.length === 0) { lines.push(cur); cur = ""; }
      else {
        cur += stack.slice().reverse().map((n) => `</${n}>`).join("");
        lines.push(cur);
        cur = stack.map((n) => `<${n}>`).join("");
      }
      continue;
    }
    cur += ch;
  }
  lines.push(cur); // unconditional: keeps count == text.split("\n").length
  const out = lines.map((l, idx) => `<span class="cl" id="L${idx + 1}">${l || " "}</span>`).join("");
  return { html: out, count: lines.length };
}

function codeBlock(f, text) {
  const lang = CODE_EXT[path.extname(f.rel)] || "plaintext";
  const wrapped = wrapLines(hljs.highlight(text.slice(0, MAX_TEXT), { language: lang }).value);
  const lines = wrapped.count;
  const gutter = Array.from({ length: lines }, (_, i) => `<a href="#L${i + 1}" data-n="${i + 1}">${i + 1}</a>`).join("");
  return `
<div class="filehead">
  <span class="path">${esc(f.rel)}</span>
  <span>${text.length.toLocaleString()} chars · ${lines.toLocaleString()} lines</span>
  <span>${lang}</span>
  <button class="btn copy" type="button">Copy file</button>
  <a class="btn" href="/raw/${encodeURI(f.rel)}" download>Download</a>
  <a class="btn" href="${REPO_URL}/blob/${branch}/${f.rel}" target="_blank">On GitHub ↗</a>
</div>
<div class="codewrap"><div class="gutter" aria-hidden="true">${gutter}</div><pre class="code"><code class="hljs language-${lang}">${wrapped.html}</code></pre></div>
<p style="color:var(--dim);font-size:12.5px;margin-top:8px">Click a line number to copy a permalink to that line.</p>
<script>
(function(){
  var b = document.querySelector('.filehead .copy');
  if (b) b.addEventListener('click', function(){
    var t = document.querySelector('.code').innerText;
    function done(){ b.textContent = 'Copied ✓'; setTimeout(function(){ b.textContent = 'Copy file'; }, 1500); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done, function(){ fb(); }); else fb();
    function fb(){ var ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch(e) {} ta.remove(); done(); }
  });
})();
</script>`;
}

function navHtml(rel) {
  const i = navPos.get(rel);
  if (i === undefined) return "";
  const prev = ordered[i - 1], next = ordered[i + 1];
  let html = `<div class="navfiles">`;
  html += prev ? `<a class="prev" href="/files/${encodeURI(prev.rel)}.html">← ${esc(prev.rel)}</a>` : `<span></span>`;
  html += next ? `<a class="next" href="/files/${encodeURI(next.rel)}.html">${esc(next.rel)} →</a>` : `<span></span>`;
  return html + "</div>";
}

function mdLinkRewrite(md) {
  return md.replace(/\]\((?!https?:|#|mailto:|data:)([^)]+)\)/g, (m, p) => {
    const clean = p.replace(/^\.\//, "").split("#")[0];
    const hash = p.includes("#") ? "#" + p.split("#")[1] : "";
    if (files.some((f) => f.rel === clean)) return `](/files/${encodeURI(clean)}.html${hash})`;
    if (files.some((f) => f.rel === clean + ".md")) return `](/files/${encodeURI(clean + ".md")}.html${hash})`;
    return `](/raw/${encodeURI(clean)}${hash})`;
  });
}

function tocOf(renderedHtml) {
  const items = [];
  const re = /<h([23]) id="([^"]+)">(.*?)<\/h\1>/g;
  let m;
  while ((m = re.exec(renderedHtml))) items.push({ depth: Number(m[1]), id: m[2], text: m[3].replace(/<[^>]+>/g, "") });
  if (!items.length) return "";
  let html = `<div class="card"><h3>Contents</h3><div class="toc">`;
  for (const it of items) html += `<a href="#${it.id}" style="${it.depth === 3 ? "padding-left:16px;color:var(--dim)" : ""}">${esc(it.text)}</a>`;
  return html + "</div></div>";
}

// ---------- output ----------
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(path.join(OUT, "hljs"), { recursive: true });
fs.copyFileSync(HLJS_DARK, path.join(OUT, "hljs", "github-dark.min.css"));
fs.copyFileSync(HLJS_LIGHT, path.join(OUT, "hljs", "github.min.css"));

for (const f of files) {
  const st = fs.statSync(f.abs);
  if (st.size > 6_000_000) continue;
  if (!readMaybe(f.abs)) {
    const dest = path.join(OUT, "raw", f.rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(f.abs, dest);
  }
}

const searchIndex = [];
for (const f of files) {
  const r = readMaybe(f.abs);
  if (!r) continue;
  searchIndex.push({ p: f.rel, l: r.text.split("\n").slice(0, 20000) });
}
fs.writeFileSync(path.join(OUT, "search-index.json"), JSON.stringify(searchIndex));

// ---------- index page ----------
const readmeRaw = fs.readFileSync(path.join(REPO, "README.md"), "utf8");
const readmeHtml = marked.parse(mdLinkRewrite(readmeRaw));
const statusCard = `
<div class="card">
<h3 id="can-this-run">Can this project run in a browser? — verified answer: no, and why</h3>
<p>This is a <b>native desktop application</b> (Rust + <a href="https://bevyengine.org" target="_blank">Bevy</a> 0.19, crate
<code>tarnished</code>): it opens a window, takes keyboard/gamepad input and renders with the
machine's GPU. It is not a web app and nothing upstream is served over HTTP. Three
independent, verified facts:</p>
<ol>
<li><b>The build needs generated game data.</b> <a href="/files/build.rs.html"><code>build.rs</code></a>
hard-fails unless <code>src/sim/extracted.rs</code> exists. That file, plus
<code>assets/player_anims.bin</code> and the sounds, are generated from your own copy of
Elden Ring by <a href="/files/tools/setup.py.html"><code>tools/setup.py</code></a> and are
<b>not in the repository</b> (the fan project ships code only).</li>
<li><b>The data generator is Windows-only.</b>
<a href="/files/tools/erfmt.py.html"><code>tools/erfmt.py</code></a> loads the game's
<code>oo2core_6_win64.dll</code> via <code>ctypes.WinDLL</code>; <code>paths.py</code>'s default game
folder is a Steam Windows path. Verified on this VM: Python 3.13 reports
<code>hasattr(ctypes,'WinDLL') == False</code>. So <code>setup.py</code> cannot run on this Linux VM
<b>even with the game files present</b>.</li>
<li><b>Therefore nothing can run here.</b> Even a hypothetical WASM build still needs the
extracted data and a desktop graphics context; no browser build path exists for this codebase.</li>
</ol>
<p>What this VM gives you instead is the <b>entire project, fully usable in the browser</b>:
rendered docs, every file with syntax highlighting, line permalinks, and full-text search.</p>
</div>
<div class="card">
<h3 id="build-for-real">To build &amp; run it for real (Windows PC that owns the game)</h3>
<pre><code class="language-bash">python tools/setup.py   # needs ER_FILES (unpacked chr/, regulation-bin/) and ER_GAME_DIR
cargo run               # opens the sandbox window; WASD + mouse, T spawns the dummy</code></pre>
</div>
<div class="card">
<h3 id="about">This copy</h3>
<div class="kv">
<dt>Upstream</dt><dd><a href="https://github.com/Funny-Bones/ELDEN-RING-Combat-Rewrite" target="_blank">Funny-Bones/ELDEN-RING-Combat-Rewrite</a></dd>
<dt>This copy</dt><dd><a href="${REPO_URL}" target="_blank">Mwimwii/er-web</a> — a browsable fork of the above</dd>
<dt>Commit</dt><dd><code>${fullSha}</code> on ${esc(branch)} (<code>${esc(sha)}</code>)</dd>
<dt>Rust code</dt><dd>${rsFiles} files · ${rsLines.toLocaleString()} lines — <code>src/sim/</code> is a pure 60 Hz state machine with no engine types</dd>
<dt>Python tools</dt><dd>${pyFiles} files · ${pyLines.toLocaleString()} lines — stdlib only; the extract step is Windows-only</dd>
<dt>Files here</dt><dd>${files.length} total · ${textFiles} text browsable · ${files.length - textFiles} binary</dd>
<dt>Generated</dt><dd>${esc(genDate)}</dd>
<dt>Shortcuts</dt><dd><span class="kbd">/</span> search · <span class="kbd">t</span> theme · <span class="kbd">[</span>/<span class="kbd">]</span> prev/next file · click a line number to copy its permalink</dd>
</div>
<p class="badges" style="margin-top:12px"><span>60 Hz pure-Rust sim</span><span>timings from game files</span><span>24 weapon classes</span><span>power stance</span><span>hit-stop</span><span>guard meter &amp; break</span><span>lock-on combat</span><span>sparring dummy</span></p>
</div>
`;

fs.writeFileSync(
  path.join(OUT, "index.html"),
  page("Overview", statusCard + tocOf(readmeHtml) + `<h1>README.md</h1>` + readmeHtml, "", navHtml("README.md")),
);

// ---------- file pages ----------
for (const f of files) {
  const ext = path.extname(f.rel);
  const r = readMaybe(f.abs);
  const dest = path.join(OUT, "files", f.rel + ".html");
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  let body;
  if (!r) {
    const st = fs.statSync(f.abs);
    const isMedia = [".png", ".jpg", ".gif", ".svg", ".webp", ".mp4", ".webm"].includes(ext);
    body = `<div class="filehead"><span class="path">${esc(f.rel)}</span><span>binary · ${(st.size / 1024).toFixed(1)} KB</span>
      <a class="btn" href="/raw/${encodeURI(f.rel)}" download>Download</a>
      <a class="btn" href="${REPO_URL}/blob/${branch}/${f.rel}" target="_blank">On GitHub ↗</a></div>
      <div class="card"><p><a href="/raw/${encodeURI(f.rel)}">Open raw file</a></p></div>`;
    if (isMedia) {
      if ([".mp4", ".webm"].includes(ext)) body += `<video controls src="/raw/${encodeURI(f.rel)}"></video>`;
      else if (ext !== ".svg") body += `<img loading="lazy" src="/raw/${encodeURI(f.rel)}" alt="${esc(f.rel)}">`;
    }
  } else if (ext === ".md") {
    const html = marked.parse(mdLinkRewrite(r.text));
    body = tocOf(html) + html;
  } else {
    body = codeBlock(f, r.text);
  }
  fs.writeFileSync(dest, page(f.rel, body, f.rel, navHtml(f.rel)));
}

// ---------- search page ----------
const searchPage = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Search · Elden Ring Combat Rewrite</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ctext y='26' font-size='26'%3E%E2%9A%94%3C/text%3E%3C/svg%3E">
<style>${css}</style>
</head><body>
<header>
  <a class="brand" href="/" title="Elden Ring Combat Rewrite">⚔ ER<span class="brand-sub"> Combat Rewrite</span></a>
  <span class="sub">search</span>
  <span class="spacer"></span>
  <form action="/search.html" method="get" onsubmit="return false"><input class="search" id="q" type="search" placeholder="Search all files…  ( / )" value="" autocomplete="off" autofocus></form>
  <a class="btn gh" href="${REPO_URL}" target="_blank">GitHub ↗</a>
</header>
<main style="max-width:900px;padding:28px 40px 80px">
  <h1 style="border:none;margin-top:0">Search the source</h1>
  <div id="meta" style="color:var(--dim);font-size:13px;margin-bottom:14px">Loading index…</div>
  <div id="results"></div>
</main>
<footer>Client-side full-text index over ${textFiles} text files · generated ${esc(genDate)}</footer>
<style>
.fgroup{margin-bottom:14px}
.hit{display:flex;gap:14px;align-items:baseline;margin:2px 0}
.hit .loc{flex:none;width:300px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12.5px;color:var(--gold2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hit .loc:hover{text-decoration:underline}
.hit pre{margin:0;padding:2px 10px;font-size:12.5px;flex:1;white-space:pre;overflow:hidden;text-overflow:ellipsis}
@media(max-width:800px){
  .hit{flex-direction:column;gap:0}
  .hit .loc{width:auto}
  /* column flex stretches items to the line's cross size, which is the
     unbreakable content width of a white-space:pre snippet; pin it instead. */
  .hit pre{flex:none;width:100%;box-sizing:border-box}
}
</style>
<script>
(function(){
  var params = new URLSearchParams(location.search);
  var input = document.getElementById('q');
  input.value = params.get('q') || '';
  var index = [], meta = document.getElementById('meta'), out = document.getElementById('results');
  var timer;
  fetch('/search-index.json').then(function(r){ return r.json(); }).then(function(d){ index = d; run(); });
  input.addEventListener('input', function(){ clearTimeout(timer); timer = setTimeout(run, 120); });
  window.addEventListener('keydown', function(e){ if (e.key === '/' && document.activeElement !== input) { e.preventDefault(); input.focus(); } });
  function escH(s){ return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function run() {
    var q = input.value.trim().toLowerCase();
    if (q) history.replaceState(null, '', '?q=' + encodeURIComponent(input.value.trim()));
    if (!q) { meta.textContent = 'Type to grep across every file in the repo.'; out.innerHTML = ''; return; }
    if (!index.length) { meta.textContent = 'Loading index…'; return; }
    var hits = 0, fileCount = 0, html = '';
    for (var fi = 0; fi < index.length && hits < 300; fi++) {
      var file = index[fi];
      var inPath = file.p.toLowerCase().indexOf(q) !== -1;
      var shown = 0, fileHtml = '';
      for (var i = 0; i < file.l.length && hits < 300; i++) {
        var line = file.l[i];
        if (line.toLowerCase().indexOf(q) !== -1) {
          hits++; shown++;
          var snip = escH(line.trim().slice(0, 300));
          var idx = snip.toLowerCase().indexOf(q);
          var hi = idx >= 0 ? snip.slice(0, idx) + '<mark>' + snip.slice(idx, idx + q.length) + '</mark>' + snip.slice(idx + q.length) : snip;
          fileHtml += '<div class="hit"><a class="loc" href="/files/' + encodeURI(file.p) + '.html">' + escH(file.p) + ':' + (i + 1) + '</a><pre>' + hi + '</pre></div>';
        }
      }
      if (shown || inPath) {
        fileCount++;
        if (inPath && !shown) fileHtml += '<div class="hit"><a class="loc" href="/files/' + encodeURI(file.p) + '.html">' + escH(file.p) + '</a><pre>(filename match)</pre></div>';
        html += '<div class="fgroup">' + fileHtml + '</div>';
      }
    }
    meta.textContent = hits + ' matching line(s) across ' + fileCount + ' file(s)' + (hits >= 300 ? ' (showing first 300)' : '') + '.';
    out.innerHTML = html;
  }
})();
</script>
</body></html>`;
fs.writeFileSync(path.join(OUT, "search.html"), searchPage);

// ---------- 404 ----------
fs.writeFileSync(path.join(OUT, "404.html"), `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Not found · Elden Ring Combat Rewrite</title>
<link rel="stylesheet" href="/hljs/github-dark.min.css"><style>${css}</style></head>
<body><header><a class="brand" href="/" title="Elden Ring Combat Rewrite">⚔ ER<span class="brand-sub"> Combat Rewrite</span></a><span class="spacer"></span><a class="btn gh" href="${REPO_URL}" target="_blank">GitHub ↗</a></header>
<main style="padding:40px 44px;max-width:700px">
<h1 style="border:none">404 — nothing here</h1>
<p>That path isn't part of this browsable copy of the repo. Try the <a href="/">overview</a>, the
<a href="/search.html">search</a>, or the file tree.</p>
</main><footer>${esc(genDate)}</footer></body></html>`);

console.log(`site generated: ${files.length} files (${textFiles} text), search index ${(fs.statSync(path.join(OUT, "search-index.json")).size / 1e6).toFixed(2)} MB`);
