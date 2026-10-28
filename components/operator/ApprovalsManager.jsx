"use client";
// The approval queue, shared by the Health and the Beauty panel (each passes its own server actions). A reviewer sees what was asked, the
// old and the proposed values, approves (the change is applied at that moment, only if the record is still as it was) or rejects with a
// reason. A requester sees the status and the reason, can withdraw a pending request, and can ask again after a rejection. The server
// decides everything; this is the convenience.
import ListPager from "@/components/operator/ListPager";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/shared/Icon";
import { Badge, EmptyState, SectionCard, Spinner, Textarea } from "@/components/operator/ui";
import { useT, usePanelLang } from "@/components/panel/PanelI18n";
import { formatDate, tr } from "@/lib/panel/i18n";
import { FIELD_LABELS, OPERATION_LABELS } from "@/lib/operator/userLabels";

const STATUS = {
  pending: { label: tr("منتظر تأیید"), tone: "warn" }, approved: { label: tr("تأیید و اجرا شد"), tone: "ok" }, rejected: { label: tr("رد شد"), tone: "neutral" },
  cancelled: { label: tr("پس گرفته شد"), tone: "neutral" }, superseded: { label: tr("منتفی شد"), tone: "neutral" }, failed: { label: tr("اجرا نشد"), tone: "warn" },
};

function show(v) {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "✓" : "✗";
  if (Array.isArray(v)) return v.join(", ") || "—";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return s.length > 160 ? `${s.slice(0, 160)}…` : s;
}

