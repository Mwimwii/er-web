#!/usr/bin/env node
// Browser smoke test for the generated site.
//
// Renders the site in a real headless Chromium rather than only parsing the
// markup: every page must load with no console errors and no 4xx response,
// the interactive features must actually work, and no page may scroll
// sideways at any width from a phone up to a desktop.
//
//   node browser-test.mjs            # spawns server.mjs on a free port
//   BASE=http://host:port node browser-test.mjs   # test something else
//
// Exits 1 on the first failed assertion.
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

const results = [];
let failures = 0;
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
  if (!ok) failures++;
}
function group(title) {
  console.log(`\n${title}`);
}

// ---------- server ----------
async function freePort() {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => resolve(p)); });
  });
}

let base = process.env.BASE || "";
let child = null;
if (!base) {
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, [path.join(HERE, "server.mjs"), String(port)], {
    cwd: HERE, stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", () => {});
  child.stderr.on("data", (d) => process.stderr.write(d));
  await new Promise((resolve, reject) => {
    const t0 = Date.now();
    (function wait() {
      const s = net.connect(port, "127.0.0.1");
      s.once("connect", () => { s.destroy(); resolve(); });
      s.once("error", () => {
        if (Date.now() - t0 > 15000) return reject(new Error("server did not start"));
        setTimeout(wait, 150);
      });
    })();
  });
}
console.log(`testing ${base}`);

const browser = await chromium.launch();

// ---------- every page must load cleanly ----------
group("page loads (console errors and 4xx responses)");

// Discover the pages from the tree links the site itself publishes.
const discover = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await discover.goto(base + "/", { waitUntil: "networkidle" });
const paths = await discover.evaluate(() =>
  [...document.querySelectorAll(".tree a")].map((a) => a.getAttribute("href"))
);
await discover.close();
// + the pages that are not in the tree
for (const p of ["/", "/search.html?q=guard", "/404", "/hljs/github-dark.min.css"]) {
  if (!paths.includes(p)) paths.push(p);
}

let dirty = 0;
for (const p of paths) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [], bad = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("response", (r) => { if (r.status() >= 400) bad.push(`${r.url()} -> ${r.status()}`); });
  const resp = await page.goto(base + p, { waitUntil: "networkidle" });
  const status = resp ? resp.status() : 0;
  if (p === "/404" || p.startsWith("/nope")) {
    if (status !== 404) { console.log(`FAIL ${p}: expected 404, got ${status}`); failures++; }
  } else if (status !== 200) {
    console.log(`FAIL ${p}: HTTP ${status}`); failures++;
  } else if (errors.length || bad.length) {
    console.log(`FAIL ${p}: ${[...errors, ...bad].join(" | ")}`); dirty++;
  }
  await page.close();
}
check(`${paths.length} pages load with no console errors and no 4xx responses`, dirty === 0, dirty ? `${dirty} dirty` : "");

// ---------- interaction ----------
group("interaction");

{
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(base + "/", { waitUntil: "networkidle" });

  check("title is set", (await page.title()).length > 0, await page.title());
  check("file tree populated", (await page.locator(".tree a").count()) > 20,
    `${await page.locator(".tree a").count()} files`);

  const before = await page.evaluate(() => document.body.className);
  await page.click("#theme");
  const after = await page.evaluate(() => document.body.className);
  check("#theme toggles the theme", before !== after, `${before || "(dark)"} -> ${after || "(dark)"}`);
  check("highlight.js stylesheet follows the theme",
    (await page.evaluate(() => document.getElementById("hljs-light").disabled)) === false);

  await page.keyboard.press("t");
  check("'t' toggles the theme",
    (await page.evaluate(() => document.body.className)) !== after);

  await page.keyboard.press("/");
  check("'/' focuses search",
    String(await page.evaluate(() => document.activeElement && document.activeElement.className)).includes("search"));

  await page.close();
}

