// Archive / spam / tick-selection / bulk actions of the operator Quotes screens:
//   * bulk calls need a valid session and never reach the database otherwise
//   * a bad id, a bad status or an oversized list rejects the WHOLE call
//   * each panel's bulk actions are bound to its own table only
//   * the "archived" status exists in the constants, the actions and migration 29
//   * the shared screen offers tabs, select-all, bulk archive/spam/restore/delete
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseQuoteIds, deleteQuotesGuarded, setQuotesStatusGuarded, MAX_BULK_QUOTES, QUOTE_DELETE_MESSAGES as M,
} from "../lib/operator/quoteDelete.js";
import { QUOTE_STATUSES, QUOTE_ACTIVE_STATUSES, QUOTE_STATUS_FA, QUOTE_STATUS_TONE } from "../lib/operator/constants.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");

// A fake service-role client recording every call.
function fakeAdmin({ rows = null, error = null } = {}) {
  const calls = [];
  const admin = {
    from(table) {
      const call = { table, op: null, values: null, in: null, select: null };
      calls.push(call);
      const result = () => ({ data: error ? null : (rows ?? (call.in || []).map((id) => ({ id }))), error });
      const chain = {
        delete() { call.op = "delete"; return chain; },
        update(v) { call.op = "update"; call.values = v; return chain; },
        in(col, ids) { call.in = ids; call.inCol = col; return chain; },
        select(cols) { call.select = cols; return Promise.resolve(result()); },
      };
      return chain;
    },
  };
  return { admin, calls };
}
const deps = (admin, session = { role: "admin" }) => {
  const seen = { adminRequested: 0 };
  const entries = []; seen.entries = entries;
  // every deletion needs its attempt on record (lib/operator/auditedDelete.js); a stub that accepts every entry
  return { seen, base: { getSession: async () => session, getAdminClient: () => { seen.adminRequested++; return admin ?? null; }, audit: async (e) => { entries.push(e); return { ok: true }; } } };
};

test("parseQuoteIds accepts 1..200 valid ids, collapses duplicates, rejects anything else", () => {
  assert.deepEqual(parseQuoteIds([3, "4", 3]), { ids: [3, 4] });
  assert.equal(parseQuoteIds([]).error, M.noneSelected);
  assert.equal(parseQuoteIds("1").error, M.badIds);
  assert.equal(parseQuoteIds(null).error, M.badIds);
  assert.equal(parseQuoteIds({ length: 1, 0: 1 }).error, M.badIds);
  for (const bad of [[1, "1 or 1=1"], [1, -2], [1, 0], [1, 2.5], [1, null], [[1]], [{}], ["", 1]]) {
    assert.equal(parseQuoteIds(bad).error, M.badIds, `should reject ${JSON.stringify(bad)}`);
  }
  assert.equal(parseQuoteIds(Array.from({ length: MAX_BULK_QUOTES }, (_, i) => i + 1)).ids.length, MAX_BULK_QUOTES);
  assert.equal(parseQuoteIds(Array.from({ length: MAX_BULK_QUOTES + 1 }, (_, i) => i + 1)).error, M.tooMany);
});

test("bulk delete without a session never requests the database client", async () => {
  const { admin, calls } = fakeAdmin();
  const { seen, base } = deps(admin, null);
  const res = await deleteQuotesGuarded({ ...base, table: "quote_requests", ids: [1, 2] });
  assert.deepEqual(res, { ok: false, error: M.noSession });
  assert.equal(seen.adminRequested, 0);
  assert.equal(calls.length, 0);
});

test("bulk status change without a session never requests the database client", async () => {
  const { admin, calls } = fakeAdmin();
  const { seen, base } = deps(admin, null);
  const res = await setQuotesStatusGuarded({ ...base, table: "quote_requests", ids: [1], status: "archived" });
  assert.deepEqual(res, { ok: false, error: M.noSession });
  assert.equal(seen.adminRequested, 0);
  assert.equal(calls.length, 0);
});

test("bad input rejects the whole call before the database", async () => {
  for (const ids of [[1, "x"], [], "5", null, Array.from({ length: 201 }, (_, i) => i + 1)]) {
    const { admin, calls } = fakeAdmin();
    const { base } = deps(admin);
    assert.equal((await deleteQuotesGuarded({ ...base, table: "quote_requests", ids })).ok, false);
    assert.equal((await setQuotesStatusGuarded({ ...base, table: "quote_requests", ids, status: "spam" })).ok, false);
    assert.equal(calls.length, 0, `db touched for ${JSON.stringify(ids)?.slice(0, 40)}`);
  }
  for (const status of ["bogus", "", null, undefined, 5, "Archived", "spam; drop table x", ["spam"]]) {
    const { admin, calls } = fakeAdmin();
    const { base } = deps(admin);
    const res = await setQuotesStatusGuarded({ ...base, table: "quote_requests", ids: [1], status });
    assert.deepEqual(res, { ok: false, error: M.badStatus }, `status ${JSON.stringify(status)} accepted`);
    assert.equal(calls.length, 0);
  }
});

