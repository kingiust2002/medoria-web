// lib/operator/panelSearch.js — the panel-wide quick search ("/" or Ctrl+K): products, customer requests, categories, brands (Beauty) and
// people, each only if the person may see that kind of data (the caller passes `access`, computed from the verified session). Plain module
// (the admin client is passed in): unit-tested. Results are short facts and a link — never a message text, never more than a handful.
import { sanitizeSearchTerm } from "../catalogQuery.js";

export const SEARCH_MIN = 2;
const LIMIT = 6;

const SOURCES = {
  health: { products: "products", quotes: "quote_requests", categories: "categories", brands: null, base: "/operator" },
  beauty: { products: "beauty_products", quotes: "beauty_quote_requests", categories: "beauty_categories", brands: "beauty_brands", base: "/beauty/operator" },
};
const orOf = (cols, term) => cols.map((c) => `${c}.ilike.%${term}%`).join(",");
const first = (...v) => v.find(Boolean) || "";

// access: { products, quotes, categories, brands, users } booleans → { ok, groups: [{ kind, items: [{ id, title, sub, href }] }] }
export async function searchPanel({ admin, panel, access, q }) {
  const term = sanitizeSearchTerm(q || "");
  if (term.length < SEARCH_MIN) return { ok: true, groups: [] };
  const src = SOURCES[panel === "beauty" ? "beauty" : "health"];
  const groups = [];
  const run = async (kind, table, cols, select, shape) => {
    const { data, error } = await admin.from(table).select(select).or(orOf(cols, term)).limit(LIMIT);
    if (error) return;                                                          // a source that is unavailable is simply absent
    const items = (data || []).map(shape);
    if (items.length) groups.push({ kind, items });
  };
  if (access.products) await run("products", src.products, ["sku", "name_en", "name_fa", "name_ru", "name_tg", "brand"], "id,sku,name_en,name_fa,is_active",
    (r) => ({ id: r.id, title: first(r.name_fa, r.name_en, r.sku), sub: [r.sku, r.is_active === false ? "•" : ""].filter(Boolean).join(" "), href: `${src.base}/products/${r.id}/edit`, inactive: r.is_active === false }));
  if (access.quotes) {
    const digits = String(q).replace(/\D/g, "");
    const cols = ["name", "organization", "tracking_code", "product_name", ...(digits.length >= 4 ? ["phone"] : [])];
    await run("quotes", src.quotes, cols, "id,name,organization,tracking_code,product_name,phone,status",
      (r) => ({ id: r.id, title: first(r.name, r.organization, r.tracking_code), sub: [r.tracking_code, r.product_name].filter(Boolean).join(" · "), href: `${src.base}/quotes?q=${encodeURIComponent(r.tracking_code || r.name || "")}` }));
  }
  if (access.categories) await run("categories", src.categories, ["slug", "name_en", "name_fa", "name_ru", "name_tg"], "id,slug,name_en,name_fa",
    (r) => ({ id: r.id, title: first(r.name_fa, r.name_en, r.slug), sub: r.slug, href: `${src.base}/categories` }));
  if (access.brands && src.brands) await run("brands", src.brands, ["slug", "name_en", "name_fa"], "id,slug,name_en,name_fa",
    (r) => ({ id: r.id, title: first(r.name_fa, r.name_en, r.slug), sub: r.slug, href: `${src.base}/brands` }));
  if (access.users) {
    const { data, error } = await admin.from("operator_users").select("id,username,display_name,houses,status").or(orOf(["username", "display_name"], term)).limit(LIMIT * 2);
    if (!error) {
      const items = (data || []).filter((u) => (u.houses || []).includes(panel === "beauty" ? "beauty" : "health")).slice(0, LIMIT)
        .map((u) => ({ id: u.id, title: u.display_name, sub: `${u.username}${u.status !== "active" ? " •" : ""}`, href: `${src.base}/users` }));
      if (items.length) groups.push({ kind: "users", items });
    }
  }
  return { ok: true, groups };
}
