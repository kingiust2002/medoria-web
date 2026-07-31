import test from "node:test";
import assert from "node:assert/strict";
import {
  buildHealthCategoryTree,
  findHealthCategory,
  getHealthCategoryPath,
  getHealthDescendantIds,
  rollupHealthCategoryCounts,
} from "../lib/health/categories.js";

const rows = [
  { id: 1, slug: "root", name_en: "Root", parent_id: null, level: 1, sort_order: 10, is_active: true },
  { id: 2, slug: "group", name_en: "Group", parent_id: 1, level: 2, sort_order: 10, is_active: true },
  { id: 3, slug: "leaf-a", name_en: "Leaf A", parent_id: 2, level: 3, sort_order: 20, is_active: true },
  { id: 4, slug: "leaf-b", name_en: "Leaf B", parent_id: 2, level: 3, sort_order: 10, is_active: false },
  { id: 5, slug: "hidden-root", name_en: "Hidden", parent_id: null, level: 1, sort_order: 20, is_active: false },
  { id: 6, slug: "orphan-active", name_en: "Orphan", parent_id: 5, level: 2, sort_order: 10, is_active: true },
];

test("buildHealthCategoryTree builds and sorts a three-level tree", () => {
  const tree = buildHealthCategoryTree(rows);
  assert.equal(tree.length, 2);
  assert.equal(tree[0].slug, "root");
  assert.equal(tree[0].children[0].slug, "group");
  assert.deepEqual(tree[0].children[0].children.map((node) => node.slug), ["leaf-b", "leaf-a"]);
});

test("activeOnly removes inactive branches rather than promoting their children", () => {
  const tree = buildHealthCategoryTree(rows, { activeOnly: true });
  assert.deepEqual(tree.map((node) => node.slug), ["root"]);
  assert.deepEqual(tree[0].children[0].children.map((node) => node.slug), ["leaf-a"]);
  assert.equal(findHealthCategory(tree, "orphan-active"), null);
});

test("path and descendant helpers include every level", () => {
  const tree = buildHealthCategoryTree(rows);
  const path = getHealthCategoryPath(tree, "leaf-a");
  assert.deepEqual(path.map((node) => node.slug), ["root", "group", "leaf-a"]);
  assert.deepEqual([...getHealthDescendantIds(tree[0])].sort(), [1, 2, 3, 4]);
});

test("rollupHealthCategoryCounts preserves direct counts and aggregates descendants", () => {
  const tree = buildHealthCategoryTree(rows);
  const counts = new Map([["1", 1], ["3", 4], ["slug:leaf-b", 2]]);
  rollupHealthCategoryCounts(tree, counts);
  assert.equal(tree[0].product_count, 1);
  assert.equal(findHealthCategory(tree, "leaf-a").product_count, 4);
  assert.equal(findHealthCategory(tree, "leaf-b").product_count, 2);
  assert.equal(tree[0].total_count, 7);
});