test("bulk delete removes exactly the listed ids from the given table", async () => {
  for (const table of ["quote_requests", "beauty_quote_requests"]) {
    const { admin, calls } = fakeAdmin();
    const { base } = deps(admin);
    const res = await deleteQuotesGuarded({ ...base, table, ids: [5, "6", 5] });
    assert.equal(res.ok, true);
    assert.equal(res.count, 2);
    assert.equal(res.missing, 0);
    assert.deepEqual(res.deletedIds, [5, 6]);
    assert.deepEqual(calls, [{ table, op: "delete", values: null, in: [5, 6], inCol: "id", select: "id" }]);
  }
});

test("rows that are already gone are reported, not silently ignored", async () => {
  const partial = fakeAdmin({ rows: [{ id: 1 }] });
  const r1 = await deleteQuotesGuarded({ ...deps(partial.admin).base, table: "quote_requests", ids: [1, 2, 3] });
  assert.deepEqual([r1.ok, r1.count, r1.missing], [true, 1, 2]);
  const none = fakeAdmin({ rows: [] });
  const r2 = await deleteQuotesGuarded({ ...deps(none.admin).base, table: "quote_requests", ids: [1, 2] });
  assert.deepEqual([r2.ok, r2.notFound, r2.error], [false, true, M.notFound]);
});

test("archive, spam and restore are plain status updates on the listed ids only", async () => {
  for (const status of ["archived", "spam", "new"]) {
    const { admin, calls } = fakeAdmin();
    const res = await setQuotesStatusGuarded({ ...deps(admin).base, table: "beauty_quote_requests", ids: [7, 8], status });
    assert.equal(res.ok, true);
    assert.deepEqual(res.updatedIds, [7, 8]);
    assert.deepEqual(calls, [{ table: "beauty_quote_requests", op: "update", values: { status }, in: [7, 8], inCol: "id", select: "id" }]);
  }
});

test("errors are generic; a missing migration 29 gets its own clear message", async () => {
  const generic = fakeAdmin({ error: { code: "XX000", message: "secret connection detail" } });
  const r1 = await setQuotesStatusGuarded({ ...deps(generic.admin).base, table: "quote_requests", ids: [1], status: "spam" });
  assert.deepEqual(r1, { ok: false, error: M.statusFailed });
  const d = await deleteQuotesGuarded({ ...deps(generic.admin).base, table: "quote_requests", ids: [1] });
  assert.deepEqual(d, { ok: false, error: M.failed });
  assert.ok(!JSON.stringify([r1, d]).includes("secret"));
  const check = fakeAdmin({ error: { code: "23514", message: "violates check constraint" } });
  const r2 = await setQuotesStatusGuarded({ ...deps(check.admin).base, table: "quote_requests", ids: [1], status: "archived" });
  assert.deepEqual(r2, { ok: false, error: M.statusNotAllowed });
  assert.match(M.statusNotAllowed, /۲۹/);
});

test("the status list: archived and spam exist, every status has a label and a tone", () => {
  assert.ok(QUOTE_STATUSES.includes("archived") && QUOTE_STATUSES.includes("spam"));
  assert.deepEqual(QUOTE_ACTIVE_STATUSES, QUOTE_STATUSES.filter((s) => s !== "archived" && s !== "spam"));
  for (const s of QUOTE_STATUSES) {
    assert.ok(QUOTE_STATUS_FA[s], `no Persian label for ${s}`);
    assert.ok(QUOTE_STATUS_TONE[s], `no tone for ${s}`);
  }
  assert.match(read("lib/beauty/operator/constants.js"), /QUOTE_STATUSES[\s\S]*from "@\/lib\/operator\/constants"/, "Beauty must reuse the same status list");
});

