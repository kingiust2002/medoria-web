// Deleting a customer request from the operator panels:
//   * nothing is deleted without a valid session, and the database is not even
//     reached for an anonymous caller or a malformed id
//   * each panel can only delete from its own table, and the two panels'
//     sessions cannot open each other
//   * both panels show the delete button + confirmation, wired to their own action
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deleteQuoteGuarded, parseQuoteId, QUOTE_DELETE_MESSAGES as M } from "../lib/operator/quoteDelete.js";
import * as healthSession from "../lib/operator/session.js";
import * as beautySession from "../lib/beauty/operator/session.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");

// A fake service-role client that records every call.
function fakeAdmin({ rows = [{ id: 7 }], error = null } = {}) {
  const calls = [];
  const admin = {
    from(table) {
      const call = { table, op: null, eq: null, select: null };
      calls.push(call);
      const chain = {
        delete() { call.op = "delete"; return chain; },
        eq(col, val) { call.eq = [col, val]; return chain; },
        select(cols) { call.select = cols; return Promise.resolve({ data: error ? null : rows, error }); },
      };
      return chain;
    },
  };
  return { admin, calls };
}

function run({ session = { role: "admin" }, admin, table = "quote_requests", id = 7 }) {
  let adminRequested = 0;
  const p = deleteQuoteGuarded({
    getSession: async () => session,
    getAdminClient: () => { adminRequested++; return admin ?? null; },
    table,
    id,
  });
  return p.then((res) => ({ res, adminRequested }));
}

test("parseQuoteId accepts only positive integer ids", () => {
  assert.equal(parseQuoteId(12), 12);
  assert.equal(parseQuoteId("12"), 12);
  for (const bad of [0, -1, 1.5, "0", "012", "1 or 1=1", "1;drop table x", "", " 5", "5 ", null, undefined, NaN, Infinity, [], [1], {}, true, "9".repeat(20), Number.MAX_SAFE_INTEGER + 2]) {
    assert.equal(parseQuoteId(bad), null, `should reject ${JSON.stringify(bad)}`);
  }
});

test("no session: nothing is deleted and the database client is never even requested", async () => {
  const { admin, calls } = fakeAdmin();
  const { res, adminRequested } = await run({ session: null, admin });
  assert.deepEqual(res, { ok: false, error: M.noSession });
  assert.equal(adminRequested, 0);
  assert.equal(calls.length, 0);
});

test("a missing service-role key is reported and nothing runs", async () => {
  const { res } = await run({ admin: null });
  assert.deepEqual(res, { ok: false, error: M.noKey });
});

test("a malformed id never reaches the database", async () => {
  for (const id of ["1 or 1=1", -3, null, {}, "", "abc"]) {
    const { admin, calls } = fakeAdmin();
    const { res } = await run({ admin, id });
    assert.equal(res.ok, false);
    assert.equal(res.error, M.badId);
    assert.equal(calls.length, 0, `db touched for ${JSON.stringify(id)}`);
  }
});

test("a valid session deletes exactly one row by id from the given table", async () => {
  for (const table of ["quote_requests", "beauty_quote_requests"]) {
    const { admin, calls } = fakeAdmin();
    const { res } = await run({ admin, table, id: "7" });
    assert.deepEqual(res, { ok: true });
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], { table, op: "delete", eq: ["id", 7], select: "id" });
  }
});

test("a database error is reported as a clear failure without leaking details", async () => {
  const { admin } = fakeAdmin({ error: { code: "XX000", message: "secret connection detail" } });
  const { res } = await run({ admin });
  assert.deepEqual(res, { ok: false, error: M.failed });
  assert.ok(!JSON.stringify(res).includes("secret"));
});

test("a row that is already gone is reported as not found (so the list can drop it)", async () => {
  const { admin } = fakeAdmin({ rows: [] });
  const { res } = await run({ admin });
  assert.equal(res.ok, false);
  assert.equal(res.notFound, true);
  assert.equal(res.error, M.notFound);
});

test("the Health and Beauty operator sessions cannot open each other", async () => {
  const saved = { h: process.env.OPERATOR_SESSION_SECRET, b: process.env.BEAUTY_OPERATOR_SESSION_SECRET };
  process.env.OPERATOR_SESSION_SECRET = "health-secret-0123456789abcdef";
  process.env.BEAUTY_OPERATOR_SESSION_SECRET = "beauty-secret-0123456789abcdef";
  try {
    const h = await healthSession.signSession({ role: "admin", ver: "x" });
    const b = await beautySession.signSession({ role: "beauty-admin", ver: "x" });
    assert.equal((await healthSession.verifySession(h)).role, "admin");
    assert.equal((await beautySession.verifySession(b)).role, "beauty-admin");
    assert.equal(await beautySession.verifySession(h), null, "Health token accepted by the Beauty panel");
    assert.equal(await healthSession.verifySession(b), null, "Beauty token accepted by the Health panel");
    // different cookies as well
    assert.notEqual(healthSession.OP_COOKIE, beautySession.BOP_COOKIE);
    // a tampered token is rejected
    assert.equal(await healthSession.verifySession(h.slice(0, -2) + "xx"), null);
  } finally {
    for (const [k, v] of [["OPERATOR_SESSION_SECRET", saved.h], ["BEAUTY_OPERATOR_SESSION_SECRET", saved.b]]) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  }
});

