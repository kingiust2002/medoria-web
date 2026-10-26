// The real `npm run check:mobile` logic (scripts/check-mobile-width.mjs) run against the e2e build: every default
// route must LOAD with a 2xx page of real content, and nothing may be wider than the screen or out of reach, at a
// short phone (320×568) and a normal one (390×800). A route that answers 404 now fails here instead of passing
// as "coverage".
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { BASE, launch } from "./helpers.mjs";
import { checkPages, defaultRoutes, printFailures } from "../../scripts/check-mobile-width.mjs";

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser?.close(); });

test("every default route loads and fits (phone 320×568 and 390×800)", { timeout: 900_000 }, async () => {
  const routes = defaultRoutes();
  const { failures, checked } = await checkPages({ browser, base: BASE, viewports: [{ width: 320, height: 568 }, { width: 390, height: 800 }], routes });
  if (failures.length) {
    const lines = [];
    const orig = console.error; console.error = (...a) => lines.push(a.join(" "));
    try { printFailures(failures, checked); } finally { console.error = orig; }
    assert.fail(lines.join("\n").slice(0, 6000));
  }
  assert.ok(checked >= routes.length * 2);
});
