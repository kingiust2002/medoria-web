// A small stateful stand-in for Supabase's PostgREST API, for end-to-end tests.
//
// It understands the subset of PostgREST that Medoria uses (eq/neq/gt/gte/lt/lte/
// like/ilike/in/is/not/or filters, order, limit/offset, select, count, single-object
// responses, insert/update/delete with return=representation, rpc) and keeps rows in
// memory so a test can change data through the operator panel and then look at the
// public site. It deliberately does NOT emulate row-level security: the application's
// own filters (is_active, ...) are what the tests must prove.
//
// Every request is recorded with the kind of key it carried ("anon" | "service"), and
// GET /__state, POST /__reset expose and restore the data for assertions.
import http from "node:http";
import { warehouseRpc, Refusal } from "./fakeWarehouse.mjs";
import { randomUUID } from "node:crypto";
import { parseFilterExpr, nodeTest } from "../helpers/postgrestFilter.mjs";
import { productGaps } from "../../lib/operator/completeness.js";
import { phoneKey } from "../../lib/operator/quoteOps.js";

export const ANON_KEY = "anon-test-key";
export const SERVICE_KEY = "service-test-key";

const RESERVED = new Set(["select", "order", "limit", "offset", "on_conflict", "columns"]);
// unique constraints, as lists of column sets
const UNIQUE = {
  products: [["slug"]], beauty_products: [["slug"]], categories: [["slug"]], beauty_categories: [["slug"]],
  operator_users: [["username"]], operator_sessions: [["sid"]], operator_totp_state: [["panel"]], operator_recovery_used: [["panel", "code_hash"]],
  health_stock_levels: [["product_id"]], beauty_stock_levels: [["product_id"]],
  health_stock_count_lines: [["count_id", "product_id"]], beauty_stock_count_lines: [["count_id", "product_id"]],
};
// migration 41's guards on stock counts: a count that is not open, and its lines, no longer change; one open count per warehouse
const COUNTS = /^(health|beauty)_stock_counts$/, COUNT_LINES = /^(health|beauty)_stock_count_lines$/;
const countClosed = { code: "P0001", message: "stock:count_closed" };

const clone = (x) => JSON.parse(JSON.stringify(x));
// generated / computed columns of migration 43: products' gap_count (a computed column: only returned when selected, but filterable and sortable)
// and the requests' phone_key (a generated column: part of the row)
const PRODUCT_TABLES = new Set(["products", "beauty_products"]);
const QUOTE_TABLES = new Set(["quote_requests", "beauty_quote_requests"]);
const viewOf = (t, row) => (PRODUCT_TABLES.has(t) ? { ...row, gap_count: productGaps(row).length } : QUOTE_TABLES.has(t) ? { ...row, phone_key: phoneKey(row.phone) } : row);
const API_MAX_ROWS = 1000;      // Supabase's default per-request row limit: the rest is dropped without an error
const now = () => new Date().toISOString();

// split on commas that are not inside parentheses: "a.eq.1,b.in.(1,2)" -> ["a.eq.1","b.in.(1,2)"]
function splitTop(str) {
  const out = []; let depth = 0, cur = "";
  for (const ch of str) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) { out.push(cur); cur = ""; } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

function cmp(a, b) {
  const na = Number(a), nb = Number(b);
  if (a !== "" && b !== "" && !Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  return String(a).localeCompare(String(b));
}

function likeToRegex(pattern, flags) {
  const esc = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/[%*]/g, ".*").replace(/_/g, ".");
  return new RegExp(`^${esc}$`, flags);
}

function test(row, col, expr) {
  let neg = false;
  if (expr.startsWith("not.")) { neg = true; expr = expr.slice(4); }
  const dot = expr.indexOf(".");
  const op = expr.slice(0, dot), val = expr.slice(dot + 1);
  const v = row[col];
  let r;
  switch (op) {
    case "eq": r = v != null && String(v) === val; break;
    case "neq": r = v == null || String(v) !== val; break;
    case "gt": r = v != null && cmp(v, val) > 0; break;
    case "gte": r = v != null && cmp(v, val) >= 0; break;
    case "lt": r = v != null && cmp(v, val) < 0; break;
    case "lte": r = v != null && cmp(v, val) <= 0; break;
    case "like": r = v != null && likeToRegex(val, "").test(String(v)); break;
    case "ilike": r = v != null && likeToRegex(val, "i").test(String(v)); break;
    case "in": r = v != null && splitTop(val.replace(/^\(|\)$/g, "")).map((x) => x.replace(/^"|"$/g, "")).includes(String(v)); break;
    case "is": r = val === "null" ? v == null : String(v) === val; break;
    case "cs": r = Array.isArray(v) && splitTop(val.replace(/^\{|\}$/g, "")).map((x) => x.replace(/^"|"$/g, "")).every((x) => v.includes(x)); break;   // array contains
    default: r = true;   // operators the app does not use (cs, ov, fts ...)
  }
  return neg ? !r : r;
}

