import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Health Collection mirrors Beauty World with an in-header three-level cascade", async () => {
  const [layout, header, menu, navigation] = await Promise.all([
    readFile("app/health/[lang]/layout.jsx", "utf8"),
    readFile("components/layout/Header.jsx", "utf8"),
    readFile("components/layout/HealthCollectionMegaMenu.jsx", "utf8"),
    readFile("lib/health/navigation.js", "utf8"),
  ]);

  assert.match(layout, /<Suspense fallback=\{<Header lang=\{lang\} categoryTree=\{\[\]\} \/>\}>/);
  assert.match(layout, /getHealthNavTree\(lang\)/);
  assert.match(header, /HealthCollectionMegaMenu/);
  assert.match(header, /tree=\{categoryTree\}/);

  assert.match(menu, /departmentId/);
  assert.match(menu, /groupId/);
  assert.match(menu, /department\.children\.map/);
  assert.match(menu, /group\.children\.map/);
  assert.match(menu, /aria-haspopup="true"/);
  assert.match(menu, /event\.key === "Escape"/);
  assert.match(menu, /fixed left-1\/2 top-\[4\.5rem\]/);
  assert.match(menu, /\/catalog\?category=\$\{encodeURIComponent\(slug\)\}/);
  assert.equal(menu.includes("/categories/"), false);

  assert.match(header, /mobileDepartment/);
  assert.match(header, /mobileGroup/);
  assert.match(header, /groups\.map/);
  assert.match(header, /leaves\.map/);
  assert.match(header, /\/catalog\?category=\$\{encodeURIComponent\(slug\)\}/);

  assert.match(navigation, /buildHealthCategoryTree\(rows, \{ activeOnly: true \}\)/);
  assert.match(navigation, /name: healthCategoryName\(node, lang\)/);
  assert.equal(navigation.includes("description_"), false);
});
