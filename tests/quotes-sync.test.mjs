// The Quotes screen keeps a local copy of the list (for instant, optimistic edits). When the server sends fresh
// rows (after router.refresh(), another session added/changed/removed a request) the copy must follow, without
// undoing an edit that is still on its way to the server.
// Reproduced 2026-10-26: `useState(initial)` never looked at new props, so a request that arrived while the
// screen was open stayed invisible until a full reload.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { reconcileQuotes, pruneSelection } from "../lib/operator/quotesSync.js";

const q = (id, extra = {}) => ({ id, status: "new", name: `R${id}`, internal_notes: "", ...extra });

test("new rows from the server appear, in the server's order", () => {
  const out = reconcileQuotes([q(2), q(1)], [q(3), q(2), q(1)], new Set());
  assert.deepEqual(out.map((r) => r.id), [3, 2, 1]);
});

test("changes made elsewhere are taken from the server; removals elsewhere disappear", () => {
  const out = reconcileQuotes([q(1), q(2), q(3)], [q(1, { status: "spam" }), q(3, { internal_notes: "called" })], new Set());
  assert.deepEqual(out.map((r) => [r.id, r.status, r.internal_notes]), [[1, "spam", ""], [3, "new", "called"]]);
});

test("a row with an edit still in flight keeps its local version (the server has not seen it yet)", () => {
  const local = [q(1, { status: "archived" }), q(2)];
  const out = reconcileQuotes(local, [q(1, { status: "new" }), q(2, { status: "contacted" }), q(3)], new Set([1]));
  assert.deepEqual(out.map((r) => [r.id, r.status]), [[1, "archived"], [2, "contacted"], [3, "new"]]);
});

test("an in-flight row that someone else deleted stays until its own request ends, then the next refresh drops it", () => {
  const first = reconcileQuotes([q(1, { status: "spam" })], [], new Set([1]));
  assert.deepEqual(first.map((r) => r.id), [1]);
  assert.deepEqual(reconcileQuotes(first, [], new Set()), []);
});

test("nothing changes → the same array comes back (no needless re-render loop)", () => {
  const local = [q(1), q(2)];
  assert.equal(reconcileQuotes(local, [q(1), q(2)], new Set()), local);
});

test("bad input never throws", () => {
  assert.deepEqual(reconcileQuotes(undefined, undefined, undefined), []);
  assert.deepEqual(reconcileQuotes([q(1)], null, new Set()), []);
  assert.deepEqual(reconcileQuotes(null, [q(1)], null).map((r) => r.id), [1]);
});

test("pruneSelection keeps only ids that still exist, and returns the same Set when nothing is lost", () => {
  const sel = new Set([1, 2]);
  assert.equal(pruneSelection(sel, [q(1), q(2), q(3)]), sel);
  assert.deepEqual([...pruneSelection(sel, [q(2)])], [2]);
});

test("the Quotes screen uses it: fresh props, focus refresh, unsaved note kept, edits in flight protected", () => {
  const s = fs.readFileSync(new URL("../components/operator/QuotesPanel.jsx", import.meta.url), "utf8");
  assert.match(s, /reconcileQuotes\(/);
  assert.match(s, /useEffect\(\(\) => \{[^}]*setQuotes\(\(cur\) => reconcileQuotes\(cur, initial, inflight\.current\)\)/s);
  assert.match(s, /window\.addEventListener\("focus"/, "a returning tab asks the server again");
  assert.match(s, /dirty/, "the notes box must not overwrite text the user is typing");
});
