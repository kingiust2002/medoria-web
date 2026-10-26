// scripts/check-mobile-width.mjs must not have false-green paths (reproduced 2026-10-26):
//   * a real 404 page was reported PASS (exit 0)
//   * a navigation that fails was ignored
//   * every position:fixed element (header, menus, dialogs) was skipped, so a 700px-wide fixed control
//     in a 320px viewport reported zero offenders
//   * a dialog whose button sits below the fold with no way to scroll to it was not looked at
// Runs the real script (real Chromium) against a tiny local web server.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../scripts/check-mobile-width.mjs", import.meta.url));
const LOREM = "Medoria catalog page with enough ordinary text to count as real content. ".repeat(4);
const page = (body, title = "Medoria") => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{margin:0;font:16px sans-serif}</style></head><body>${body}</body></html>`;

const PAGES = {
  "/ok": [200, page(`<main><h1>Catalog</h1><p>${LOREM}</p></main>`)],
  "/gone": [404, page(`<h1>404</h1><p>This page could not be found.</p>`, "404: This page could not be found")],
  "/soft404": [200, page(`<h1>404</h1><p>This page could not be found.</p>`, "404: This page could not be found")],
  "/blank": [200, page("")],
  "/fixed-wide": [200, page(`<main><h1>Catalog</h1><p>${LOREM}</p></main><button style="position:fixed;bottom:10px;left:0;width:700px;height:40px">Wide fixed control</button>`)],
  "/fixed-ok": [200, page(`<main><h1>Catalog</h1><p>${LOREM}</p></main><button style="position:fixed;bottom:10px;left:0;width:200px;height:40px">Fixed control</button>`)],
  "/unreachable": [200, page(`<main><h1>Catalog</h1><p>${LOREM}</p></main><div role="dialog" style="position:fixed;top:0;left:0;right:0;height:1400px;background:#eee"><p>Delete this?</p><button style="position:absolute;top:1000px;left:10px;height:44px">Confirm</button></div>`)],
  "/reachable": [200, page(`<main><h1>Catalog</h1><p>${LOREM}</p></main><div role="dialog" style="position:fixed;top:0;left:0;right:0;bottom:0;overflow-y:auto;background:#eee"><div style="height:1400px;position:relative"><p>Delete this?</p><button style="position:absolute;top:1000px;left:10px;height:44px">Confirm</button></div></div>`)],
};
let server, base;
before(async () => {
  server = http.createServer((req, res) => {
    const [status, html] = PAGES[new URL(req.url, "http://x").pathname] || [404, page("<h1>404</h1>", "404")];
    res.writeHead(status, { "content-type": "text/html" });
    res.end(html);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

function run(routes, extra = [], url = null) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [script, url || base, `--routes=${routes}`, "--widths=320", ...extra], { env: { ...process.env } });
    let out = "";
    p.stdout.on("data", (d) => (out += d)); p.stderr.on("data", (d) => (out += d));
    p.on("close", (code) => resolve({ code, out }));
  });
}

test("a good page passes, and so does a narrow fixed control", async () => {
  const r = await run("/ok,/fixed-ok");
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /✓ PASS/);
});

test("a 404 page is a FAILURE, not coverage (unless that outcome is asserted with --expect)", async () => {
  const r = await run("/gone");
  assert.equal(r.code, 1, `a 404 must not pass:\n${r.out}`);
  assert.match(r.out, /\/gone.*HTTP 404/s);
  const ok = await run("/gone", ["--expect=/gone:404"]);
  assert.equal(ok.code, 0, ok.out);
  const wrong = await run("/ok", ["--expect=/ok:404"]);
  assert.equal(wrong.code, 1, "an expected 404 that answers 200 is also wrong");
  assert.match(wrong.out, /expected HTTP 404/);
});

test("a 'not found' page served with 200, and an empty page, are failures", async () => {
  const soft = await run("/soft404");
  assert.equal(soft.code, 1, soft.out);
  assert.match(soft.out, /not-found page|could not be found/i);
  const blank = await run("/blank");
  assert.equal(blank.code, 1, blank.out);
  assert.match(blank.out, /no real content|empty/i);
});

test("a page that cannot be loaded at all is a failure, not 'measure what loaded'", async () => {
  const r = await run("/ok", [], "http://127.0.0.1:9");
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /could not load|navigation/i);
  assert.ok(!/✓ PASS/.test(r.out), r.out);
});

test("a fixed control wider than the screen is measured (fixed elements are no longer skipped)", async () => {
  const r = await run("/fixed-wide");
  assert.equal(r.code, 1, `a 700px fixed control in a 320px viewport must fail:\n${r.out}`);
  assert.match(r.out, /Wide fixed control|past the screen edge/);
});

test("a button the user cannot scroll to (fixed dialog taller than the screen) is reported; a scrollable dialog is fine", async () => {
  const bad = await run("/unreachable");
  assert.equal(bad.code, 1, `an unreachable Confirm button must fail:\n${bad.out}`);
  assert.match(bad.out, /unreachable|cannot be reached|below the screen/i);
  assert.match(bad.out, /Confirm/);
  const good = await run("/reachable");
  assert.equal(good.code, 0, good.out);
});
