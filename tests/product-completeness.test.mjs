// What a product is still missing (lib/operator/completeness.js): it points at gaps, never counts a valid
// state as one ("price on request"), ignores archived products in the dashboard count, and is wired into
// both panels.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { productGaps, isIncomplete, countIncomplete, gapSummary } from "../lib/operator/completeness.js";

const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const FULL = {
  id: 1, sku: "A-1", image_url: "x.webp", category_id: 3, price: null,
  name_fa: "الف", name_ru: "Б", name_tg: "В", name_en: "A",
  description_fa: "الف", description_ru: "Б", description_tg: "В", description_en: "A",
  specs: { Size: "M" }, is_active: true,
};

test("a fully filled product has no gaps, and 'price on request' is not a gap", () => {
  assert.deepEqual(productGaps(FULL), []);
  assert.equal(isIncomplete(FULL), false);
  assert.equal(isIncomplete({ ...FULL, price: 0 }), false);
  assert.equal(gapSummary(FULL), "");
});

test("each missing piece is reported once, in a stable order, with a Persian label", () => {
  const p = { ...FULL, image_url: "", sku: "  ", name_tg: null, description_ru: "", description_en: undefined, specs: {} };
  assert.deepEqual(productGaps(p).map((g) => g.code), ["image", "sku", "name_tg", "description_ru", "description_en", "specs"]);
  assert.deepEqual(productGaps(p).map((g) => g.label).slice(0, 3), ["تصویر", "کد کالا (SKU)", "نام (تاجیکی)"]);
  assert.equal(productGaps({ ...FULL, specs: null }).map((g) => g.code).join(), "specs");
  assert.equal(productGaps({ ...FULL, specs: ["a"] }).map((g) => g.code).join(), "specs", "an array is not a specs table");
  assert.equal(productGaps({ ...FULL, category_id: null, category: null }).map((g) => g.code).join(), "category");
  assert.equal(productGaps({ ...FULL, category_id: null, category: "gloves" }).length, 0, "a legacy category slug counts as a category");
});

test("gapSummary is short, and a nonsense product is handled", () => {
  const bare = { id: 2 };
  assert.ok(productGaps(bare).length >= 10);
  assert.match(gapSummary(bare), /^\d+ مورد: تصویر، کد کالا \(SKU\)/);
  assert.ok(gapSummary(bare).endsWith("…"));
  assert.deepEqual(productGaps(null), []);
  assert.deepEqual(productGaps(undefined), []);
});

test("the dashboard count ignores archived products", () => {
  const rows = [FULL, { ...FULL, id: 2, image_url: null }, { ...FULL, id: 3, image_url: null, is_active: false }, { id: 4, is_active: true }];
  assert.equal(countIncomplete(rows), 2);
  assert.equal(countIncomplete([]), 0);
  assert.equal(countIncomplete(null), 0);
});

test("both panels show the filter, the badge and the dashboard count", () => {
  for (const f of ["components/operator/ProductsTable.jsx", "components/beauty/operator/ProductsTable.jsx"]) {
    const s = read(f);
    assert.match(s, /isIncomplete, gapSummary/);
    assert.match(s, /complete === "incomplete"/);
    assert.match(s, /ناقص: /);
  }
  for (const f of ["lib/operator/data.js", "lib/beauty/operator/data.js"]) assert.match(read(f), /incomplete: countIncomplete\(products\)/);
  for (const f of ["app/operator/(panel)/page.jsx", "app/beauty/operator/(panel)/page.jsx"]) assert.match(read(f), /محصولات با اطلاعات ناقص/);
});
