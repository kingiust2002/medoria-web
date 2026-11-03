// Review R2: with `quotes.view` ON and `customers.view` OFF the customer file (the other requests of the same customer: phone numbers, tracking codes,
// products, dates) must neither be READ nor SENT to the browser — in both houses. A viewer holds quotes.view without customers.view; a quote manager holds both.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createMemoryAdmin } from "./helpers/memoryAdmin.mjs";
import { readQuotesPage } from "../lib/operator/listReaders.js";
import { parseQuoteParams } from "../lib/operator/listQuery.js";
import { phoneKey } from "../lib/operator/quoteOps.js";
import { can } from "../lib/operator/authz.js";

const NOW = Date.parse("2026-11-03T10:00:00Z");
const U = (o) => ({ id: "u", status: "active", houses: ["health", "beauty"], allow: [], deny: [], approval: {}, ...o });
const rows = (n) => Array.from({ length: n }, (_, i) => ({ id: i + 1, phone: "+992 900 11 22 33", phone_key: phoneKey("+992 900 11 22 33"), status: "new", tracking_code: `MH-${i}`, product_name: "Gloves", created_at: new Date(NOW - i * 1000).toISOString() }));

for (const [house, table] of [["health", "quote_requests"], ["beauty", "beauty_quote_requests"]]) {
  test(`${house}: quotes.view without customers.view reads and sends NO customer file; with customers.view the file is complete`, async () => {
    const viewer = U({ role: "viewer", allow: [`${house}.quotes.view`] }), manager = U({ role: "quote_manager" });
    assert.deepEqual([can(viewer, `${house}.quotes.view`), can(viewer, `${house}.customers.view`)], [true, false]);
    assert.deepEqual([can(manager, `${house}.quotes.view`), can(manager, `${house}.customers.view`)], [true, true]);
    const db = createMemoryAdmin({ [table]: rows(30) });
    const reads = [];
    const realFrom = db.from.bind(db);
    db.from = (t) => { reads.push(t); return realFrom(t); };
    const off = await readQuotesPage(db, house, parseQuoteParams({}), { now: NOW, customerFile: can(viewer, `${house}.customers.view`) });
    assert.equal(off.ok, true);
    assert.deepEqual([off.related, off.customerFile], [[], "off"], "nothing about other requests of the customer reaches the browser");
    assert.ok(!JSON.stringify(off.related).includes("MH-"), "no tracking code of another request");
    const readsOff = reads.length;
    reads.length = 0;
    const on = await readQuotesPage(db, house, parseQuoteParams({}), { now: NOW, customerFile: can(manager, `${house}.customers.view`) });
    assert.ok(on.related.length >= 30 && on.customerFile !== "off");
    assert.ok(reads.length > readsOff, "the file is not even queried when the right is missing");
    // the default is closed: a caller that forgets to say so gets no file
    assert.equal((await readQuotesPage(db, house, parseQuoteParams({}), { now: NOW })).customerFile, "off");
  });
}

test("both page loaders pass the person's customers.view, and the screen shows no file when it is off", () => {
  for (const [file, house] of [["lib/operator/data.js", "health"], ["lib/beauty/operator/data.js", "beauty"]]) {
    const src = fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    assert.match(src, new RegExp(`readQuotesPage\\(admin, "${house}", params, \\{ customerFile: mayView\\(session, "${house}", "customers\\.view"\\) \\}\\)`), file);
  }
  assert.match(fs.readFileSync(new URL("../components/operator/QuotesPanel.jsx", import.meta.url), "utf8"), /data\.customerFile === "off" \? \[\]/);
});
