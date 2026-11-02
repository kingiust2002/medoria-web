// lib/operator/bulkScope.js — "all filtered results" for bulk actions (N9). A bulk action normally works on the rows ticked on the CURRENT PAGE. Here the
// person asks for every row the current filters match: the server runs the SAME filtered query the list uses (productScope / applyQuoteFilters), refuses
// when the number of rows is not the number the screen showed (the list changed meanwhile — nothing is applied) or when it is above the ceiling, and only
// then hands the ids to the ordinary bulk action. Plain module (the client is passed in): unit-tested.
import { tr } from "../panel/i18n.js";
import { parseProductParams, parseQuoteParams, applyQuoteFilters, readAll } from "./listQuery.js";
import { productScope, HOUSE_TABLES } from "./listReaders.js";
import { teamDay } from "./quoteOps.js";

export const SCOPE_MAX = 2000;

export const SCOPE_MESSAGES = {
  changed: tr("فهرست در این فاصله تغییر کرده است (تعداد نتایج دیگر همان نیست)؛ چیزی اعمال نشد. صفحه را تازه کنید و دوباره انتخاب کنید."),
  tooMany: tr("نتایج فیلترشده از ۲۰۰۰ مورد بیشترند؛ فیلتر را دقیق‌تر کنید."),
  unavailable: tr("خواندن نتایج فیلترشده ناموفق بود؛ چیزی اعمال نشد."),
  none: tr("هیچ نتیجه‌ای با این فیلترها نیست."),
};

function finish(read, expectedTotal) {
  if (!read.ok) return { ok: false, error: SCOPE_MESSAGES.unavailable };
  const ids = read.rows.map((r) => r.id);
  if (ids.length > SCOPE_MAX) return { ok: false, error: SCOPE_MESSAGES.tooMany, total: ids.length };
  if (!ids.length) return { ok: false, error: SCOPE_MESSAGES.none };
  if (!Number.isInteger(Number(expectedTotal)) || Number(expectedTotal) !== ids.length) return { ok: false, error: SCOPE_MESSAGES.changed, scopeChanged: true, total: ids.length };
  return { ok: true, ids, total: ids.length };
}

// raw = what the address of the list holds (the same cleaning as the page). → { ok, ids, total } | { ok: false, error }
export async function resolveProductScope(admin, house, raw, expectedTotal) {
  const params = parseProductParams(raw);
  const scope = await productScope(admin, house, params);
  if (!scope.ok) return { ok: false, error: SCOPE_MESSAGES.unavailable };
  const table = HOUSE_TABLES[house].products;
  const read = await readAll((from, to) => scope.apply(admin.from(table).select("id")).order("id", { ascending: true }).range(from, to), { maxRows: SCOPE_MAX + 1 });
  return finish(read, expectedTotal);
}

export async function resolveQuoteScope(admin, house, raw, expectedTotal, now = Date.now()) {
  const params = parseQuoteParams(raw);
  const table = HOUSE_TABLES[house].quotes;
  const read = await readAll((from, to) => applyQuoteFilters(admin.from(table).select("id"), params, { now, today: teamDay(now) }).order("id", { ascending: true }).range(from, to), { maxRows: SCOPE_MAX + 1 });
  return finish(read, expectedTotal);
}

// The words a screen shows to describe the filters of the list the action will run on (in the person's language, via the panel's t()).
export function describeProductFilters(p, t, { catName = (c) => c } = {}) {
  const out = [];
  if (p.q) out.push(t("متن: «{q}»", { q: p.q }));
  if (p.cat) out.push(t("دسته: {cat}", { cat: catName(p.cat) }));
  if (p.stock === "in") out.push(t("موجود")); else if (p.stock === "out") out.push(t("ناموجود"));
  if (p.status === "active") out.push(t("فعال")); else if (p.status === "inactive") out.push(t("غیرفعال"));
  if (p.complete === "incomplete") out.push(t("ناقص")); else if (p.complete === "complete") out.push(t("کامل"));
  return out.length ? out.join(t("،") + " ") : t("بدون فیلتر (همهٔ محصولات)");
}
