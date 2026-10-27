// The activity log of one panel: what was done, by WHICH PERSON (personal accounts), with what result, to whom, and — for catalogue
// changes — the changed fields before and after. A list of cards (not a table) so it fits a phone. Nothing here is customer data: the log
// only holds actions, table names, ids, counts, short technical details and catalogue fields.
import Link from "next/link";
import { AUDIT_LABELS } from "@/lib/operator/security";
import { getPanel } from "@/lib/panel/server";
import { formatDate, tr } from "@/lib/panel/i18n";
import { FIELD_LABELS } from "@/lib/operator/userLabels";
import { Badge } from "@/components/operator/ui";

const RESULT = { success: [tr("موفق"), "ok"], failure: [tr("ناموفق"), "warn"], rejected: [tr("رد شد"), "neutral"], attempt: [tr("تلاش"), "info"] };

function summary(row, t) {
  const d = row.detail || {};
  const parts = [];
  if (d.status) parts.push(t("وضعیت: {status}", { status: d.status }));
  if (d.is_active !== undefined) parts.push(d.is_active ? t("فعال") : t("غیرفعال"));
  if (d.price !== undefined) parts.push(t("قیمت: {price}", { price: d.price }));
  if (d.method) parts.push(t("روش: {method}", { method: d.method }));
  if (d.reason) parts.push(t("علت: {reason}", { reason: d.reason }));
  if (Array.isArray(d.fields) && d.fields.length) parts.push(t("فیلدها: {fields}", { fields: d.fields.join(t("،") + " ") }));
  if (d.rows !== undefined) parts.push(t("ردیف‌ها: {rows} (ساخت {created}، به‌روزرسانی {updated})", { rows: d.rows, created: d.created ?? 0, updated: d.updated ?? 0 }));
  return parts.join(" · ");
}
const show = (v) => (v === null || v === undefined || v === "" ? "—" : Array.isArray(v) ? v.join(", ") : typeof v === "boolean" ? (v ? "✓" : "✗") : String(v));

export default async function ActivityList({ rows, names = {}, query = {}, hasMore = false, page = 1, basePath }) {
  const { t, lang } = await getPanel();
  const link = (p) => `${basePath}?${new URLSearchParams({ ...Object.fromEntries(Object.entries(query).filter(([k, v]) => v && k !== "page")), page: String(p) })}`;
  if (!rows.length) return <p className="text-sm text-ink-muted">{t("هنوز موردی ثبت نشده است (یا مایگریشن ۳۰ اجرا نشده).")}</p>;
  return (
    <>
      <ul className="flex flex-col gap-2" data-testid="audit-list">
        {rows.map((r) => (
          <li key={r.id} className="card-flat px-4 py-3 text-sm min-w-0" data-testid="audit-row" data-action={r.action}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-medium text-ink">{AUDIT_LABELS[r.action] ? t(AUDIT_LABELS[r.action]) : r.action}</span>
              {r.result && RESULT[r.result] && <Badge tone={RESULT[r.result][1]}>{t(RESULT[r.result][0])}</Badge>}
              <span className="text-xs text-ink-muted">{formatDate(lang, r.at)}</span>
              {r.count != null && <span className="text-xs text-ink-muted">{t("{count} مورد", { count: r.count })}</span>}
            </div>
            {(r.user_id || r.target_user_id) && (
              <p className="text-xs text-ink-soft mt-1 break-words" data-testid="audit-who">
                {r.user_id ? t("توسط {name}", { name: names[r.user_id] || t("کاربر حذف‌شده") }) : null}
                {r.target_user_id ? ` · ${t("برای {name}", { name: names[r.target_user_id] || t("کاربر حذف‌شده") })}` : null}
              </p>
            )}
            <div className="text-xs text-ink-faint mt-1 flex flex-wrap gap-x-3 gap-y-0.5" dir="ltr">
              {r.entity && <span>{r.entity}</span>}
              {Array.isArray(r.entity_ids) && r.entity_ids.length > 0 && <span>#{r.entity_ids.slice(0, 6).join(", #")}{r.entity_ids.length > 6 ? ` +${r.entity_ids.length - 6}` : ""}</span>}
              {r.session_id && <span>{t("نشست {slice}", { slice: r.session_id.slice(0, 6) })}</span>}
              {r.ip_hash && <span>{t("شبکه {slice}", { slice: r.ip_hash.slice(0, 6) })}</span>}
            </div>
            {summary(r, t) && <p className="text-xs text-ink-soft mt-1">{summary(r, t)}</p>}
            {(r.before || r.after) && (
              <div className="mt-2 overflow-x-auto" data-testid="audit-change">
                <table className="text-xs min-w-[16rem]">
                  <tbody>
                    {Object.keys({ ...(r.before || {}), ...(r.after || {}) }).map((k) => (
                      <tr key={k} className="align-top">
                        <td className="pe-3 py-0.5 text-ink-muted">{FIELD_LABELS[k] ? t(FIELD_LABELS[k]) : k}</td>
                        <td className="pe-2 py-0.5 text-ink-muted break-words max-w-[10rem]">{show(r.before?.[k])}</td>
                        <td className="pe-2 py-0.5 text-ink-faint">→</td>
                        <td className="py-0.5 text-ink font-medium break-words max-w-[10rem]">{show(r.after?.[k])}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </li>
        ))}
      </ul>
      <nav className="flex gap-3 mt-4 text-sm" aria-label={t("صفحه‌بندی")}>
        {page > 1 && <Link href={link(page - 1)} className="btn-ghost size-sm">{t("قبلی")}</Link>}
        {hasMore && <Link href={link(page + 1)} className="btn-ghost size-sm" data-testid="audit-next">{t("بعدی")}</Link>}
      </nav>
    </>
  );
}
