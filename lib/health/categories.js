// lib/health/categories.js
// Pure category-tree helpers shared by public Health pages and the operator panel.

const LOCALE_FIELDS = { fa: "name_fa", en: "name_en", ru: "name_ru", tg: "name_tg" };
const DESCRIPTION_FIELDS = { fa: "description_fa", en: "description_en", ru: "description_ru", tg: "description_tg" };

export function healthCategoryName(category, lang = "en") {
  if (!category) return "";
  const preferred = category[LOCALE_FIELDS[lang] || "name_en"];
  return preferred || category.name_en || category.name_fa || category.name_tg || category.name_ru || category.slug || "";
}

export function healthCategoryDescription(category, lang = "en") {
  if (!category) return "";
  const preferred = category[DESCRIPTION_FIELDS[lang] || "description_en"];
  return preferred || category.description_en || category.description_fa || category.description_tg || category.description_ru || "";
}

function sortNodes(nodes) {
  nodes.sort((a, b) => {
    const order = Number(a.sort_order || 0) - Number(b.sort_order || 0);
    return order || String(a.slug || "").localeCompare(String(b.slug || ""));
  });
  for (const node of nodes) sortNodes(node.children || []);
  return nodes;
}

export function buildHealthCategoryTree(rows = [], { activeOnly = false } = {}) {
  const nodes = (Array.isArray(rows) ? rows : []).map((row) => ({
    ...row,
    level: Number(row.level || (row.parent_id == null ? 1 : 2)),
    children: [],
  }));
  const byId = new Map(nodes.filter((n) => n.id != null).map((n) => [String(n.id), n]));
  const roots = [];

  for (const node of nodes) {
    if (node.parent_id == null) roots.push(node);
    else {
      const parent = byId.get(String(node.parent_id));
      if (parent) parent.children.push(node);
      else if (!activeOnly) roots.push(node);
    }
  }

  sortNodes(roots);
  if (!activeOnly) return roots;

  const prune = (node) => {
    if (node.is_active === false) return null;
    return { ...node, children: (node.children || []).map(prune).filter(Boolean) };
  };
  return roots.map(prune).filter(Boolean);
}

export function flattenHealthCategoryTree(tree = []) {
  const out = [];
  const walk = (nodes, depth = 0, ancestors = []) => {
    for (const node of nodes || []) {
      out.push({ node, depth, ancestors });
      walk(node.children || [], depth + 1, [...ancestors, node]);
    }
  };
  walk(tree);
  return out;
}

export function findHealthCategory(tree = [], slug) {
  const key = String(slug || "");
  for (const { node } of flattenHealthCategoryTree(tree)) if (node.slug === key) return node;
  return null;
}

export function getHealthCategoryPath(tree = [], slug) {
  const key = String(slug || "");
  for (const { node, ancestors } of flattenHealthCategoryTree(tree)) {
    if (node.slug === key) return [...ancestors, node];
  }
  return [];
}

export function getHealthDescendants(node) {
  if (!node) return [];
  const out = [];
  const walk = (current) => {
    out.push(current);
    for (const child of current.children || []) walk(child);
  };
  walk(node);
  return out;
}

export function getHealthDescendantIds(node) {
  return new Set(getHealthDescendants(node).map((n) => n.id).filter((id) => id != null));
}

export function getHealthDescendantSlugs(node) {
  return new Set(getHealthDescendants(node).map((n) => n.slug).filter(Boolean));
}

export function rollupHealthCategoryCounts(tree = [], directCounts = new Map()) {
  const roll = (node) => {
    const own = Number(directCounts.get(String(node.id)) || directCounts.get(`slug:${node.slug}`) || 0);
    let total = own;
    for (const child of node.children || []) total += roll(child);
    node.product_count = own;
    node.total_count = total;
    return total;
  };
  for (const root of tree) roll(root);
  return tree;
}
