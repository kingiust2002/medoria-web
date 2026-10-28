// The product and quote lists of both panels load a bounded number of rows (lib/operator/listLimits.js) and say so when they reach the bound.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DASHBOARD_ROW_LIMIT, PRODUCT_LIST_LIMIT, QUOTE_LIST_LIMIT, mayBeTruncated } from "../lib/operator/listLimits.js";

const read = (f) => fs.readFileSync(path.join(import.meta.dirname, "..", f), "utf8");

test("mayBeTruncated: only a list that reached its limit may have more", () => {
  assert.equal(mayBeTruncated(new Array(PRODUCT_LIST_LIMIT).fill(1), PRODUCT_LIST_LIMIT), true);
  assert.equal(mayBeTruncated(new Array(PRODUCT_LIST_LIMIT - 1).fill(1), PRODUCT_LIST_LIMIT), false);
  assert.equal(mayBeTruncated([], QUOTE_LIST_LIMIT), false);
  assert.equal(mayBeTruncated(null, QUOTE_LIST_LIMIT), false);
  assert.ok(PRODUCT_LIST_LIMIT >= 1000 && QUOTE_LIST_LIMIT >= 1000, "bounds are generous: they exist to stop a runaway read, not to hide normal data");
});

test("every list reader is bounded and every list page tells its screen when the bound was reached", () => {
  for (const [file, tables] of [["lib/operator/data.js", ["products", "quote_requests"]], ["lib/beauty/operator/data.js", ["beauty_products", "beauty_quote_requests"]]]) {
    const src = read(file);
    for (const t of tables) {
      const block = src.slice(src.indexOf(`.from("${t}")`));
      const stmt = block.slice(0, block.indexOf(";"));
      assert.match(stmt, /\.limit\((PRODUCT|QUOTE)_LIST_LIMIT\)/, `${file}: the ${t} list is not bounded`);
    }
  }
  for (const f of ["app/operator/(panel)/products/page.jsx", "app/beauty/operator/(panel)/products/page.jsx", "app/operator/(panel)/quotes/page.jsx", "app/beauty/operator/(panel)/quotes/page.jsx"]) {
    assert.match(read(f), /truncatedAt=\{mayBeTruncated\(/, `${f} does not pass truncatedAt`);
  }
  for (const f of ["components/operator/ProductsTable.jsx", "components/beauty/operator/ProductsTable.jsx", "components/operator/QuotesPanel.jsx"]) {
    assert.match(read(f), /<TruncatedNotice limit=\{truncatedAt\} \/>/, `${f} does not show the notice`);
  }
});

test("the dashboards read a bounded number of rows too, and say when their numbers come from the newest ones only", () => {
  assert.ok(DASHBOARD_ROW_LIMIT >= PRODUCT_LIST_LIMIT);
  for (const [file, fn] of [["lib/operator/data.js", "getDashboardData"], ["lib/beauty/operator/data.js", "getBeautyDashboardData"]]) {
    const src = read(file);
    const body = src.slice(src.indexOf(`export async function ${fn}`));
    const end = body.slice(0, body.indexOf("\n}\n"));
    assert.equal((end.match(/\.limit\(DASHBOARD_ROW_LIMIT\)/g) || []).length, 2, `${file}: both reads of ${fn} must be bounded`);
    assert.match(end, /statsLimit:/);
  }
  for (const f of ["app/operator/(panel)/page.jsx", "app/beauty/operator/(panel)/page.jsx"]) assert.match(read(f), /<TruncatedNotice limit=\{statsLimit\} variant="stats" \/>/);
});
