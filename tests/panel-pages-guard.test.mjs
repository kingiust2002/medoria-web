// Panel pages and the service-role data readers check the session THEMSELVES (lib/operator/panelGuard.js), because the
// layout's redirect is not a security boundary (see the header of panelGuard.js and tests/e2e/panel-session-gate.e2e.mjs).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
function walk(dir, out = []) {
  for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) walk(rel, out); else out.push(rel);
  }
  return out;
}

const PANELS = [
  { dir: "app/operator/(panel)", guard: "requireHealthSession", readers: ["lib/operator/data.js", "lib/operator/categoryTreeData.js"], logs: "lib/operator/importEngine.js" },
  { dir: "app/beauty/operator/(panel)", guard: "requireBeautySession", readers: ["lib/beauty/operator/data.js"], logs: "lib/beauty/operator/importEngine.js" },
];

test("every panel page awaits the session guard before anything else", () => {
  let pages = 0;
  for (const p of PANELS) {
    for (const f of walk(p.dir).filter((x) => x.endsWith("page.jsx"))) {
      pages++;
      const src = read(f);
      const m = src.match(/export default async function \w+\([^)]*\)\s*\{\n([\s\S]*)/);
      assert.ok(m, `${f}: the page must be an async function`);
      assert.ok(m[1].trimStart().startsWith(`await ${p.guard}();`), `${f} must start with await ${p.guard}()`);
      assert.match(src, new RegExp(`import \\{ ${p.guard} \\} from "@/lib/operator/panelGuard"`));
    }
  }
  assert.ok(pages >= 20, `only ${pages} pages found`);
});

test("every exported service-role reader checks the session before it asks for the database client", () => {
  for (const p of PANELS) {
    for (const f of [...p.readers, p.logs]) {
      const src = read(f);
      const fns = [...src.matchAll(/export async function (\w+)\([^)]*\)\s*\{\n([\s\S]*?)(?=\nexport |\n\}\n)/g)].filter((m) => !(f === p.logs && m[1] !== "getImportLogs"));
      assert.ok(fns.length > 0, `${f}: no readers found`);
      for (const m of fns) {
        const body = m[2];
        const guardAt = body.indexOf(`await ${p.guard}();`);
        assert.ok(guardAt >= 0, `${f}:${m[1]} does not check the session`);
        const dbAt = body.search(/getAdminClient\(\)|\.from\(/);
        assert.ok(dbAt < 0 || guardAt < dbAt, `${f}:${m[1]} reaches the database before checking the session`);
      }
    }
  }
});

test("a new page or reader cannot slip in: every file under the panel directories is accounted for", () => {
  for (const p of PANELS) {
    const guarded = walk(p.dir).filter((x) => x.endsWith("page.jsx")).every((f) => read(f).includes(`await ${p.guard}();`));
    assert.ok(guarded);
    // route handlers inside a panel directory would bypass the page guard: there must be none
    assert.deepEqual(walk(p.dir).filter((x) => /route\.(js|ts)$/.test(x)), [], `${p.dir} must not contain route handlers`);
  }
});
