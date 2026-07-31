import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const LEVEL_TWO_FILES = [
  "migrations/21_health_category_tree_clinical.sql",
  "migrations/22_health_category_tree_care.sql",
];

const LEVEL_THREE_FILES = [
  "migrations/24_health_category_leaves_clinical.sql",
  "migrations/25_health_category_leaves_care.sql",
  "migrations/26_health_category_leaves_equipment.sql",
];

function rowsFrom(sql) {
  return [...sql.matchAll(/\('([a-z0-9-]+)',\s*'([a-z0-9-]+)',\s*'/g)].map((match) => ({
    slug: match[1],
    parent: match[2],
  }));
}

test("Health detailed taxonomy contains 347 unique level-3 categories with valid parents", async () => {
  const levelTwoSql = await Promise.all(LEVEL_TWO_FILES.map((file) => readFile(file, "utf8")));
  const levelThreeSql = await Promise.all(LEVEL_THREE_FILES.map((file) => readFile(file, "utf8")));

  const levelTwoSlugs = new Set(levelTwoSql.flatMap(rowsFrom).map((row) => row.slug));
  const leaves = levelThreeSql.flatMap(rowsFrom);
  const leafSlugs = new Set(leaves.map((row) => row.slug));

  assert.equal(levelTwoSlugs.size, 68);
  assert.equal(leaves.length, 347);
  assert.equal(leafSlugs.size, 347);

  for (const leaf of leaves) {
    assert.match(leaf.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(levelTwoSlugs.has(leaf.parent), `Unknown parent for ${leaf.slug}: ${leaf.parent}`);
  }
});

test("Health public navigation drills through the category tree like Beauty", async () => {
  const directory = await readFile("app/health/[lang]/categories/page.jsx", "utf8");
  const categoryPage = await readFile("app/health/[lang]/categories/[slug]/page.jsx", "utf8");
  const homepage = await readFile("components/home/CategoryGrid.jsx", "utf8");
  const quickAccess = await readFile("components/health/SeoCategoryDirectory.jsx", "utf8");

  assert.match(directory, /CategoryTreeGrid/);
  assert.match(directory, /\/categories\/\$\{node\.slug\}/);
  assert.match(homepage, /\/categories\/\$\{category\.slug\}/);
  assert.match(categoryPage, /node\.children\?\.length/);
  assert.match(categoryPage, /\/categories\/\$\{node\.slug\}/);
  assert.match(categoryPage, /\/catalog\?category=\$\{node\.slug\}/);
  assert.match(quickAccess, /<details/);
  assert.match(quickAccess, /flattenHealthCategoryTree/);
});

test("Health sitemap emits routes for the active category hierarchy", async () => {
  const sitemap = await readFile("app/sitemap.js", "utf8");

  assert.match(sitemap, /getCategories/);
  assert.match(sitemap, /buildHealthCategoryTree/);
  assert.match(sitemap, /flattenHealthCategoryTree/);
  assert.match(sitemap, /\/categories\/\$\{node\.slug\}/);
  assert.match(sitemap, /\/catalog\?category=\$\{node\.slug\}/);
});
