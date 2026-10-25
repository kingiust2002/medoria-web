"use client";
// Confirmation dialog for deleting SEVERAL customer requests at once. Shared by
// the Health and Beauty panels; each passes its own server action as `onDelete`.
import { useState } from "react";
import Icon from "@/components/shared/Icon";
import { Spinner } from "@/components/operator/ui";

const SHOWN = 5;

function faDate(v) { try { return new Date(v).toLocaleString("fa-IR", { dateStyle: "medium", timeStyle: "short" }); } catch { return "—"; } }

export default function BulkDeleteQuotesModal({ quotes, onClose, onDelete, onDone }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const n = quotes.length;

  async function run() {
    setErr(""); setBusy(true);
    let res;
    try { res = await onDelete(quotes.map((q) => q.id)); } catch { res = null; }
    setBusy(false);
    if (res?.ok || res?.notFound) onDone(res);       // gone either way: refresh the list
    else setErr(res?.error || "حذف ناموفق بود. دوباره تلاش کنید.");
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" onClick={busy ? undefined : onClose}>
      <div className="absolute inset-0 bg-navy/40 backdrop-blur-sm" />
      <div onClick={(e) => e.stopPropagation()} dir="rtl" role="dialog" aria-modal="true" aria-labelledby="del-quotes-title" className="relative card p-6 w-full max-w-md max-h-[90vh] overflow-y-auto animate-fade-in">
        <div className="flex items-center justify-between mb-4">
          <h2 id="del-quotes-title" className="font-bold text-lg text-ink">حذف {n} درخواست؟</h2>
          <button type="button" onClick={onClose} disabled={busy} aria-label="بستن" className="grid place-items-center w-9 h-9 rounded-lg hover:bg-line-soft text-ink-muted"><Icon name="close" size={18} /></button>
        </div>

        {err && <div role="alert" className="mb-4 text-sm rounded-xl px-3 py-2.5 flex items-center gap-2 bg-warn/10 text-warn"><Icon name="alertTriangle" size={16} /> {err}</div>}

        <ul className="rounded-xl bg-canvas-soft border border-line p-3 text-sm grid gap-2 mb-3">
          {quotes.slice(0, SHOWN).map((q) => (
            <li key={q.id} className="min-w-0">
              <p className="font-medium text-ink truncate">{q.name || "بدون نام"}{q.organization ? <span className="text-ink-faint font-normal"> · {q.organization}</span> : null}</p>
              <p className="text-xs text-ink-muted truncate">{q.product_name || "درخواست عمومی"} · {faDate(q.created_at)}</p>
            </li>
          ))}
          {n > SHOWN && <li className="text-xs text-ink-muted">و {n - SHOWN} درخواست دیگر</li>}
        </ul>

        <p className="text-sm text-ink-soft leading-relaxed">
          این درخواست‌ها برای همیشه حذف می‌شوند و قابل بازگشت نیستند. اگر فقط می‌خواهید آن‌ها را کنار بگذارید، به‌جای حذف «آرشیو» یا «اسپم» کنید.
        </p>

        <div className="flex gap-2 mt-5">
          <button type="button" onClick={run} disabled={busy} className="btn-primary size-md flex-1 disabled:opacity-60 !bg-warn hover:!bg-warn/90">
            {busy ? <Spinner /> : <Icon name="trash" size={17} />}{busy ? "در حال حذف…" : `حذف ${n} درخواست`}
          </button>
          <button type="button" onClick={onClose} disabled={busy} className="btn-ghost size-md">انصراف</button>
        </div>
      </div>
    </div>
  );
}
