// Mobile-width law: no page may ever be wider than a phone screen.
// The browser-level measurement is `npm run check:mobile`; these tests pin the
// pieces that make it hold so a refactor cannot quietly remove them.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  HEALTH_WIDTH_PER_H, HEALTH_GAPS, BEAUTY_WIDTH_PER_H, BEAUTY_GAPS,
  fluidLockupHeight, lockupWidthAt,
} from "../lib/brandFluid.js";
import { defaultRoutes, DEFAULT_WIDTHS, LOCALES } from "../scripts/check-mobile-width.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");

const css = read("app/globals.css");
const baseLayer = css.slice(css.indexOf("@layer base {"), css.indexOf("@layer components {"));

test("global guards: the page edge clips, grids start as one shrinkable column, long words wrap", () => {
  assert.match(baseLayer, /html,\s*body\s*\{\s*overflow-x:\s*clip;\s*\}/, "html/body must clip sideways overflow (clip, not hidden: sticky must keep working)");
  assert.ok(!/html,\s*body\s*\{[^}]*overflow-x:\s*hidden/.test(css), "overflow-x: hidden on html/body breaks position: sticky");
  assert.match(baseLayer, /\.grid\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\);\s*\}/, "`.grid` must default to minmax(0, 1fr)");
  assert.match(baseLayer, /body\s*\{\s*overflow-wrap:\s*anywhere;\s*\}/, "long unbroken strings (SKU, brand, URL) must wrap");
  assert.match(baseLayer, /table,\s*th,\s*td[^{]*\{\s*overflow-wrap:\s*normal;\s*\}/, "table cells keep normal wrapping (panel tables scroll sideways inside their own box)");
});

test("the grid default sits in the base layer so any grid-cols-* utility still wins", () => {
  assert.ok(baseLayer.includes(".grid {"), "the .grid default must be inside `@layer base`");
  assert.ok(!/@layer (components|utilities)[^{]*\{[^]*?\n\s*\.grid\s*\{/.test(css.slice(css.indexOf("@layer components {"))), "no later layer may redefine .grid");
});

// A header lockup must never be wider than the room its row leaves for it.
const reservedIn = (file) => Number(read(file).match(/reserved=\{(\d+)\}/)?.[1]);

test("Health header lockup fits beside the mobile controls at every phone width", () => {
  const reserved = reservedIn("components/layout/Header.jsx");
  assert.ok(reserved >= 200, "Header.jsx must pass reserved={…} to <Brand> (controls + padding)");
  const cfg = { height: 30, reserved, minHeight: 12, widthPerH: HEALTH_WIDTH_PER_H, gaps: HEALTH_GAPS };
  for (let vw = 340; vw <= 1100; vw += 10) {
    const { width } = lockupWidthAt(vw, cfg);
    if (vw < 1024) assert.ok(width <= vw - reserved + 0.5, `lockup ${width.toFixed(0)}px does not fit at ${vw}px`);
  }
  // tablets (md ≤ width < lg) carry more header controls: the md reserve must make the lockup fit there too
  const reservedMd = Number(read("components/layout/Header.jsx").match(/reservedMd=\{(\d+)\}/)?.[1]);
  assert.ok(reservedMd > reserved, "Header.jsx must pass a larger reservedMd={…} for tablet widths");
  for (let vw = 768; vw < 1280; vw += 8) {   // the compact header (with the menu button) is used up to the xl breakpoint
    const { width } = lockupWidthAt(vw, { ...cfg, reserved: reservedMd });
    assert.ok(width <= vw - reservedMd + 0.5, `lockup ${width.toFixed(0)}px does not fit at ${vw}px (tablet / small laptop)`);
  }
  assert.match(css, /\.brand-fluid\s*\{\s*--bh:\s*var\(--bh-base\);\s*\}/);
  assert.match(css, /@media \(min-width: 768px\)\s*\{\s*\.brand-fluid\s*\{\s*--bh:\s*var\(--bh-md, var\(--bh-base\)\);\s*\}\s*\}/);
  assert.equal(lockupWidthAt(1440, cfg).height, 30, "desktop keeps the full 30px lockup");
  assert.equal(fluidLockupHeight({ ...cfg, reserved: 0 }), "30px", "without `reserved` the size is fixed");
  assert.match(fluidLockupHeight(cfg), /^clamp\(12px, calc\(\(100vw - \d+px\) \* 0\.\d+\), 30px\)$/);
});

test("Beauty header lockup fits beside the mobile controls at every phone width", () => {
  const reserved = reservedIn("components/beauty/BeautyHeader.jsx");
  assert.ok(reserved >= 200, "BeautyHeader.jsx must pass reserved={…} to <BeautyWordLockup>");
  const cfg = { height: 30, reserved, minHeight: 11, widthPerH: BEAUTY_WIDTH_PER_H, gaps: BEAUTY_GAPS };
  for (let vw = 340; vw < 1024; vw += 10) {
    const { width } = lockupWidthAt(vw, cfg);
    assert.ok(width <= vw - reserved + 0.5, `lockup ${width.toFixed(0)}px does not fit at ${vw}px`);
  }
  assert.equal(lockupWidthAt(1440, cfg).height, 30);
});

test("the mobile check covers both houses, all four languages and the real phone widths", () => {
  const routes = defaultRoutes();
  for (const house of ["health", "beauty"]) {
    for (const l of LOCALES) {
      for (const p of ["", "/catalog", "/categories", "/about", "/contact"]) {
        assert.ok(routes.includes(`/${house}/${l}${p}`), `missing /${house}/${l}${p}`);
      }
    }
  }
  assert.ok(routes.includes("/"));
  assert.deepEqual([...LOCALES].sort(), ["en", "fa", "ru", "tg"]);
  for (const w of [320, 360, 390, 430]) assert.ok(DEFAULT_WIDTHS.includes(w), `width ${w} is not checked`);
  assert.match(read("package.json"), /"check:mobile":\s*"node scripts\/check-mobile-width\.mjs"/);
});

test("the rule is written down where every contributor and agent reads it", () => {
  const rules = read("CLAUDE.md");
  assert.match(rules, /Mobile-width law/);
  assert.match(rules, /npm run check:mobile/);
});