test("each panel's getSession demands its own role", () => {
  assert.match(read("lib/operator/auth.js"), /payload\.role !== "admin"/);
  assert.match(read("lib/beauty/operator/auth.js"), /payload\.role !== "beauty-admin"/);
});

test("each panel's deleteQuote is bound to its own session check and its own table", () => {
  const health = read("lib/operator/actions.js");
  const beauty = read("lib/beauty/operator/actions.js");

  assert.match(health, /import \{ getSession \} from "@\/lib\/operator\/auth"/);
  assert.match(beauty, /import \{ getSession \} from "@\/lib\/beauty\/operator\/auth"/);

  const h = health.match(/export async function deleteQuote\(id\) \{([\s\S]*?)\n\}/)?.[1];
  const b = beauty.match(/export async function deleteQuote\(id\) \{([\s\S]*?)\n\}/)?.[1];
  assert.ok(h && b, "deleteQuote is missing in one of the panels");
  assert.match(h, /getSession,\s*getAdminClient,\s*table: "quote_requests"/);
  assert.match(b, /getSession,\s*getAdminClient,\s*table: "beauty_quote_requests"/);
  assert.ok(!h.includes("beauty"), "Health deleteQuote must not mention Beauty");
  assert.ok(!/table: "quote_requests"/.test(b), "Beauty deleteQuote must not touch the Health table");

  // the file is a Server Actions module: exports must stay async functions
  assert.match(health, /^"use server";/);
  assert.match(beauty, /^"use server";/);
});

test("customer requests are deleted only through the shared guarded helper", () => {
  const offenders = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(rel);
      else if (/\.(js|jsx|mjs)$/.test(e.name)) {
        const s = read(rel);
        const direct = /\.from\(\s*["'`](beauty_)?quote_requests["'`]\s*\)\s*\.delete\(/.test(s);
        const viaHelper = /deleteQuoteGuarded/.test(s);
        if (direct) offenders.push(rel);
        if (viaHelper && !["lib/operator/quoteDelete.js", "lib/operator/actions.js", "lib/beauty/operator/actions.js"].includes(rel)) offenders.push(rel);
      }
    }
  };
  for (const d of ["app", "lib", "components"]) walk(d);
  assert.deepEqual(offenders, []);
  // the helper itself checks the session before touching the database
  const helper = read("lib/operator/quoteDelete.js");
  assert.ok(helper.indexOf("await getSession()") < helper.indexOf("getAdminClient()"));
  assert.ok(helper.indexOf("getAdminClient()") < helper.indexOf(".delete()"));
});

test("both panels show a delete button per request and confirm with the request's details", () => {
  // Each house's QuotesManager is a thin wrapper that passes ITS OWN actions to the shared screen.
  for (const [file, actions] of [
    ["components/operator/QuotesManager.jsx", "@/lib/operator/actions"],
    ["components/beauty/operator/QuotesManager.jsx", "@/lib/beauty/operator/actions"],
  ]) {
    const s = read(file);
    assert.match(s, new RegExp(`import \\{[^}]*\\bdeleteQuote\\b[^}]*\\} from "${actions.replace(/\//g, "\\/")}"`), `${file}: wrong deleteQuote import`);
    assert.match(s, /<QuotesPanel quotes=\{quotes\} actions=\{actions\}/, `${file}: does not render the shared screen`);
  }
  const panel = read("components/operator/QuotesPanel.jsx");
  assert.match(panel, /onClick=\{\(\) => setDeleting\(x\)\}[^>]*title=\{t\("حذف درخواست"\)\}/, "no per-row delete button");
  assert.match(panel, /<DeleteQuoteModal[\s\S]*?onDelete=\{actions\.deleteQuote\}/, "modal not wired to deleteQuote");
  assert.match(panel, /router\.refresh\(\)/, "list is not refreshed after deleting");
  // the row toggle is a <button>, so the delete button must follow its closing tag, never nest inside it
  assert.match(panel, /setOpenId\(open \? null : x\.id\)\}[\s\S]*?<\/button>\s*<button type="button" onClick=\{\(\) => setDeleting\(x\)\}/, "delete button is nested in the row toggle");
  assert.ok(!/lib\/(beauty\/)?operator\/actions/.test(panel), "the shared screen must not import a panel's actions");

  const modal = read("components/operator/DeleteQuoteModal.jsx");
  for (const field of ["quote.name", "quote.organization", "quote.phone", "quote.product_name", "quote.created_at"]) {
    assert.ok(modal.includes(field), `confirmation does not show ${field}`);
  }
  assert.match(modal, /role="alert"/, "errors are not announced");
  assert.ok(!/lib\/(beauty\/)?operator\/actions/.test(modal), "the shared modal must not import a panel's actions");
});
