// Pins the screens' use of the capabilities provider: every operation a component asks about exists in the catalogue (a typo would
// silently hide a button forever), both layouts provide it, and the shared pieces exist.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { isValidOperation } from "../lib/operator/authz.js";

const ROOT = path.resolve(import.meta.dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
function walk(dir, out = []) {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) walk(rel, out); else if (/\.jsx?$/.test(e.name)) out.push(rel);
  }
  return out;
}

test("every operation named in useCan / useMode / useCanAll is a real operation", () => {
  const files = [...walk("components"), ...walk("app")];
  let seen = 0;
  for (const f of files) {
    const src = read(f);
    for (const m of src.matchAll(/use(?:Can|Mode)\(\s*"([^"]+)"/g)) { seen++; assert.ok(isValidOperation(m[1]), `${f}: unknown operation ${m[1]}`); }
    for (const m of src.matchAll(/useCanAll\(\s*\[([^\]]*)\]/g)) for (const o of m[1].matchAll(/"([^"]+)"/g)) { seen++; assert.ok(isValidOperation(o[1]), `${f}: unknown operation ${o[1]}`); }
  }
  assert.ok(seen >= 25, `the screens should be gated (found ${seen} checks)`);
});

test("both panel layouts hand the person's capabilities to the screens", () => {
  for (const f of ["app/operator/(panel)/layout.jsx", "app/beauty/operator/(panel)/layout.jsx"]) {
    const src = read(f);
    assert.match(src, /<CapabilitiesProvider value=\{capabilitiesOf\(session, "(health|beauty)"\)\}>/, f);
  }
});

test("without a provider nothing is hidden (the server still refuses); with one, unknown operations are denied", () => {
  const src = read("components/panel/Capabilities.jsx");
  assert.match(src, /if \(!caps\) return "direct"/);
  assert.match(src, /caps\[operation\] \|\| "denied"/);
});