function buildPredicate(searchParams) {
  const preds = [];
  for (const [key, value] of searchParams) {
    if (RESERVED.has(key)) continue;
    if (key === "or") {
      // the full PostgREST grammar (and(...) / or(...) groups, not.in.(a,b), …); a malformed expression answers 400 like the real API
      const nodes = parseFilterExpr(value.replace(/^\(|\)$/g, ""));
      preds.push((row) => nodes.some((n) => nodeTest(n, row)));
    } else {
      preds.push((row) => test(row, key, value));
    }
  }
  return (row) => preds.every((p) => p(row));
}

function applyOrder(rows, order) {
  if (!order) return rows;
  const keys = order.split(",").map((k) => { const [col, dir = "asc", nulls] = k.split("."); return { col, desc: dir === "desc", nulls }; });
  return [...rows].sort((a, b) => {
    for (const { col, desc, nulls } of keys) {
      const x = a[col], y = b[col];
      if (x == null && y == null) continue;
      if (x == null) return (nulls === "nullsfirst" || (nulls == null && desc)) ? -1 : 1;
      if (y == null) return (nulls === "nullsfirst" || (nulls == null && desc)) ? 1 : -1;
      const c = cmp(x, y);
      if (c !== 0) return desc ? -c : c;
    }
    return 0;
  });
}

const TRACKING_PREFIX = { quote_requests: "MH", beauty_quote_requests: "MB" };
const ANSWERED = ["contacted", "in_progress", "quoted", "closed"];
const hex4 = () => Math.floor(Math.random() * 0x10000).toString(16).toUpperCase().padStart(4, "0");

// migration 44: the public functions that hand out the ACTIVE variants of an ACTIVE product (public columns only)
function variantsRpc(tables, name, a) {
  const m = /^public_(beauty_)?product_variants$/.exec(name);
  if (m) {
    const table = tables[m[1] ? "beauty_products" : "products"] || [];
    const parent = table.find((r) => r.id === a.p_parent);
    if (!parent || parent.is_active === false || parent.variant_of != null) return [];
    return table.filter((v) => v.variant_of === parent.id && v.is_active !== false)
      .sort((x, y) => (x.variant_sort || 0) - (y.variant_sort || 0) || x.id - y.id)
      .map((v) => ({ id: v.id, sku: v.sku, options: v.variant_options, price: v.price, ...(m[1] ? {} : { currency: v.currency }), unit: v.unit, in_stock: v.in_stock, image_url: v.image_url, sort: v.variant_sort || 0 }));
  }
  if (name === "public_variant_items") {
    const table = tables.products || [];
    return table.filter((v) => (a.p_ids || []).slice(0, 30).includes(v.id) && v.variant_of != null && v.is_active !== false)
      .map((v) => ({ v, p: table.find((r) => r.id === v.variant_of) })).filter(({ p }) => p && p.is_active !== false && p.variant_of == null)
      .map(({ v, p }) => ({ id: v.id, sku: v.sku, name_en: v.name_en, name_ru: v.name_ru, name_tg: v.name_tg, name_fa: v.name_fa, price: v.price, currency: v.currency, unit: v.unit, in_stock: v.in_stock, image_url: v.image_url || p.image_url, min_order_qty: v.min_order_qty, brand: v.brand, category: v.category, options: v.variant_options, parent_id: p.id, parent_slug: p.slug }));
  }
  return undefined;
}

