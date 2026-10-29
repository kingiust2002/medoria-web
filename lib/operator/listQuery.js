// lib/operator/listQuery.js — server-side paging, search, filtering and sorting of the panel lists (products, customer requests).
//
// Why: the panel used to load the newest 2000 products / 1500 requests into the browser and filter there. Rows beyond the cap were
// unreachable and every number on screen was computed from a partial list. Now the URL holds the whole state of a list (page, size, text,
// filters, sort), the database does the filtering, sorting and exact counting, and the browser holds one page.
//
// Plain module (no Next, no alias imports): used by the readers, the screens and the unit tests. Every value that comes from the address bar
// is checked against an allow-list or a strict pattern here; nothing from the URL reaches a PostgREST expression unescaped.

export const PAGE_SIZES = [25, 50, 100];
export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE = 100000;                        // a hostile ?page= cannot ask for an absurd offset

const first = (v) => (Array.isArray(v) ? v[0] : v);
const str = (v, max) => { const s = first(v); return typeof s === "string" ? s.replace(/[\u0000-\u001F\u007F\u2028\u2029]/g, " ").trim().slice(0, max) : ""; };
const oneOf = (v, allowed, fallback = "") => { const s = first(v); return typeof s === "string" && allowed.includes(s) ? s : fallback; };

export function parsePage(v) {
  const s = first(v);
  const n = typeof s === "string" && /^\d{1,6}$/.test(s.trim()) ? Number(s) : NaN;
  return Number.isSafeInteger(n) && n >= 1 && n <= MAX_PAGE ? n : 1;
}
export function parseSize(v) {
  const s = first(v);
  const n = typeof s === "string" && /^\d{1,3}$/.test(s.trim()) ? Number(s) : NaN;
  return PAGE_SIZES.includes(n) ? n : DEFAULT_PAGE_SIZE;
}

