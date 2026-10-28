// tests/helpers/memoryAdmin.mjs — an in-memory stand-in for the Supabase service-role client, enough of the query builder for
// the account / approval / inventory stores: select / insert / update / delete / upsert with eq, neq, is, in, lt, lte, gt, gte,
// contains, or-less filters, order, limit, range, single, maybeSingle and `count`. Unique indexes and per-table triggers are
// declared by the test so the real database rules (unique username, optimistic version, last owner) can be exercised.
// Fault injection: `db.fail = (table, op) => error|null`. Stored procedures: the `rpc` option (see db.rpc).
let seq = 0;

import { parseFilterExpr, nodeTest, leafTest } from "./postgrestFilter.mjs";
export { parseFilterExpr };

export function createMemoryAdmin(seed = {}, { unique = {}, defaults = {}, beforeUpdate = {}, beforeDelete = {}, rpc = {}, schema = {}, computed = {}, maxRows = 0 } = {}) {   // maxRows: the API's silent per-request cap (PostgREST max-rows, 1000 on Supabase); 0 = none
  const tables = {};
  for (const [name, rows] of Object.entries(seed)) tables[name] = rows.map((r) => ({ ...r }));
  const db = { tables, fail: () => null, log: [] };

  const rowsOf = (t) => (tables[t] ??= []);
  const missing = (t) => (seed[t] === undefined && !(t in tables) ? { code: "42P01", message: `relation "public.${t}" does not exist` } : null);

  function from(table) {
    const state = { op: "select", filters: [], payload: null, orders: [], limit: null, count: false, returning: false, single: null, onConflict: null };
    const q = {};
    const add = (fn) => { state.filters.push(fn); return q; };
    // `select("a,b")` returns ONLY those columns, like PostgREST: a store that later reads a column it did not select gets undefined,
    // exactly as in production (a full-row stand-in once hid such a bug). "*" / no argument returns the whole row.
    q.select = (cols, opts) => {
      if (typeof cols === "string" && cols.trim() && cols.trim() !== "*") {
        const list = cols.split(",").map((c) => c.trim()).filter(Boolean);
        if (list.includes("*")) state.extra = list.filter((c) => c !== "*"); else state.cols = list;       // "*, gap_count" = the row plus a computed column
      }
      if (opts?.count) state.count = true;
      if (opts?.head) state.head = true;
      if (state.op !== "select") state.returning = true;
      return q;
    };
    q.insert = (p) => { state.op = "insert"; state.payload = p; return q; };
    q.update = (p) => { state.op = "update"; state.payload = p; return q; };
    q.delete = () => { state.op = "delete"; return q; };
    q.upsert = (p, o) => { state.op = "upsert"; state.payload = p; state.onConflict = o?.onConflict || null; return q; };
    q.eq = (c, v) => add((r) => r[c] === v);
    q.neq = (c, v) => add((r) => r[c] !== v);
    q.is = (c, v) => add((r) => (v === null ? r[c] === null || r[c] === undefined : r[c] === v));
    q.ilike = (c, pat) => add((r) => typeof r[c] === "string" && new RegExp(`^${String(pat).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".")}$`, "i").test(r[c]));
    q.not = (c, op, v) => add((r) => !(op === "is" ? (v === null ? r[c] === null || r[c] === undefined : r[c] === v) : op === "eq" ? r[c] === v : op === "in" ? (typeof v === "string" ? leafTest({ col: c, op: "in", val: v, neg: false }, r) : v.includes(r[c])) : false));
    // .or("col.ilike.%x%,and(a.eq.1,b.is.null)") — the full PostgREST grammar above; a malformed expression throws
    q.or = (expr) => { const nodes = parseFilterExpr(expr); return add((r) => nodes.some((n) => nodeTest(n, r))); };
    q.in = (c, vs) => add((r) => vs.includes(r[c]));
    q.lt = (c, v) => add((r) => r[c] < v);
    q.lte = (c, v) => add((r) => r[c] <= v);
    q.gt = (c, v) => add((r) => r[c] > v);
    q.gte = (c, v) => add((r) => r[c] >= v);
    q.contains = (c, v) => add((r) => Array.isArray(r[c]) && v.every((x) => r[c].includes(x)));
    q.containedBy = (c, v) => add((r) => Array.isArray(r[c]) && r[c].every((x) => v.includes(x)));
    q.order = (c, o) => { state.orders.push([c, o?.ascending !== false, o?.nullsFirst === true]); return q; };
    q.limit = (n) => { state.limit = n; return q; };
    q.range = (a, b) => { state.range = [a, b]; return q; };
    q.single = () => { state.single = "single"; return q; };
    q.maybeSingle = () => { state.single = "maybe"; return q; };

    const run = () => {
      const known = (c) => schema[table].includes(c) || c in (computed[table] || {});
      const unknownCol = schema[table] ? (state.cols || state.extra || []).find((c) => !known(c)) : null;      // `schema: { table: [columns] }` makes an unknown column fail like PostgreSQL (42703)
      const err = missing(table) || (unknownCol ? { code: "42703", message: `column ${table}.${unknownCol} does not exist` } : null) || db.fail(table, state.op);
      db.log.push([table, state.op]);
      if (err) return { data: null, error: err, count: null };
      const rows = rowsOf(table);
      const view = (r) => (computed[table] ? { ...r, ...Object.fromEntries(Object.entries(computed[table]).map(([k, fn]) => [k, fn(r)])) } : r);
      const match = (r) => state.filters.every((f) => f(view(r)));
      let out = [];
      if (state.op === "insert" || state.op === "upsert") {
        const list = Array.isArray(state.payload) ? state.payload : [state.payload];
        const created = [];
        for (const p of list) {
          const row = { ...(defaults[table]?.(p) || {}), ...p };
          const uniq = unique[table] || [];
          const clash = rows.find((r) => uniq.some((cols) => cols.every((c) => String(r[c]).toLowerCase() === String(row[c]).toLowerCase())));
          if (clash) {
            if (state.op === "upsert") { Object.assign(clash, p); created.push(clash); continue; }
            return { data: null, error: { code: "23505", message: `duplicate key value violates unique constraint on ${table}` }, count: null };
          }
          rows.push(row); created.push(row);
        }
        out = created;
      } else if (state.op === "update") {
        const targets = rows.filter(match);
        for (const r of targets) {
          const trig = beforeUpdate[table];
          const next = { ...r, ...state.payload };
          if (trig) { const e = trig(r, next, rows); if (e) return { data: null, error: e, count: null }; }
          Object.assign(r, next);
        }
        out = targets;
      } else if (state.op === "delete") {
        const targets = rows.filter(match);
        for (const r of targets) { const e = beforeDelete[table]?.(r, rows); if (e) return { data: null, error: e, count: null }; }
        tables[table] = rows.filter((r) => !targets.includes(r));
        out = targets;
      } else {
        out = rows.filter(match);
      }
      const total = out.length;
      if (state.orders.length) out = [...out].sort((a, b) => { const va = view(a), vb = view(b); for (const [c, asc, nullsFirst] of state.orders) { const x = va[c], y = vb[c]; if ((x == null) !== (y == null)) return (x == null ? 1 : -1) * (nullsFirst ? -1 : 1); if (x == null) continue; const d = x < y ? -1 : x > y ? 1 : 0; if (d) return d * (asc ? 1 : -1); } return 0; });
      if (state.range) out = out.slice(state.range[0], state.range[1] + 1);
      if (state.limit != null) out = out.slice(0, state.limit);
      if (maxRows && state.op === "select") out = out.slice(0, maxRows);          // the rest is dropped without an error, as the real API does
      const returning = state.op === "select" || state.returning;
      const project = (r) => { const v = view(r); if (state.cols) return Object.fromEntries(state.cols.filter((c) => c in v).map((c) => [c, v[c]])); const row = { ...r }; for (const c of state.extra || []) if (c in v) row[c] = v[c]; return row; };
      let data = returning && !state.head ? out.map(project) : null;
      if (state.single) {
        if (!returning) data = null;
        else if (data.length === 1) data = data[0];
        else if (state.single === "maybe" && data.length === 0) data = null;
        else return { data: null, error: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" }, count: null };
      }
      return { data, error: null, count: state.count ? total : null };
    };
    q.then = (resolve, reject) => Promise.resolve().then(run).then(resolve, reject);
    return q;
  }
  db.from = from;
  // stored procedures: `rpc: { name: (args, db) => ({ data, error }) }`; every call is recorded in db.rpcLog
  db.rpcLog = [];
  db.rpc = (name, args) => {
    db.rpcLog.push([name, args]);
    const fn = rpc[name];
    return Promise.resolve(fn ? fn(args, db) : { data: null, error: { code: "PGRST202", message: `function ${name} does not exist` } });
  };
  db.nextId = () => `id-${++seq}`;
  return db;
}
