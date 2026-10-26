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

export const ANON_KEY = "anon-test-key";
export const SERVICE_KEY = "service-test-key";

const RESERVED = new Set(["select", "order", "limit", "offset", "on_conflict", "columns"]);
// unique constraints, as lists of column sets
const UNIQUE = {
  products: [["slug"]], beauty_products: [["slug"]], categories: [["slug"]], beauty_categories: [["slug"]],
  operator_sessions: [["sid"]], operator_totp_state: [["panel"]], operator_recovery_used: [["panel", "code_hash"]],
};

const clone = (x) => JSON.parse(JSON.stringify(x));
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
    default: r = true;   // operators the app does not use (cs, ov, fts ...)
  }
  return neg ? !r : r;
}

function buildPredicate(searchParams) {
  const preds = [];
  for (const [key, value] of searchParams) {
    if (RESERVED.has(key)) continue;
    if (key === "or") {
      const alts = splitTop(value.replace(/^\(|\)$/g, "")).map((a) => { const i = a.indexOf("."); return [a.slice(0, i), a.slice(i + 1)]; });
      preds.push((row) => alts.some(([c, e]) => test(row, c, e)));
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

    if (rpc) { await readBody(req); return respond(res, 200, null); }
    if (!m) return respond(res, 404, { message: "not found" });

    const t = m[1];
    const fault = faults.find((f) => f.table === t && f.method === req.method);
    if (fault) { await readBody(req); return respond(res, fault.status, { code: fault.code || "XX000", message: fault.message || "injected fault" }); }
    const prefer = String(req.headers.prefer || "");
    const wantRep = /return=representation/.test(prefer);
    const wantCount = /count=/.test(prefer);
    const single = /vnd\.pgrst\.object/.test(String(req.headers.accept || ""));
    tables[t] = tables[t] || [];
    const pred = buildPredicate(url.searchParams);

    const finish = (rows, status = 200) => {
      if (single) {
        if (rows.length !== 1) return respond(res, 406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" });
        return respond(res, status, rows[0]);
      }
      return respond(res, status, rows);
    };

    if (req.method === "GET" || req.method === "HEAD") {
      let rows = tables[t].filter(pred);
      const total = rows.length;
      rows = applyOrder(rows, url.searchParams.get("order"));
      const off = Number(url.searchParams.get("offset") || 0);
      const lim = url.searchParams.get("limit");
      rows = rows.slice(off, lim != null ? off + Number(lim) : undefined);
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
        for (const cols of UNIQUE[t] || []) {
          if (cols.every((c) => row[c] != null) && tables[t].some((r) => cols.every((c) => r[c] === row[c]))) {
            return respond(res, 409, { code: "23505", message: `duplicate key value violates unique constraint on ${cols.join(",")}` });
          }
        }
        if (TRACKING_PREFIX[t] && row.status == null) row.status = "new";   // the column default
        if (TRACKING_PREFIX[t] && row.tracking_code == null) row.tracking_code = `${TRACKING_PREFIX[t]}-${hex4()}-${hex4()}-${hex4()}`;   // migration 32's insert trigger
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
      for (const row of hit) {
        Object.assign(row, patch, { updated_at: now() });
        // migration 32's trigger: the first time a request is answered
        if (TRACKING_PREFIX[t] && !row.first_response_at && ANSWERED.includes(row.status)) row.first_response_at = now();
      }
      if (!wantRep) return respond(res, 204);
      return finish(hit.map(clone));
    }

    if (req.method === "DELETE") {
      const hit = tables[t].filter(pred);
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