{
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(base + "/search.html?q=guard", { waitUntil: "networkidle" });
  check("search returns hits", (await page.locator(".hit").count()) > 0,
    `${await page.locator(".hit").count()} hits for "guard"`);
  check("search echoes the query", (await page.inputValue("#q")) === "guard");

  // A fresh token each run: a fixed string would eventually appear in this
  // very file once it is committed, and the index would find it.
  const miss = "qz" + Math.random().toString(36).slice(2, 10);
  await page.goto(base + `/search.html?q=${miss}`, { waitUntil: "networkidle" });
  check(`search no-results path ("${miss}")`, (await page.locator(".hit").count()) === 0,
    `${await page.locator(".hit").count()} hits`);

  await page.goto(base + "/search.html?q=", { waitUntil: "networkidle" });
  check("empty query prompts instead of erroring",
    (await page.locator("#meta").innerText()).includes("grep"));
  await page.close();
}

{
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(base + "/files/src/sim/player.rs.html", { waitUntil: "networkidle" });
  check("line anchors present", (await page.locator("span[id^='L']").count()) > 100,
    `${await page.locator("span[id^='L']").count()} lines`);
  check("clickable line numbers", (await page.locator(".gutter a").count()) > 100);
  check("code is syntax highlighted", (await page.locator("pre code span[class]").count()) > 100,
    `${await page.locator("pre code span[class]").count()} tokens`);
  check("prev/next navigation present", (await page.locator(".navfiles a").count()) > 0);
  check("download link points at /raw/", String(await page.locator('.filehead a[download]').getAttribute("href")).startsWith("/raw/"));

  const before = page.url();
  await page.keyboard.press("]");
  await page.waitForTimeout(600);
  check("']' moves to the next file", page.url() !== before, page.url().replace(base, ""));
  await page.close();
}

{
  const page = await browser.newPage();
  // Octet-stream answers are downloads, so ask for them as a request rather
  // than navigating: Chromium aborts page.goto() when a download starts.
  const raw = await page.request.get(base + "/raw/tools/ww2ogg/packed_codebooks_aoTuV_603.bin");
  check("binary raw asset served", raw.status() === 200, String(raw.status()));
  const nf = await page.goto(base + "/no-such-page.html");
  check("unknown path is 404", nf.status() === 404, String(nf.status()));
  check("404 uses the designed page",
    (await page.locator("h1").innerText()).includes("404"));
  await page.close();
}

// ---------- layout ----------
group("layout (no horizontal scroll at any width)");

const layoutPaths = ["/", "/search.html?q=guard", "/files/src/sim/player.rs.html", "/files/README.md.html"];
const widths = [320, 360, 390, 414, 640, 768, 1024, 1440];
let overflow = [];
for (const p of layoutPaths) {
  for (const w of widths) {
    const page = await browser.newPage({ viewport: { width: w, height: 900 } });
    await page.goto(base + p, { waitUntil: "networkidle" });
    const d = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (d > 2) overflow.push(`${d}px at ${w}px on ${p}`);
    await page.close();
  }
}
check(`${layoutPaths.length} pages x ${widths.length} widths have no horizontal overflow`,
  overflow.length === 0, overflow.slice(0, 5).join("; "));

{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(base + "/", { waitUntil: "networkidle" });
  check("mobile drawer button visible", await page.locator("#hamburger").isVisible());
  check("file drawer starts closed",
    !(await page.locator("#sidebar").evaluate((el) => el.classList.contains("open"))));
  await page.click("#hamburger");
  check("'hamburger' opens the file drawer",
    await page.locator("#sidebar").evaluate((el) => el.classList.contains("open")));
  await page.close();
}

await browser.close();
if (child) child.kill();

console.log(`\n${results.length} checks, ${failures} failed`);
if (failures) {
  console.log("\nfailed:");
  for (const r of results) if (!r.ok) console.log(`  ${r.name} — ${r.detail}`);
}
process.exit(failures ? 1 : 0);
