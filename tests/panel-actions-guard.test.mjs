// "No holes": a server action is a public POST endpoint that anyone can call by name, so EVERY action of an operator
// panel must check the panel's own session before it does anything else. This pins that for all of them at once, so a
// new action cannot be added without a guard, and the Health and Beauty panels cannot be mixed up.
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
    if (e.isDirectory()) { if (e.name !== "node_modules" && e.name !== ".next") walk(rel, out); }
    else if (/\.(js|jsx|mjs)$/.test(e.name)) out.push(rel);
  }
  return out;
}
// A file is a server-action file when its FIRST statement is the directive.
const isActionFile = (src) => /^(?:\s*\/\/[^\n]*\n|\s*\/\*[\s\S]*?\*\/)*\s*["']use server["']/.test(src);   // a line comment is consumed whole
const actionFiles = ["app", "lib", "components"].flatMap((d) => walk(d)).filter((f) => isActionFile(read(f)));

// Public by design: the visitor forms and the chat. Each has its own abuse protection, pinned elsewhere.
const PUBLIC = new Set(["lib/actions/captcha.js", "lib/actions/chatPass.js", "lib/actions/quote.js", "lib/beauty/actions/quote.js", "lib/panel/actions.js"]);   // lib/panel/actions.js only stores the interface language
const operatorFiles = actionFiles.filter((f) => !PUBLIC.has(f));

// The session checks an operator action may open with. `authed()` and the Guarded helpers call the panel's getSession.
const GUARD = /await authed\(|await authedManager\(\)|await ctxFor\(\)|await getSession\(\)|await buildActionCtx\(\{ panel: "(health|beauty)", getSession,|Guarded\(\{/;

function exportedActions(src) {
  const out = [];
  for (const m of src.matchAll(/export\s+(async\s+)?function\s+(\w+)\s*\(([^)]*)\)\s*\{/g)) {
    const body = src.slice(m.index + m[0].length);
    const end = body.indexOf("\n}\n");
    out.push({ name: m[2], isAsync: Boolean(m[1]), head: body.slice(0, Math.min(end < 0 ? body.length : end, 700)) });
  }
  return out;
}

test("the operator server-action files are the ones we expect (a new file must be added to this review)", () => {
  assert.deepEqual(operatorFiles.sort(), [
    "lib/beauty/operator/accountActions.js", "lib/beauty/operator/actions.js", "lib/beauty/operator/approvalActions.js", "lib/beauty/operator/auditActions.js", "lib/beauty/operator/contentActions.js", "lib/beauty/operator/documentActions.js", "lib/beauty/operator/importActions.js", "lib/beauty/operator/panelSearchActions.js", "lib/beauty/operator/preferenceActions.js", "lib/beauty/operator/previewActions.js", "lib/beauty/operator/publishRuleActions.js", "lib/beauty/operator/savedViewActions.js", "lib/beauty/operator/securityActions.js", "lib/beauty/operator/userActions.js", "lib/beauty/operator/warehouseActions.js",
    "lib/operator/accountActions.js", "lib/operator/actions.js", "lib/operator/approvalActions.js", "lib/operator/auditActions.js", "lib/operator/categoryTreeActions.js", "lib/operator/contentActions.js", "lib/operator/documentActions.js", "lib/operator/importActions.js", "lib/operator/panelSearchActions.js", "lib/operator/preferenceActions.js", "lib/operator/previewActions.js", "lib/operator/publishRuleActions.js", "lib/operator/savedViewActions.js", "lib/operator/securityActions.js", "lib/operator/userActions.js", "lib/operator/warehouseActions.js",
  ]);
});

test("every operator server action is async and opens with a session check", () => {
  let count = 0;
  for (const f of operatorFiles) {
    for (const a of exportedActions(read(f))) {
      count++;
      assert.ok(a.isAsync, `${f}:${a.name} must be async (Next.js server actions)`);
      // the guard must come before any database / admin use
      const guardAt = a.head.search(GUARD);
      const dbAt = a.head.search(/getAdminClient\(\)|admin\.from\(|a\.admin|\.from\(/);
      assert.ok(guardAt >= 0, `${f}:${a.name} does not check the session first`);
      assert.ok(dbAt < 0 || guardAt < dbAt, `${f}:${a.name} touches the database before checking the session`);
    }
  }
  assert.ok(count >= 55, `only ${count} actions found: the scanner is broken`);
});

test("each panel's actions use ITS OWN session: Health files never import the Beauty session and the reverse", () => {
  for (const f of operatorFiles) {
    const src = read(f);
    const beauty = f.includes("/beauty/");
    const importsBeautyAuth = /from "@\/lib\/beauty\/operator\/auth"/.test(src);
    const importsHealthAuth = /from "@\/lib\/operator\/auth"/.test(src);
    if (beauty) assert.ok(!importsHealthAuth, `${f}: the Beauty panel must not use the Health session`);
    else assert.ok(!importsBeautyAuth, `${f}: the Health panel must not use the Beauty session`);
    assert.ok(importsBeautyAuth || importsHealthAuth, `${f}: no session import found`);
  }
});

test("the Beauty panel only touches beauty_* tables and the Health panel never a beauty_* table", () => {
  for (const f of operatorFiles) {
    const src = read(f);
    const tables = [...src.matchAll(/\.from\(\s*["']([a-z_]+)["']/g)].map((m) => m[1]);
    const shared = new Set(["operator_audit_log", "operator_sessions"]);
    for (const t of tables) {
      if (shared.has(t)) continue;
      if (f.includes("/beauty/")) assert.ok(t.startsWith("beauty_"), `${f} touches ${t}`);
      else assert.ok(!t.startsWith("beauty_"), `${f} touches ${t}`);
    }
  }
});

test("every product action validates the id before using it, in both panels", () => {
  for (const f of ["lib/operator/actions.js", "lib/beauty/operator/actions.js"]) {
    const src = read(f);
    for (const name of ["updateProduct", "setProductActive", "duplicateProduct", "quickUpdateProduct"]) {
      const m = src.match(new RegExp(`export async function ${name}\\(([^)]*)\\) \\{([\\s\\S]*?)\\n\\}\\n`));
      assert.ok(m, `${f}:${name} not found`);
      assert.match(m[2], /id = parseProductId\(id\);\s*\n\s*if \(id === null\)/, `${f}:${name} must validate the id`);
    }
    const bulk = src.match(/export async function bulkUpdateProducts\(([^)]*)\) \{([\s\S]*?)\n\}\n/);
    assert.match(bulk[2], /parseProductIds\(ids\)/, `${f}: bulk actions must validate and cap the id list`);
  }
});

test("the panel pages are behind the layout's session gate, and the login routes are the only open panel URLs", () => {
  for (const [layout, redirect] of [["app/operator/(panel)/layout.jsx", "/login/health"], ["app/beauty/operator/(panel)/layout.jsx", "/login/beauty"]]) {
    const src = read(layout);
    assert.match(src, /const session = await getSession\(\);\s*\n\s*if \(!session\) redirect\(/, `${layout} must gate on the session`);
    assert.ok(src.includes(redirect), `${layout} must send visitors to ${redirect}`);
  }
});
