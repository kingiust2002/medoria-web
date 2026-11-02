// tests/helpers/pgRpcAdmin.mjs — a service-role-client look-alike whose `rpc()` runs the REAL SQL functions on a real throw-away
// PostgreSQL cluster (tests/helpers/pgCluster.mjs), and whose tiny `from(table).select(cols).eq(col, v).maybeSingle()` reads real rows.
// It exists so the panels' real executors (lib/operator/*) can be driven end to end against real locks, real transactions and real
// timestamp precision, which no in-memory stand-in can prove. It is not a PostgREST emulation: only what those executors call.
//   const admin = pgRpcAdmin(pg);  await executeApprovedQuoteDelete({ admin, ... })
const lit = (v) => {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return `$q$${v}$q$`;
  throw new Error("pgRpcAdmin: unsupported literal");
};
const arg = (name, v) => {
  if (Array.isArray(v)) return `${name} => ARRAY[${v.map(lit).join(",")}]::bigint[]`;
  if (v && typeof v === "object") return `${name} => $q$${JSON.stringify(v)}$q$::jsonb`;
  if (v === null || v === undefined) return `${name} => NULL`;
  return `${name} => ${lit(v)}`;
};

export function pgRpcAdmin(pg, role = "service_role") {
  const run = (sql) => { const r = pg.psql(sql, { role }); return r; };
  return {
    log: [],
    async rpc(name, args = {}) {
      this.log.push(name);
      const r = run(`SELECT to_jsonb(public.${name}(${Object.entries(args).map(([k, v]) => arg(k, v)).join(", ")}))`);
      if (!r.ok) return { data: null, error: { code: /does not exist/.test(r.err) ? "42883" : "XX000", message: r.err } };
      return { data: JSON.parse(r.out), error: null };
    },
    from(table) {
      const st = { cols: "*", where: [] };
      const q = {
        select(cols) { st.cols = cols || "*"; return q; },
        eq(col, v) { st.where.push(`${col} = ${lit(v)}`); return q; },
        in(col, vals) { st.where.push(`${col} = ANY (ARRAY[${vals.map(lit).join(",")}])`); return q; },
        then(res, rej) {                                                          // awaiting the builder reads every matching row, like PostgREST
          const r = run(`SELECT COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM (SELECT ${st.cols} FROM public.${table} ${st.where.length ? "WHERE " + st.where.join(" AND ") : ""}) t), '[]'::jsonb)`);
          return Promise.resolve(r.ok ? { data: JSON.parse(r.out), error: null } : { data: null, error: { message: r.err } }).then(res, rej);
        },
        async maybeSingle() {
          const r = run(`SELECT COALESCE((SELECT to_jsonb(t) FROM (SELECT ${st.cols} FROM public.${table} ${st.where.length ? "WHERE " + st.where.join(" AND ") : ""} LIMIT 1) t), 'null'::jsonb)`);
          if (!r.ok) return { data: null, error: { message: r.err } };
          return { data: JSON.parse(r.out), error: null };
        },
      };
      return q;
    },
  };
}