export function createFakeDb(seedFactory) {
  let tables = clone(seedFactory());
  let counters = {};
  const log = [];
  const faults = [];   // injected failures: { table, method, status, code }

  const nextId = (t) => {
    if (counters[t] == null) counters[t] = Math.max(0, ...((tables[t] || []).map((r) => Number(r.id) || 0)));
    return ++counters[t];
  };
  // Resetting restores the data between tests but KEEPS the login state (sessions, second-factor memory),
  // so a session created once per test file stays valid; `?all=1` wipes that too.
  const AUTH_TABLES = ["operator_sessions", "operator_totp_state", "operator_recovery_used"];
  const reset = (all = false) => {
    const keep = all ? {} : Object.fromEntries(AUTH_TABLES.map((t) => [t, tables[t]]));
    tables = { ...clone(seedFactory()), ...keep };
    counters = {}; log.length = 0; faults.length = 0;
  };

  function respond(res, status, body, headers = {}) {
    res.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": "*", "access-control-expose-headers": "content-range", ...headers });
    res.end(body === undefined ? "" : JSON.stringify(body));
  }

  async function readBody(req) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const text = Buffer.concat(chunks).toString("utf8");
    try { return text ? JSON.parse(text) : null; } catch { return null; }
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://fake");
    if (req.method === "OPTIONS") { res.writeHead(204, { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" }); return res.end(); }
    if (url.pathname === "/__state") return respond(res, 200, tables);
    if (url.pathname === "/__log") return respond(res, 200, log);
    if (url.pathname === "/__reset") { reset(url.searchParams.get("all") === "1"); return respond(res, 200, { ok: true }); }
    // fault injection: POST /__fault {table, method, status, code}  → every such request answers with that error
    if (url.pathname === "/__fault") { faults.push(await readBody(req)); return respond(res, 200, { ok: true }); }
    if (url.pathname === "/__fault/clear") { faults.length = 0; return respond(res, 200, { ok: true }); }

    const key = String(req.headers.apikey || "").trim() || String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const kind = key === SERVICE_KEY ? "service" : key === ANON_KEY ? "anon" : "other";
    const rpc = url.pathname.match(/^\/rest\/v1\/rpc\/([\w]+)/);
    const m = url.pathname.match(/^\/rest\/v1\/([\w]+)/);
    log.push({ method: req.method, path: url.pathname, query: url.search, kind });

    // Storage (list / upload / remove) — just enough for the media library: objects live in tables.storage_objects
    const st = url.pathname.match(/^\/storage\/v1\/object\/(list\/)?([\w-]+)(?:\/(.+))?$/);
    if (st) {
      if (kind !== "service") return respond(res, 401, { message: "unauthorized" });
      const objs = (tables.storage_objects ||= []);
      const bucket = st[2];
      if (st[1] && req.method === "POST") {
        const body = await readBody(req);
        const prefix = String(body?.prefix || "");
        const rows = objs.filter((o) => o.bucket === bucket && o.name.startsWith(prefix ? `${prefix}/` : "") && !o.name.slice(prefix ? prefix.length + 1 : 0).includes("/"))
          .map((o) => ({ name: o.name.slice(prefix ? prefix.length + 1 : 0), id: o.id, created_at: o.created_at, metadata: { size: o.size } }));
        rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
        return respond(res, 200, rows.slice(Number(body?.offset || 0), Number(body?.offset || 0) + Number(body?.limit || 100)));
      }
      if (!st[1] && req.method === "DELETE") {
        const body = await readBody(req);
        const gone = objs.filter((o) => o.bucket === bucket && (body?.prefixes || []).includes(o.name));
        tables.storage_objects = objs.filter((o) => !gone.includes(o));
        return respond(res, 200, gone.map((o) => ({ name: o.name, bucket_id: bucket })));
      }
      if (!st[1] && req.method === "POST" && st[3]) {
        const chunks = []; for await (const c of req) chunks.push(c);
        objs.push({ id: randomUUID(), bucket, name: decodeURIComponent(st[3]), size: Buffer.concat(chunks).length, created_at: new Date().toISOString() });
        return respond(res, 200, { Key: `${bucket}/${st[3]}` });
      }
      return respond(res, 404, { message: "not found" });
    }

    if (rpc) {
      const body = await readBody(req);
      if (kind !== "service" && /_stock_/.test(rpc[1])) return respond(res, 401, { code: "42501", message: "permission denied for function" });   // like the real grants
      const variantRpc = variantsRpc(tables, rpc[1], body || {});               // migration 44's public functions
      if (variantRpc !== undefined) return respond(res, 200, variantRpc);
      try {
        const out = warehouseRpc(tables, rpc[1], body || {});
        return respond(res, 200, out);
      } catch (e) {
        if (e instanceof Refusal) return respond(res, 400, { code: "P0001", message: e.message, details: e.details || null });
        throw e;
      }
    }
    if (!m) return respond(res, 404, { message: "not found" });

    const t = m[1];
    const fault = faults.find((f) => f.table === t && f.method === req.method);
    if (fault) { await readBody(req); return respond(res, fault.status, { code: fault.code || "XX000", message: fault.message || "injected fault" }); }
    const prefer = String(req.headers.prefer || "");
    const wantRep = /return=representation/.test(prefer);
    const wantCount = /count=/.test(prefer);
    const single = /vnd\.pgrst\.object/.test(String(req.headers.accept || ""));
    tables[t] = tables[t] || [];
    let pred;
    try { pred = buildPredicate(url.searchParams); } catch (e) { return respond(res, 400, { code: "PGRST100", message: String(e.message) }); }
    const rowPred = pred;
    pred = (row) => rowPred(viewOf(t, row));

    const finish = (rows, status = 200) => {
      if (single) {
        if (rows.length !== 1) return respond(res, 406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" });
        return respond(res, status, rows[0]);
      }
      return respond(res, status, rows);
    };

    if (req.method === "GET" || req.method === "HEAD") {
      let rows = tables[t].filter(pred).map((r) => viewOf(t, r));
      if (PRODUCT_TABLES.has(t) && kind !== "service") rows = rows.filter((r) => r.variant_of == null);   // migration 44's public policy: a variant is not a public product
      const selectCols = String(url.searchParams.get("select") || "*");
      if (PRODUCT_TABLES.has(t) && !/\bgap_count\b/.test(selectCols)) rows = rows.map(({ gap_count, ...rest }) => rest);   // computed columns come back only when asked for
      if (t === "site_content" && kind !== "service") {   // migration 42: the public sees LIVE rows and the public columns only
        const cols = String(url.searchParams.get("select") || "*").split(",").map((c) => c.trim());
        if (cols.some((c) => !["id", "house", "kind", "data", "sort_order"].includes(c))) return respond(res, 401, { code: "42501", message: "permission denied for table site_content" });
        const nowMs = Date.now();
        rows = rows.filter((r) => r.is_published && (!r.publish_at || Date.parse(r.publish_at) <= nowMs) && (!r.unpublish_at || Date.parse(r.unpublish_at) > nowMs));
      }
      const total = rows.length;
      rows = applyOrder(rows, url.searchParams.get("order"));
      const off = Number(url.searchParams.get("offset") || 0);
      const lim = url.searchParams.get("limit");
      rows = rows.slice(off, lim != null ? off + Number(lim) : undefined).slice(0, API_MAX_ROWS);
      const range = `${rows.length ? off : "*"}${rows.length ? `-${off + rows.length - 1}` : ""}/${wantCount ? total : "*"}`;
      if (req.method === "HEAD") { res.writeHead(200, { "content-range": range, "access-control-allow-origin": "*" }); return res.end(); }
      if (single) {
        if (rows.length !== 1) return respond(res, 406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" });
        return respond(res, 200, rows[0], { "content-range": range });
      }
      return respond(res, 200, rows, { "content-range": range });
    }

    if (req.method === "POST") {
      const body = await readBody(req);
      const input = Array.isArray(body) ? body : body ? [body] : [];
      const created = [];
      for (const raw of input) {
        const row = { ...raw };
        if (COUNTS.test(t)) {
          row.status ??= "open"; row.closed_at ??= null;
          if (row.status === "open" && tables[t].some((r) => r.status === "open" && r.location_id === row.location_id)) {
            return respond(res, 409, { code: "23505", message: `duplicate key value violates unique constraint "${t}_one_open"` });
          }
        }
        if (COUNT_LINES.test(t) && tables[t.replace("_lines", "s")]?.find((c) => c.id === row.count_id)?.status !== "open") return respond(res, 400, countClosed);
        let merged = false;
        for (const cols of UNIQUE[t] || []) {
          const clash = cols.every((c) => row[c] != null) && tables[t].find((r) => cols.every((c) => r[c] === row[c]));
          if (!clash) continue;
          if (/merge-duplicates/.test(prefer)) { Object.assign(clash, row); created.push(clash); merged = true; break; }
          return respond(res, 409, { code: "23505", message: `duplicate key value violates unique constraint on ${cols.join(",")}` });
        }
        if (merged) continue;
        if (TRACKING_PREFIX[t] && row.status == null) row.status = "new";   // the column default
        if (TRACKING_PREFIX[t] && row.tracking_code == null) row.tracking_code = `${TRACKING_PREFIX[t]}-${hex4()}-${hex4()}-${hex4()}`;   // migration 32's insert trigger
        if (t === "operator_users") {   // migration 34's column defaults
          row.id ??= randomUUID(); row.version ??= 1; row.authz_version ??= 1; row.status ??= "active"; row.require_2fa ??= true;
          row.allow_perms ??= []; row.deny_perms ??= []; row.approval ??= {}; row.recovery_hashes ??= []; row.totp_last_step ??= 0; row.must_change_password ??= false;
        }
        if (t === "operator_change_requests") { row.id ??= randomUUID(); row.status ??= "pending"; row.requested_at ??= now(); }   // migration 35's defaults
        if (t === "site_content") { row.version ??= 1; row.is_published ??= false; row.sort_order ??= 0; row.publish_at ??= null; row.unpublish_at ??= null; }   // migration 42's defaults
        if (PRODUCT_TABLES.has(t)) { row.variant_of ??= null; row.variant_options ??= {}; row.variant_sort ??= 0; }   // migration 44's column defaults
        if (row.id == null) row.id = nextId(t);
        if (row.created_at == null) row.created_at = now();
        if (row.updated_at == null) row.updated_at = now();
        tables[t].push(row);
        created.push(row);
      }
      if (!wantRep) return respond(res, 201);
      return finish(created.map(clone), 201);
    }

    if (req.method === "PATCH") {
      const patch = await readBody(req);
      const hit = tables[t].filter(pred);
      if (COUNTS.test(t) && hit.some((r) => r.status !== "open")) return respond(res, 400, countClosed);
      if (COUNT_LINES.test(t) && hit.some((r) => tables[t.replace("_lines", "s")]?.find((c) => c.id === r.count_id)?.status !== "open")) return respond(res, 400, countClosed);
      if (t === "operator_users") {   // migration 34's guard trigger: the last active owner stays; `version` follows administered fields
        for (const row of hit) {
          const next = { ...row, ...patch };
          const wasOwner = row.role === "owner" && row.status === "active";
          const stays = next.role === "owner" && next.status === "active" && next.houses.length === 2;
          if (wasOwner && !stays && !tables[t].some((r) => r !== row && r.role === "owner" && r.status === "active" && r.houses.length === 2)) {
            return respond(res, 400, { code: "P0001", message: "the last active owner cannot be disabled, blocked, demoted or lose a house" });
          }
        }
        for (const row of hit) {
          const ADMIN = ["username", "display_name", "status", "role", "houses", "allow_perms", "deny_perms", "approval", "require_2fa", "password_hash", "totp_secret_enc"];
          if (ADMIN.some((c) => c in patch && JSON.stringify(patch[c]) !== JSON.stringify(row[c]))) patch.version = row.version + 1;
        }
      }
      for (const row of hit) {
        Object.assign(row, patch, { updated_at: now() }, t === "site_content" ? { version: row.version + 1 } : {});   // migration 42's guard trigger
        // migration 32's trigger: the first time a request is answered
        if (TRACKING_PREFIX[t] && !row.first_response_at && ANSWERED.includes(row.status)) row.first_response_at = now();
      }
      if (!wantRep) return respond(res, 204);
      return finish(hit.map(clone));
    }

    if (req.method === "DELETE") {
      if (COUNTS.test(t) || COUNT_LINES.test(t)) return respond(res, 400, { code: "P0001", message: "stock:never_deleted" });
      const hit = tables[t].filter(pred);
      if (PRODUCT_TABLES.has(t) && hit.some((r) => tables[t].some((k) => k.variant_of === r.id))) return respond(res, 409, { code: "23503", message: `update or delete on table "${t}" violates foreign key constraint (variant_of)` });   // ON DELETE RESTRICT
      tables[t] = tables[t].filter((r) => !hit.includes(r));
      if (!wantRep) return respond(res, 204);
      return finish(hit.map(clone));
    }

    return respond(res, 405, { message: "method not allowed" });
  });

  return {
    start: (port) => new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve); }),
    stop: () => new Promise((resolve) => server.close(resolve)),
    state: () => clone(tables),
    log: () => [...log],
    reset,
  };
}
