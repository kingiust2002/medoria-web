// tests/helpers/postgrestFilter.mjs — the PostgREST filter-expression grammar for the test doubles (the in-memory client and the e2e fake database).
// ── PostgREST filter-expression grammar (the argument of .or()) ───────────────────────────────────────────────────────────
// expr  := item ( "," item )*            top-level commas only: commas inside ( ) belong to the item
// item  := ("and" | "or") "(" expr ")"  |  column "." ["not."] op "." value
// A string that does not parse throws, so a test fails on a malformed expression exactly as PostgREST would answer 400.
export function splitTop(s) {
  const out = []; let depth = 0, cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  if (depth !== 0) throw new Error(`unbalanced parentheses in filter: ${s}`);
  out.push(cur);
  return out;
}
const OPS = ["eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "is", "in", "cs", "cd"];
export function parseItem(item) {
  const grp = /^(and|or)\((.*)\)$/s.exec(item);
  if (grp) return { type: grp[1], children: splitTop(grp[2]).map(parseItem) };
  const m = /^([A-Za-z_][\w]*)\.(not\.)?(\w+)\.(.*)$/s.exec(item);
  if (!m || !OPS.includes(m[3])) throw new Error(`bad filter item: ${item}`);
  return { type: "leaf", col: m[1], neg: Boolean(m[2]), op: m[3], val: m[4] };
}
const likeRe = (pat, flags) => { let out = ""; for (let i = 0; i < pat.length; i++) { const ch = pat[i]; if (ch === "\\" && (pat[i + 1] === "%" || pat[i + 1] === "_")) { out += pat[++i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); continue; } out += ch === "%" || ch === "*" ? ".*" : ch === "_" ? "." : ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); } return new RegExp(`^${out}$`, flags); };
const cmp = (a, b) => { const na = Number(a), nb = Number(b); return typeof a !== "string" && Number.isFinite(na) && b !== "" && Number.isFinite(nb) ? na - nb : String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0; };
export function leafTest(n, r) {
  const v = r[n.col];
  let ok;
  switch (n.op) {
    case "is": ok = n.val === "null" ? v === null || v === undefined : n.val === "true" ? v === true : n.val === "false" ? v === false : false; break;
    case "eq": ok = v !== null && v !== undefined && String(v) === n.val; break;
    case "neq": ok = v !== null && v !== undefined && String(v) !== n.val; break;
    case "gt": ok = v != null && cmp(v, n.val) > 0; break;
    case "gte": ok = v != null && cmp(v, n.val) >= 0; break;
    case "lt": ok = v != null && cmp(v, n.val) < 0; break;
    case "lte": ok = v != null && cmp(v, n.val) <= 0; break;
    case "like": ok = typeof v === "string" && likeRe(n.val, "").test(v); break;
    case "ilike": ok = typeof v === "string" && likeRe(n.val, "i").test(v); break;
    case "in": { const m = /^\((.*)\)$/s.exec(n.val); if (!m) throw new Error(`bad in list: ${n.val}`); ok = v != null && splitTop(m[1]).map((x) => x.replace(/^"|"$/g, "")).includes(String(v)); break; }
    default: throw new Error(`operator ${n.op} is not supported by the test double`);
  }
  return n.neg ? !ok : ok;
}
export const nodeTest = (n, r) => (n.type === "and" ? n.children.every((c) => nodeTest(c, r)) : n.type === "or" ? n.children.some((c) => nodeTest(c, r)) : leafTest(n, r));
export const parseFilterExpr = (expr) => splitTop(String(expr)).map(parseItem);


