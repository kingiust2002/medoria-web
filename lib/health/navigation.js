// lib/health/navigation.js
// Server-side projection for the shared Health header. The full categories rows
// include descriptions and four locale columns; the client navigation only needs
// one resolved label plus the three-level relationship.
import "server-only";

import { getCategories } from "@/lib/supabase";
import { buildHealthCategoryTree, healthCategoryName } from "@/lib/health/categories";

function projectNode(node, lang) {
  return {
    id: node.id,
    slug: node.slug,
    name: healthCategoryName(node, lang),
    children: (node.children || []).map((child) => projectNode(child, lang)),
  };
}

export async function getHealthNavTree(lang) {
  const rows = await getCategories();
  const tree = buildHealthCategoryTree(rows, { activeOnly: true });
  return tree.map((node) => projectNode(node, lang));
}
