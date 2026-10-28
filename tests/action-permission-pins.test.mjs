// Static pins for the INTERNAL action cores added after the first permission pins (tests/panel-permissions.test.mjs): the warehouse (movements, counts,
// levels, exports) and the site content. Every exported function that takes the action context must ask for a permission (`ctx.require` / `ctx.evaluate`)
// BEFORE it reads or writes anything; a new function cannot be added without naming what it needs. The behaviour is proved in the unit tests of each core.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { OPERATIONS } from "../lib/operator/authz.js";

const root = path.join(import.meta.dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const CORES = ["lib/warehouse/actionsCore.js", "lib/warehouse/countsActions.js", "lib/content/actionsCore.js"];
// helpers that are not actions: they are only called by an action that has already decided (or are executors / pure builders)
const NOT_ACTIONS = new Set(["makeWarehouseExecutors", "makeCountExecutors", "applyCount", "listContent"]);

function functions(src) {
  const out = [];
  for (const m of src.matchAll(/export\s+async\s+function\s+(\w+)\s*\(([^)]*)\)\s*\{/g)) {
    const rest = src.slice(m.index + m[0].length);
    const end = rest.indexOf("\n}\n");
    out.push({ name: m[1], params: m[2], body: end < 0 ? rest : rest.slice(0, end) });
  }
  return out;
}

test("every action of the internal cores asks for a permission before it touches data", () => {
  let checked = 0;
  for (const f of CORES) {
    for (const fn of functions(read(f))) {
      if (NOT_ACTIONS.has(fn.name) || !/^\s*ctx\b/.test(fn.params)) continue;
      checked++;
      const ask = fn.body.search(/ctx\.(require|evaluate)\(|exportGate\(ctx\)/);
      assert.ok(ask >= 0, `${f}:${fn.name} never asks for a permission`);
      const touch = fn.body.search(/ctx\.admin|counts\.|store\.|productExists\(|resolveProduct\(|listLocations|getCount|cleanCounted\(/);
      assert.ok(touch < 0 || ask < touch, `${f}:${fn.name} reads or writes before it asks`);
    }
  }
  assert.ok(checked >= 18, `the scan really covered the actions (${checked})`);
});

test("every operation these cores name is a real operation of the catalogue", () => {
  const named = new Set();
  for (const f of CORES) for (const m of read(f).matchAll(/(?<!log\(ctx, )(?<!action: )"((?:inventory|content)\.[a-z_]+)"/g)) named.add(m[1]);
  for (const op of ["inventory.adjust", "inventory.reserve", "inventory.locations", "inventory.count_start", "inventory.count_close", "inventory.level", "inventory.export", "content.create", "content.edit", "content.publish", "content.schedule", "content.delete"]) assert.ok(named.has(op), `${op} is not asked for by any core`);
  for (const op of named) assert.ok(op in OPERATIONS, `${op} is not in the permission catalogue`);
});

test("the exports of the new areas each need their own export operation, and are written to the activity log", () => {
  const counts = read("lib/warehouse/countsActions.js");
  assert.match(counts, /const exportGate = \(ctx\) => ctx\.require\("inventory\.export"\)/);
  for (const name of ["exportStockCsv", "exportMovementsCsv", "exportCountCsv"]) {
    const body = functions(counts).find((f) => f.name === name)?.body || "";
    assert.match(body, /exportGate\(ctx\)/, `${name} must pass the export gate first`);
    assert.match(body, /log\(ctx, "stock\.export"/, `${name} must log the export`);
  }
});