// Search text goes into a PostgREST .or() list where , ( ) are syntax: strip them (and quotes/backslashes) and escape the LIKE wildcards.
export function sanitizeTerm(s) {
  return String(s ?? "").slice(0, 80).replace(/[,()"'\\*]/g, " ").replace(/[%_]/g, "\\$&").replace(/\s+/g, " ").trim();
}
const orOf = (cols, term) => cols.map((c) => `${c}.ilike.%${term}%`).join(",");

// ── products ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
export const PRODUCT_SORTS = ["updated", "newest", "name", "category"];
export const PRODUCT_SEARCH_COLUMNS = ["name_fa", "name_en", "name_ru", "name_tg", "sku", "brand"];
const CAT_RE = /^[A-Za-z0-9_-]{1,80}$/;
const WORLD_RE = /^[a-z_]{1,30}$/;

export function parseProductParams(sp = {}) {
  return {
    page: parsePage(sp.page), size: parseSize(sp.size),
    q: str(sp.q, 80),
    cat: (() => { const s = str(sp.cat, 80); return CAT_RE.test(s) ? s : ""; })(),
    world: (() => { const s = str(sp.world, 30); return WORLD_RE.test(s) ? s : ""; })(),
    stock: oneOf(sp.stock, ["in", "out"]),
    status: oneOf(sp.status, ["active", "inactive"]),
    complete: oneOf(sp.complete, ["incomplete", "complete"]),
    sort: oneOf(sp.sort, PRODUCT_SORTS, "updated"),
  };
}

// Filters on a PostgREST builder. `table` is the products table of the house; `worldCategoryIds` the ids of the categories of the chosen
// world (Beauty). Returns the builder. The completeness filter needs the computed column `gap_count` (migration 43).
export function applyProductFilters(query, p, { legacySlug = true, worldCategoryIds = null } = {}) {
  let q = query;
  const term = sanitizeTerm(p.q);
  if (term) q = q.or(orOf(PRODUCT_SEARCH_COLUMNS, term));
  if (p.world && Array.isArray(worldCategoryIds)) q = worldCategoryIds.length ? q.in("category_id", worldCategoryIds) : q.in("category_id", [-1]);
  if (p.cat) {
    if (/^\d+$/.test(p.cat)) q = legacySlug ? q.or(`category_id.eq.${p.cat},category.eq.${p.cat}`) : q.eq("category_id", Number(p.cat));
    else q = legacySlug ? q.eq("category", p.cat) : q.eq("category_id", -1);
  }
  if (p.stock === "in") q = q.eq("in_stock", true);
  else if (p.stock === "out") q = q.or("in_stock.is.null,in_stock.eq.false");
  if (p.status === "active") q = q.or("is_active.is.null,is_active.eq.true");
  else if (p.status === "inactive") q = q.eq("is_active", false);
  if (p.complete === "incomplete") q = q.gt("gap_count", 0);
  else if (p.complete === "complete") q = q.eq("gap_count", 0);
  return q;
}

// Every sort ends with the id, so neighbouring pages never overlap or skip a row. `lang` is the panel language (names sort in it).
const NAME_COL = { fa: "name_fa", tg: "name_tg", en: "name_en", ru: "name_ru" };
export function applyProductSort(query, sort, lang = "fa") {
  switch (sort) {
    case "newest": return query.order("created_at", { ascending: false, nullsFirst: false }).order("id", { ascending: false });
    case "name": return query.order(NAME_COL[lang] || "name_en", { ascending: true, nullsFirst: false }).order("id", { ascending: true });
    case "category": return query.order("category_id", { ascending: true, nullsFirst: false }).order("id", { ascending: true });
    default: return query.order("updated_at", { ascending: false, nullsFirst: false }).order("id", { ascending: false });
  }
}

// ── customer requests ──────────────────────────────────────────────────────────────────────────────────────────────────────
export const QUOTE_TABS = ["active", "archived", "spam", "all"];
export const QUOTE_SEARCH_COLUMNS = ["name", "phone", "product_name", "organization", "tracking_code", "assigned_to"];
const STATUS_RE = /^[a-z_]{1,20}$/;

export function parseQuoteParams(sp = {}) {
  return {
    page: parsePage(sp.page), size: parseSize(sp.size),
    tab: oneOf(sp.tab, QUOTE_TABS, "active"),
    q: str(sp.q, 80),
    status: (() => { const s = str(sp.status, 20); return STATUS_RE.test(s) ? s : ""; })(),
    who: str(sp.who, 60),                                          // "" = everyone · "__none" = unassigned · else a name
    attention: first(sp.attention) === "1",
  };
}

// The team's calendar day (UTC+5) a follow-up is compared with, and the instant after which an unanswered request is "overdue".
export function attentionExpr({ now = Date.now(), overdueHours = 24, today }) {
  const cutoff = new Date(now - overdueHours * 3_600_000).toISOString();
  return [
    `and(status.eq.new,first_response_at.is.null,created_at.lte.${cutoff})`,        // unanswered for 24 h
    "notify_status.eq.failed",                                                      // the Telegram notice did not arrive
    `and(follow_up_at.lt.${today}T23:59:59.999Z,status.not.in.(closed,archived,spam))`,   // a follow-up is due today or earlier
  ].join(",");
}

// Tab → filter. active = neither archived nor spam; all = everything.
export function applyQuoteTab(query, tab) {
  if (tab === "archived" || tab === "spam") return query.eq("status", tab);
  if (tab === "active") return query.not("status", "in", "(archived,spam)");
  return query;
}

export function applyQuoteFilters(query, p, { now = Date.now(), today, overdueHours = 24 } = {}) {
  let q = applyQuoteTab(query, p.tab);
  const term = sanitizeTerm(p.q);
  if (term) q = q.or(orOf(QUOTE_SEARCH_COLUMNS, term));
  if (p.status) q = q.eq("status", p.status);
  if (p.who === "__none") q = q.is("assigned_to", null);
  else if (p.who) q = q.eq("assigned_to", p.who);
  if (p.attention) q = q.or(attentionExpr({ now, overdueHours, today }));
  return q;
}

export function applyQuoteSort(query) {
  return query.order("created_at", { ascending: false }).order("id", { ascending: false });
}

// ── URLs ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Only values that differ from the defaults go into the address, so the plain list keeps the plain URL.
const PRODUCT_DEFAULTS = { page: 1, size: DEFAULT_PAGE_SIZE, q: "", cat: "", world: "", stock: "", status: "", complete: "", sort: "updated" };
const QUOTE_DEFAULTS = { page: 1, size: DEFAULT_PAGE_SIZE, tab: "active", q: "", status: "", who: "", attention: false };

function hrefOf(base, params, defaults, change = {}, resetPage) {
  const next = { ...params, ...change };
  // a change of the list (filter, sort, size, text) starts again at page 1; no change at all (or a page change) keeps the page
  if ((resetPage ?? Object.keys(change).length > 0) && !("page" in change)) next.page = 1;
  const usp = new URLSearchParams();
  for (const k of Object.keys(defaults)) {
    const v = next[k];
    if (v === defaults[k] || v === "" || v === false || v == null) continue;
    usp.set(k, v === true ? "1" : String(v));
  }
  const qs = usp.toString();
  return qs ? `${base}?${qs}` : base;
}
export const productHref = (base, params, change, resetPage) => hrefOf(base, params, PRODUCT_DEFAULTS, change, resetPage);
export const quoteHref = (base, params, change, resetPage) => hrefOf(base, params, QUOTE_DEFAULTS, change, resetPage);

// "1 2 … 9 10 11 … 40" — the numbers a pager shows (always the first, the last and the neighbours of the current page)
export function pageWindow(page, pageCount, span = 1) {
  const out = [];
  for (let i = 1; i <= pageCount; i++) if (i === 1 || i === pageCount || Math.abs(i - page) <= span) out.push(i);
  const withGaps = [];
  for (let i = 0; i < out.length; i++) { if (i && out[i] - out[i - 1] > 1) withGaps.push("gap"); withGaps.push(out[i]); }
  return withGaps;
}

export const pageCountOf = (total, size) => Math.max(1, Math.ceil((Number(total) || 0) / size));

// Runs a page query. `build(from, to)` returns a fresh builder with filters, sort and the exact count; it is awaited here.
// A page past the end (PostgREST 416 / PGRST103, or an empty page above 1) is re-read as the last page that exists, using the exact total.
// → { ok: true, rows, total, page, pageCount, size, clamped } | { ok: false, error }
export async function runPage(build, { page, size }) {
  const read = async (pg) => build((pg - 1) * size, pg * size - 1);
  let pg = page, clamped = false;
  let res = await read(pg);
  const pastEnd = pg > 1 && (res.error?.code === "PGRST103" || (!res.error && (res.data || []).length === 0));
  if (pastEnd) {
    const head = await build(0, 0);                       // the exact total comes back with any successful page
    if (head.error) return { ok: false, error: head.error };
    pg = pageCountOf(Number.isFinite(head.count) ? head.count : 0, size); clamped = true;
    res = await read(pg);
  }
  if (res.error) return { ok: false, error: res.error };
  const total = Number.isFinite(res.count) ? res.count : (res.data || []).length;
  return { ok: true, rows: res.data || [], total, page: pg, pageCount: pageCountOf(total, size), size, clamped };
}

// Reads EVERY row of a query in chunks (PostgREST answers at most `max-rows` per request, 1000 by default, silently). For computing
// totals that must not be wrong, not for showing a list. `build(from, to)` returns a fresh builder ordered by a unique column.
export async function readAll(build, { chunk = 1000, maxRows = 200000 } = {}) {
  const rows = [];
  for (let from = 0; from < maxRows; from += chunk) {
    const res = await build(from, from + chunk - 1);
    if (res.error) return { ok: false, error: res.error, rows };
    const part = res.data || [];
    rows.push(...part);
    if (part.length < chunk) return { ok: true, rows };
  }
  return { ok: false, error: { code: "TOO_MANY_ROWS", message: `more than ${maxRows} rows` }, rows };       // never a silently partial answer
}

export const isMissingObject = (e) => Boolean(e) && (["42883", "42703", "PGRST202", "PGRST204", "42P01", "PGRST205"].includes(e.code) || /does not exist|could not find the function|schema cache/i.test(String(e.message || "")));
