// lib/operator/auditView.js — reading the activity log for people who may (audit.view): filtered, paged, with the NAMES of the people
// involved, and a CSV for those who may export it (audit.export). Plain module; the log itself never holds customer data
// (security.js writeAudit), and `before`/`after` carry only catalogue fields.
import { isMissingTable } from "./security.js";
import { toCsv } from "./csv.js";
import { readAll } from "./listQuery.js";

export const AUDIT_PAGE_SIZE = 50;
export const RESULTS = ["attempt", "success", "failure", "rejected"];

export function cleanFilters(q = {}) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const f = {};
  if (typeof q.who === "string" && uuid.test(q.who)) f.who = q.who;
  if (typeof q.result === "string" && RESULTS.includes(q.result)) f.result = q.result;
  if (typeof q.action === "string" && /^[a-z0-9_.]{1,40}$/.test(q.action)) f.action = q.action;
  if (typeof q.from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(q.from)) f.from = q.from;
  if (typeof q.to === "string" && /^\d{4}-\d{2}-\d{2}$/.test(q.to)) f.to = q.to;
  const page = Number(q.page);
  f.page = Number.isInteger(page) && page >= 1 && page <= 10000 ? page : 1;
  return f;
}

function applyFilters(query, f) {
  if (f.who) query = query.eq("user_id", f.who);
  if (f.result) query = query.eq("result", f.result);
  if (f.action) query = query.eq("action", f.action);
  if (f.from) query = query.gte("at", `${f.from}T00:00:00.000Z`);
  if (f.to) query = query.lte("at", `${f.to}T23:59:59.999Z`);
  return query;
}

// → { ok, rows, names, page, hasMore }   (names: user id → display name)
export async function readAudit(admin, { panel, filters, pageSize = AUDIT_PAGE_SIZE }) {
  if (!admin) return { ok: false, rows: [], names: {}, page: 1, hasMore: false };
  const f = cleanFilters(filters);
  const from = (f.page - 1) * pageSize;
  const q = applyFilters(admin.from("operator_audit_log").select("*").eq("panel", panel), f).order("id", { ascending: false }).range(from, from + pageSize);   // one extra row = "there is a next page"
  const { data, error } = await q;
  if (error) return { ok: false, unavailable: isMissingTable(error), rows: [], names: {}, page: f.page, hasMore: false };
  const rows = (data || []).slice(0, pageSize);
  const ids = [...new Set(rows.flatMap((r) => [r.user_id, r.target_user_id]).filter(Boolean))];
  let names = {};
  if (ids.length) {
    const users = await admin.from("operator_users").select("id,display_name").in("id", ids);
    names = Object.fromEntries((users.data || []).map((u) => [u.id, u.display_name]));
  }
  return { ok: true, rows, names, page: f.page, hasMore: (data || []).length > pageSize };
}

// The people to choose in the filter (only those who appear in this house's panel).
export async function auditPeople(admin, panel) {
  if (!admin) return [];
  const { data } = await admin.from("operator_users").select("id,display_name,houses").order("display_name", { ascending: true });
  return (data || []).filter((u) => (u.houses || []).includes(panel)).map((u) => ({ id: u.id, name: u.display_name }));
}

// CSV of EVERY row of the filtered log (read in chunks; more than 200,000 rows is an error, never a cut-off file): technical columns only,
// every cell safe against spreadsheet formulas.
export async function auditCsv(admin, { panel, filters }) {
  const f = cleanFilters(filters);
  const got = await readAll((from, to) => applyFilters(admin.from("operator_audit_log").select("*").eq("panel", panel), f).order("id", { ascending: false }).range(from, to));
  if (!got.ok) return { ok: false };
  const data = got.rows;
  const ids = [...new Set((data || []).flatMap((r) => [r.user_id, r.target_user_id]).filter(Boolean))];
  const names = ids.length ? Object.fromEntries(((await admin.from("operator_users").select("id,display_name").in("id", ids)).data || []).map((u) => [u.id, u.display_name])) : {};
  const head = ["time", "action", "result", "person", "target person", "entity", "ids", "request", "before", "after", "detail"];
  const rows = (data || []).map((r) => [
    r.at, r.action, r.result || "", names[r.user_id] || "", names[r.target_user_id] || "", r.entity || "", (r.entity_ids || []).join(" "), r.request_id || "",
    r.before ? JSON.stringify(r.before) : "", r.after ? JSON.stringify(r.after) : "", r.detail ? JSON.stringify(r.detail) : "",
  ]);
  return { ok: true, csv: toCsv(head, rows), count: rows.length };       // toCsv guards every cell against spreadsheet formulas
}