test("both panels' actions share the one status list and bind bulk actions to their own table", () => {
  const health = read("lib/operator/actions.js");
  const beauty = read("lib/beauty/operator/actions.js");
  for (const [s, name] of [[health, "Health"], [beauty, "Beauty"]]) {
    assert.match(s, /import \{ QUOTE_STATUSES \} from "@\/lib\/operator\/constants"/, `${name}: keeps its own status list`);
    assert.ok(!/const QUOTE_STATUSES = \[/.test(s), `${name}: has a private status list that can drift`);
  }
  const grab = (s, fn) => s.match(new RegExp(`export async function ${fn}\\(([^)]*)\\) \\{([\\s\\S]*?)\\n\\}`))?.[2];
  const hd = grab(health, "deleteQuotes"), hs = grab(health, "updateQuotesStatus");
  const bd = grab(beauty, "deleteQuotes"), bs = grab(beauty, "updateQuotesStatus");
  assert.ok(hd && hs && bd && bs, "a bulk action is missing in one panel");
  assert.match(hd, /deleteQuotesGuarded\(\{ getSession, getAdminClient, table: "quote_requests", ids, audit: makeAudit\("health", getSession, getAdminClient\) \}\)/);
  assert.match(hs, /setQuotesStatusGuarded\(\{ getSession, getAdminClient, table: "quote_requests", ids, status, audit: makeAudit\("health", getSession, getAdminClient\) \}\)/);
  assert.match(bd, /deleteQuotesGuarded\(\{ getSession, getAdminClient, table: "beauty_quote_requests", ids, audit: makeAudit\("beauty", getSession, getAdminClient\) \}\)/);
  assert.match(bs, /setQuotesStatusGuarded\(\{ getSession, getAdminClient, table: "beauty_quote_requests", ids, status, audit: makeAudit\("beauty", getSession, getAdminClient\) \}\)/);
  for (const body of [hd, hs]) assert.ok(!body.includes("beauty"), "Health bulk action mentions Beauty");
  for (const body of [bd, bs]) assert.ok(!/table: "quote_requests"/.test(body), "Beauty bulk action touches the Health table");
});

test("migration 29 allows exactly the statuses the panel offers, in both tables", () => {
  const sql = read("migrations/29_quote_status_archived.sql");
  const code = sql.replace(/--.*$/gm, "");   // the rollback example in the comments lists the OLD statuses
  const list = code.match(/CHECK \(status IN \(([^)]*)\)\)/)?.[1];
  assert.ok(list, "no CHECK list in migration 29");
  const inSql = list.split(",").map((x) => x.trim().replace(/'/g, "")).sort();
  assert.deepEqual(inSql, [...QUOTE_STATUSES].sort(), "migration 29 and lib/operator/constants.js disagree");
  assert.match(sql, /'quote_requests', 'beauty_quote_requests'/);
  assert.match(sql, /^BEGIN;/m);
  assert.match(sql, /^COMMIT;/m);
  assert.ok(!/\b(DELETE FROM|UPDATE\s+\w+\s+SET|DROP TABLE|TRUNCATE)\b/i.test(code), "migration 29 must not touch rows");
  assert.match(read("migrations/README.md"), /\| 29 \| `29_quote_status_archived\.sql`/);
});

test("the shared Quotes screen offers tabs, select-all, tick selection and the four bulk actions", () => {
  const panel = read("components/operator/QuotesPanel.jsx");
  for (const label of ["فعال", "آرشیو", "اسپم", "همه"]) assert.ok(panel.includes(`label: tr("${label}")`), `tab ${label} missing`);
  assert.match(panel, /role="tablist"/);
  assert.match(panel, /انتخاب همه/);
  assert.match(panel, /type="checkbox"[^>]*onChange=\{\(\) => toggle\(x\.id\)\}/, "no per-row checkbox");
  assert.match(panel, /bulkStatus\("archived"\)/);
  assert.match(panel, /bulkStatus\("spam"\)/);
  assert.match(panel, /bulkStatus\("new"\)/);
  assert.match(panel, /actions\.updateQuotesStatus\(ids, val\)/);
  assert.match(panel, /onDelete=\{actions\.deleteQuotes\}/);
  // only rows that are on screen can be inside a bulk action
  assert.match(panel, /const selectedRows = useMemo\(\(\) => rows\.filter\(\(x\) => selected\.has\(x\.id\)\)/);
  // selection is cleared when the tab changes
  assert.match(panel, /function goTab\(id\) \{[^}]*setSelected\(new Set\(\)\)/);
  // phone width: the bulk bar and tabs wrap instead of overflowing
  assert.match(panel, /role="region" aria-label=\{t\("عملیات گروهی"\)\} className="[^"]*flex-wrap/);
  assert.match(panel, /role="tablist"[^>]*className="[^"]*flex-wrap/);
  // Beauty and Health use this one screen
  for (const f of ["components/operator/QuotesManager.jsx", "components/beauty/operator/QuotesManager.jsx"]) {
    const s = read(f);
    for (const a of ["updateQuoteStatus", "updateQuoteNotes", "deleteQuote", "updateQuotesStatus", "deleteQuotes"]) assert.ok(s.includes(a), `${f}: ${a} not passed`);
  }
});

test("the bulk delete dialog names what will be deleted and announces errors", () => {
  const modal = read("components/operator/BulkDeleteQuotesModal.jsx");
  assert.match(modal, /role="alert"/);
  assert.match(modal, /q\.name/);
  assert.match(modal, /onDelete\(quotes\.map\(\(q\) => q\.id\)\)/);
  assert.ok(!/lib\/(beauty\/)?operator\/actions/.test(modal), "the shared dialog must not import a panel's actions");
});
