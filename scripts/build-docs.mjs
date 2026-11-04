// Builds the PDF documents in docs/ from the HTML sources in docs/src/.
//
//   node scripts/build-docs.mjs                 every document
//   node scripts/build-docs.mjs srs             one document
//   node scripts/build-docs.mjs srs --preview   also save each page as a PNG in docs/src/preview/
//
// Paged.js lays the HTML out into A4 pages (running headers, page numbers, the
// contents page); a headless Chromium browser (Edge or Chrome) prints it to PDF.
// Set BROWSER to the browser's path if it isn't found automatically.

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const src = path.join(root, "docs", "src");
const args = process.argv.slice(2);
const preview = args.includes("--preview");
const wanted = args.filter((a) => !a.startsWith("--"));
const docs = readdirSync(src)
  .filter((f) => f.endsWith(".html"))
  .map((f) => f.replace(/\.html$/, ""))
  .filter((name) => !wanted.length || wanted.includes(name));

const BROWSERS = [
  process.env.BROWSER,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
];
const browserPath = BROWSERS.find((b) => b && existsSync(b));
if (!browserPath) throw new Error("No Chromium browser found. Set BROWSER to its path.");

// A small static server: Paged.js reads the stylesheets over HTTP, which file:// doesn't allow.
const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png" };
const server = createServer((req, res) => {
  const file = path.join(root, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!file.startsWith(root) || !existsSync(file)) return res.writeHead(404).end();
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream" });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

const port = 9400 + Math.floor(Math.random() * 400);
const browser = spawn(
  browserPath,
  ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(path.join(tmpdir(), "docs-"))}`, "about:blank"],
  { stdio: "ignore" },
);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let target;
for (let i = 0; i < 50 && !target; i++) {
  try {
    target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page");
  } catch {}
  if (!target) await wait(200);
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let nextId = 0;
const pending = new Map();
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) pending.get(m.id)(m);
  if (m.method === "Runtime.exceptionThrown") console.error("  page error:", m.params.exceptionDetails.exception?.description);
});
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });
const evaluate = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result.value;

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setEmulatedMedia", { media: "print" });

for (const name of docs) {
  await send("Page.navigate", { url: `${base}/docs/src/${name}.html` });
  let done = false;
  for (let i = 0; i < 300 && !done; i++) {
    await wait(100);
    done = (await evaluate("window.__pagedDone === true").catch(() => false)) === true;
  }
  if (!done) throw new Error(`${name}: Paged.js didn't finish`);
  const pages = await evaluate("document.querySelectorAll('.pagedjs_page').length");

  const pdf = await send("Page.printToPDF", { preferCSSPageSize: true, printBackground: true, displayHeaderFooter: false });
  const out = path.join(root, "docs", `${name}.pdf`);
  writeFileSync(out, Buffer.from(pdf.data, "base64"));
  console.log(`${name}.pdf  ${pages} pages`);

  if (preview) {
    const dir = path.join(src, "preview", name);
    mkdirSync(dir, { recursive: true });
    await send("Emulation.setEmulatedMedia", { media: "screen" });
    const boxes = await evaluate(
      "[...document.querySelectorAll('.pagedjs_page')].map(p => { const r = p.getBoundingClientRect(); return { x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height }; })",
    );
    for (const [i, b] of boxes.entries()) {
      const shot = await send("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: true,
        clip: { x: b.x, y: b.y, width: b.w, height: b.h, scale: 1.4 },
      });
      writeFileSync(path.join(dir, `page-${String(i + 1).padStart(2, "0")}.png`), Buffer.from(shot.data, "base64"));
    }
    await send("Emulation.setEmulatedMedia", { media: "print" });
  }
}

ws.close();
browser.kill();
server.close();
