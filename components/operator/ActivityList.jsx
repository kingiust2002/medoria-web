// The activity log of one panel: what was done, when, how many items, from which session. A list of
// cards (not a table) so it fits a phone. Nothing here is customer data: the log only holds actions,
// table names, ids, counts and short technical details.
import { AUDIT_LABELS } from "@/lib/operator/security";

function faDate(v) { try { return new Date(v).toLocaleString("fa-IR", { dateStyle: "medium", timeStyle: "short" }); } catch { return "—"; } }

function summary(row) {
  const d = row.detail || {};
  const parts = [];
  if (d.status) parts.push(`وضعیت: ${d.status}`);
  if (d.is_active !== undefined) parts.push(d.is_active ? "فعال" : "غیرفعال");
  if (d.price !== undefined) parts.push(`قیمت: ${d.price}`);
  if (d.method) parts.push(`روش: ${d.method}`);
  if (d.reason) parts.push(`علت: ${d.reason}`);
  if (Array.isArray(d.fields) && d.fields.length) parts.push(`فیلدها: ${d.fields.join("، ")}`);
  if (d.rows !== undefined) parts.push(`ردیف‌ها: ${d.rows} (ساخت ${d.created ?? 0}، به‌روزرسانی ${d.updated ?? 0})`);
  return parts.join(" · ");
}

export default function ActivityList({ rows }) {
  if (!rows.length) return <p className="text-sm text-ink-muted">هنوز موردی ثبت نشده است (یا مایگریشن ۳۰ اجرا نشده).</p>;
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => (
        <li key={r.id} className="card-flat px-4 py-3 text-sm min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-medium text-ink">{AUDIT_LABELS[r.action] || r.action}</span>
            <span className="text-xs text-ink-muted">{faDate(r.at)}</span>
            {r.count != null && <span className="text-xs text-ink-muted">{r.count} مورد</span>}
          </div>
          <div className="text-xs text-ink-faint mt-1 flex flex-wrap gap-x-3 gap-y-0.5" dir="ltr">
            {r.entity && <span>{r.entity}</span>}
            {Array.isArray(r.entity_ids) && r.entity_ids.length > 0 && <span>#{r.entity_ids.slice(0, 6).join(", #")}{r.entity_ids.length > 6 ? ` +${r.entity_ids.length - 6}` : ""}</span>}
            {r.session_id && <span>نشست {r.session_id.slice(0, 6)}</span>}
            {r.ip_hash && <span>شبکه {r.ip_hash.slice(0, 6)}</span>}
          </div>
          {summary(r) && <p className="text-xs text-ink-soft mt-1">{summary(r)}</p>}
        </li>
      ))}
    </ul>
  );
}
