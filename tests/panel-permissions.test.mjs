// Permissions (S2e): a session is not enough, the person must be ALLOWED the operation — on every server action, page and reader.
// Static pins over the source, so a new action / page cannot be added without naming what it needs (the behaviour itself is proved
// in access.test.mjs and tests/e2e/accounts.e2e.mjs).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { OPERATIONS } from "../lib/operator/authz.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
function walk(dir, out = []) {
  for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) walk(rel, out); else out.push(rel);
  }
  return out;
}

const ACTION_FILES = [
  "lib/operator/actions.js", "lib/operator/categoryTreeActions.js", "lib/operator/importActions.js", "lib/operator/securityActions.js",
  "lib/beauty/operator/actions.js", "lib/beauty/operator/importActions.js", "lib/beauty/operator/securityActions.js",
  "lib/operator/userActions.js", "lib/beauty/operator/userActions.js",
  "lib/operator/accountActions.js", "lib/beauty/operator/accountActions.js",
  "lib/operator/approvalActions.js", "lib/beauty/operator/approvalActions.js",
];
// Actions that only touch the caller's own session need no operation of the catalog.
const SELF_SERVICE = new Set(["revokeOtherSessions", "revokeAllSessions"]);

function exportedActions(src) {
  const out = [];
  for (const m of src.matchAll(/export\s+async\s+function\s+(\w+)\s*\(([^)]*)\)\s*\{/g)) {
    const body = src.slice(m.index + m[0].length);
    const end = body.indexOf("\n}\n");
    out.push({ name: m[1], head: body.slice(0, Math.min(end < 0 ? body.length : end, 900)) });
  }
  return out;
}

test("every operator server action asks for a permission right after the session check, before touching the database", () => {
  let checked = 0;
  for (const f of ACTION_FILES) {
    for (const a of exportedActions(read(f))) {
      if (SELF_SERVICE.has(a.name)) continue;
      if (/(accountActions|approvalActions)\.js$/.test(f)) {
        // "my password / my two-step login" and the approval queue: a personal session is the first thing asked; the shared core then
        // asks the finer rules (reviewer allowed for that kind of change, not the requester, …)
        assert.ok(/const a = await ctxFor\(\);\s*\n\s*return a\.ok \? core\./.test(a.head), `${f}:${a.name} must go through ctxFor() (session) and the shared core`);
        continue;
      }
      checked++;
      const permAt = a.head.search(/await authed\((?!\))|await authedManager\(\)|await gate\(session, "(health|beauty)", /);
      assert.ok(permAt >= 0, `${f}:${a.name} has a session check but no permission check`);
      const dbAt = a.head.search(/admin\.from\(|a\.admin|\.from\(|getAdminClient\(\)\.from/);
      assert.ok(dbAt < 0 || permAt < dbAt, `${f}:${a.name} touches the database before checking the permission`);
    }
  }
  assert.ok(checked >= 55, `only ${checked} actions checked: the scanner is broken`);
});

test("every operation named in an action file exists in the catalog, for the right house", () => {
  for (const f of ACTION_FILES) {
    const beauty = f.includes("/beauty/");
    for (const line of read(f).split("\n")) {
      if (!/authed\(|\.require\(|gate\(|ops\.push\(|extra\.push\(|flagOps/.test(line)) continue;
      for (const m of line.matchAll(/"((?:products|categories|brands|media|quotes|inventory|content|documents)\.[a-z_]+)"/g)) {
        assert.ok(m[1] in OPERATIONS, `${f}: "${m[1]}" is not an operation of lib/operator/authz.js`);
        if (!beauty) assert.ok(!m[1].startsWith("brands."), `${f}: Health has no brands`);
      }
      const panel = line.match(/gate\(session, "(health|beauty)"/);
      if (panel) assert.equal(panel[1], beauty ? "beauty" : "health", `${f}: gate() for the wrong house`);
    }
  }
});

test("every panel page names the permission it needs; readers too", () => {
  const OPEN = /\/(settings|no-access)\/page\.jsx$|\(panel\)\/page\.jsx$/;     // settings = the person's own; the dashboard filters its own blocks
  let pages = 0;
  for (const base of ["app/operator/(panel)", "app/beauty/operator/(panel)"]) {
    for (const p of walk(base)) {
      if (!/page\.jsx$/.test(p) || OPEN.test(p)) continue;
      pages++;
      assert.match(read(p), /await require(Health|Beauty)Session\(("|\[)/, `${p} must name the permission it needs`);
    }
  }
  assert.ok(pages >= 14, `only ${pages} pages found`);
  for (const f of ["lib/operator/data.js", "lib/beauty/operator/data.js", "lib/operator/categoryTreeData.js", "lib/operator/importEngine.js", "lib/beauty/operator/importEngine.js"]) {
    for (const m of read(f).matchAll(/export async function (\w+)\([^)]*\) \{\n  (?:const session = )?await require(Health|Beauty)Session\(([^)]*)\)/g)) {
      if (!/Dashboard/.test(m[1])) assert.ok(m[3].trim(), `${f}:${m[1]} reads data without naming a permission`);
    }
  }
});

test("the dashboard reads only what the person may see", () => {
  for (const f of ["lib/operator/data.js", "lib/beauty/operator/data.js"]) {
    const src = read(f);
    assert.match(src, /access\.products \? admin\.from\(/, `${f}: products must not be read without products.view`);
    assert.match(src, /access\.quotes \? admin\.from\(/, `${f}: requests must not be read without quotes.view`);
  }
});

test("the menu and the 'no access' page exist for both panels, and an unknown operation is never granted", async () => {
  for (const p of ["app/operator/(panel)/no-access/page.jsx", "app/beauty/operator/(panel)/no-access/page.jsx"]) assert.ok(fs.existsSync(path.join(root, p)), p);
  assert.match(read("app/operator/(panel)/layout.jsx"), /allowed=\{allowed\}/);
  assert.match(read("app/beauty/operator/(panel)/layout.jsx"), /allowed=\{allowed\}/);
  const { requireOperation } = await import("../lib/operator/access.js");
  const refused = await requireOperation({ session: { user: { id: "x", status: "active", role: "owner", houses: ["health", "beauty"], allow: [], deny: [], approval: {} } }, panel: "health", operation: "products.nonsense" });
  assert.equal(refused.denied, true);
});