function Diff({ before, proposed }) {
  const t = useT();
  const keys = Object.keys(proposed || {}).filter((k) => !k.startsWith("_"));       // _-prefixed keys are the executor's arguments, not for a reviewer
  if (!keys.length) return null;
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-xs min-w-[18rem]">
        <thead><tr className="text-ink-muted text-start"><th className="px-1 py-1 text-start font-medium">{t("فیلد")}</th><th className="px-1 py-1 text-start font-medium">{t("قبلی")}</th><th className="px-1 py-1 text-start font-medium">{t("پیشنهادی")}</th></tr></thead>
        <tbody>
          {keys.map((k) => (
            <tr key={k} className="border-t border-line align-top">
              <td className="px-1 py-1.5 text-ink-soft">{FIELD_LABELS[k] ? t(FIELD_LABELS[k]) : k}</td>
              <td className="px-1 py-1.5 text-ink-muted break-words max-w-[10rem]" data-testid="diff-old">{show(before?.[k])}</td>
              <td className="px-1 py-1.5 text-ink font-medium break-words max-w-[10rem]" data-testid="diff-new">{show(proposed[k])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Card({ r, mode, actions, onResult }) {
  const t = useT();
  const { lang } = usePanelLang();
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  const st = STATUS[r.status] || STATUS.pending;

  async function run(fn, okText) {
    setBusy(true); setErr("");
    const res = await fn().catch(() => null);
    setBusy(false);
    if (res?.ok) { setRejecting(false); setReason(""); onResult(res.message ? t(res.message) : okText); }
    else { setErr(t(res?.error) || t("ذخیره نشد. دوباره تلاش کنید.")); onResult(null, true); }
  }

  return (
    <li className="card p-4 grid gap-3" data-testid="request" data-status={r.status}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-ink break-words">{t(OPERATION_LABELS[r.operation] || r.operation)}{r.subject ? <span className="text-ink-muted font-normal"> · {r.subject}</span> : null}</p>
          <p className="text-[11px] text-ink-faint mt-0.5">
            {mode === "review" ? t("از طرف {name}", { name: r.requestedBy || "—" }) + " · " : ""}
            {formatDate(lang, r.requestedAt, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
            {r.resubmitted ? " · " + t("ارسال دوباره") : ""}
          </p>
        </div>
        <Badge tone={st.tone}>{t(st.label)}</Badge>
      </div>
      <Diff before={r.before} proposed={r.proposed} />
      {r.reason && <p className="text-xs text-ink-soft break-words">{r.reason}</p>}
      {r.status === "rejected" && r.reviewReason && <p className="text-xs text-warn break-words" data-testid="review-reason">{t("دلیل رد: {reason}", { reason: r.reviewReason })}{r.reviewedBy ? ` — ${r.reviewedBy}` : ""}</p>}
      {r.status === "failed" && <p className="text-xs text-warn break-words">{r.execError === "stale" ? t("پس از ثبت درخواست، این رکورد تغییر کرده بود؛ تغییر اعمال نشد.") : t("اجرای تغییر ناموفق بود؛ چیزی تغییر نکرد.")}</p>}
      {err && <p role="alert" className="text-xs text-warn break-words">{err}</p>}

      {mode === "review" && r.status === "pending" && (
        <div className="grid gap-2">
          {rejecting && <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("دلیل رد (لازم)")} aria-label={t("دلیل رد (لازم)")} />}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary size-sm" disabled={busy} data-testid="approve" onClick={() => run(() => actions.approve(r.id), t("تأیید شد و اعمال شد."))}>{busy ? <Spinner /> : <Icon name="check" size={16} />} {t("تأیید و اعمال")}</button>
            {!rejecting
              ? <button type="button" className="btn-ghost size-sm" disabled={busy} data-testid="reject" onClick={() => setRejecting(true)}>{t("رد")}</button>
              : <button type="button" className="btn-ghost size-sm" disabled={busy || reason.trim().length < 3} data-testid="reject-confirm" onClick={() => run(() => actions.reject(r.id, reason), t("رد شد."))}>{t("ثبت رد")}</button>}
          </div>
        </div>
      )}
      {mode === "mine" && r.status === "pending" && (
        <div><button type="button" className="btn-ghost size-sm" disabled={busy} data-testid="cancel" onClick={() => run(() => actions.cancel(r.id), t("درخواست پس گرفته شد."))}>{t("پس گرفتن")}</button></div>
      )}
      {mode === "mine" && ["rejected", "failed", "superseded", "cancelled"].includes(r.status) && (
        <div><button type="button" className="btn-ghost size-sm" disabled={busy} data-testid="resubmit" onClick={() => run(() => actions.resubmit(r.id), t("دوباره ارسال شد."))}>{t("ارسال دوباره")}</button></div>
      )}
    </li>
  );
}

export default function ApprovalsManager({ toReview, mine, minePaging = null, basePath = "", loadError, sent, actions }) {
  const t = useT();
  const router = useRouter();
  const [notice, setNotice] = useState(sent ? t("برای تأیید ارسال شد؛ تا زمان تأیید، چیزی در سایت تغییر نمی‌کند.") : "");
  const onResult = (message, failed) => { if (message) setNotice(message); router.refresh(); void failed; };
  return (
    <div className="grid gap-5">
      {loadError && <div role="alert" className="card p-4 text-sm text-warn">{t(loadError)}</div>}
      {notice && <div role="status" className="card p-3 text-sm text-ink-soft flex items-start justify-between gap-3"><span className="min-w-0 break-words">{notice}</span><button type="button" onClick={() => setNotice("")} aria-label={t("بستن")} className="text-ink-muted shrink-0"><Icon name="close" size={16} /></button></div>}

      <SectionCard title={t("منتظر بررسی شما")} icon="check" desc={t("تغییرهایی که همکاران خواسته‌اند؛ تا تأیید نشوند، چیزی در سایت عوض نمی‌شود.")}>
        {toReview.length === 0 ? <EmptyState icon="check" title={t("موردی برای بررسی نیست")} /> : (
          <ul className="grid gap-3" data-testid="to-review">{toReview.map((r) => <Card key={r.id} r={r} mode="review" actions={actions} onResult={onResult} />)}</ul>
        )}
      </SectionCard>

      <SectionCard title={t("درخواست‌های من")} icon="clock" desc={t("وضعیت تغییرهایی که برای تأیید فرستاده‌اید.")}>
        {mine.length === 0 ? <EmptyState icon="clock" title={t("هنوز درخواستی نفرستاده‌اید")} /> : (
          <ul className="grid gap-3" data-testid="mine">{mine.map((r) => <Card key={r.id} r={r} mode="mine" actions={actions} onResult={onResult} />)}</ul>
        )}
        {minePaging && minePaging.total > minePaging.size && <ListPager data={minePaging} href={(change) => (change.page > 1 ? `${basePath}?page=${change.page}` : basePath)} />}
      </SectionCard>
    </div>
  );
}
