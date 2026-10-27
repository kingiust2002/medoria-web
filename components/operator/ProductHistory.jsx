"use client";
// The change history of one product, for BOTH panels: who changed what and when (only the fields that changed, old → new), and "revert
// this change" (the old values go back as a NEW change, recorded like any other; price / visibility keep their own rights and the
// approval queue). The server decides again on every revert.
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Icon from "@/components/shared/Icon";
import { PageHeader, Badge, EmptyState, Spinner } from "@/components/operator/ui";
import { useT, usePanelLang } from "@/components/panel/PanelI18n";
import { useCan } from "@/components/panel/Capabilities";
import { FIELD_LABELS } from "@/lib/operator/userLabels";
import { revertPlan } from "@/lib/operator/productVersions";
import { tr } from "@/lib/panel/i18n";

const KIND = { update: tr("ویرایش"), restore: tr("برگرداندن"), quick: tr("تغییر سریع"), approval: tr("تأییدشده"), create: tr("ساخت") };
const KIND_TONE = { update: "neutral", restore: "violet", quick: "muted", approval: "ok", create: "ok" };

const show = (v) => {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "✓" : "✗";
  if (typeof v === "object") { const s = JSON.stringify(v); return s.length > 120 ? `${s.slice(0, 120)}…` : s; }
  const s = String(v);
  return s.length > 160 ? `${s.slice(0, 160)}…` : s;
};

function Confirm({ plan, version, onCancel, onConfirm, busy, error, current }) {
  const t = useT();
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" onClick={onCancel} role="dialog" aria-modal="true" aria-label={t("برگرداندن این تغییر")}>
      <div className="absolute inset-0 bg-navy/40 backdrop-blur-sm" />
      <div onClick={(e) => e.stopPropagation()} className="relative card p-5 sm:p-6 w-full max-w-lg max-h-[90vh] overflow-auto min-w-0" data-testid="revert-dialog">
        <h2 className="font-bold text-lg text-ink mb-3">{t("برگرداندن این تغییر")}</h2>
        {error && <div role="alert" className="mb-3 text-sm rounded-xl px-3 py-2.5 bg-warn/10 text-warn break-words">{error}</div>}
        <p className="text-sm text-ink-soft mb-3">{t("این مقدارها جایگزین مقدار فعلی می‌شوند:")}</p>
        <ul className="flex flex-col gap-2 mb-3">
          {Object.entries(plan.fields).map(([k, v]) => (
            <li key={k} className="text-sm min-w-0 break-words" data-testid="revert-field">
              <b>{FIELD_LABELS[k] ? t(FIELD_LABELS[k]) : k}</b>: <span className="text-ink-muted">{show(current[k])}</span> → <span className="text-ink font-medium">{show(v)}</span>
              {plan.changedSince.includes(k) && <Badge tone="warn" className="ms-2">{t("بعد از آن دوباره تغییر کرده")}</Badge>}
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <button type="button" onClick={onConfirm} disabled={busy} className="btn-primary size-md flex-1 disabled:opacity-60" data-testid="revert-confirm">{busy ? <Spinner /> : <Icon name="refresh" size={17} />} {t("برگردان")}</button>
          <button type="button" onClick={onCancel} className="btn-ghost size-md">{t("انصراف")}</button>
        </div>
      </div>
    </div>
  );
}

export default function ProductHistory({ product, versions, unavailable, actions, base }) {
  const t = useT();
  const { date: fmtDate } = usePanelLang();
  const router = useRouter();
  const canRevert = useCan("products.restore_version");
  const [confirm, setConfirm] = useState(null);       // { version, plan }
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();

  function run() {
    setErr("");
    start(async () => {
      const res = await actions.restoreProductVersion(product.id, confirm.version.id, product.updated_at);
      if (res.ok && res.pending) { setConfirm(null); setMsg({ ok: true, text: t(res.message) }); return; }
      if (res.ok) { setConfirm(null); setMsg({ ok: true, text: t("تغییر برگردانده شد.") }); router.refresh(); return; }
      setErr(t(res.error));
      if (res.conflict) router.refresh();
    });
  }

  return (
    <>
      <PageHeader title={t("تاریخچهٔ نسخه‌ها")} subtitle={<span dir="auto" className="break-words">{product.sku || product.name_en || product.name_fa}</span>}>
        <Link href={`${base}/${product.id}/edit`} className="btn-ghost size-md">{t("بازگشت به محصول")}</Link>
      </PageHeader>
      {msg && <div role="status" className="mb-4 text-sm rounded-xl px-3 py-2.5 bg-ok/10 text-ok break-words" data-testid="history-msg">{msg.text}</div>}
      {unavailable && <div role="alert" className="mb-4 text-sm rounded-xl px-3 py-2.5 bg-warn/10 text-warn">{t(unavailable)}</div>}
      {!unavailable && versions.length === 0 ? (
        <EmptyState icon="clock" title={t("هنوز تغییری ثبت نشده")} desc={t("از این پس هر تغییر محصول اینجا نگه‌داری می‌شود.")} />
      ) : (
        <ol className="flex flex-col gap-3" data-testid="history-list">
          {versions.map((v) => {
            const plan = revertPlan(product, v);
            const can = canRevert && Object.keys(plan.fields).length > 0;
            return (
              <li key={v.id} className="card p-3 sm:p-4 min-w-0" data-testid="history-item" data-kind={v.kind}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mb-2 min-w-0">
                  <Badge tone={KIND_TONE[v.kind] || "neutral"}>{t(KIND[v.kind] || v.kind)}</Badge>
                  <span className="text-sm text-ink-soft">{fmtDate(v.created_at)}</span>
                  <span className="text-sm text-ink-muted min-w-0 break-words">{v.actor_label || ""}</span>
                  {can && <button type="button" className="btn-ghost size-sm ms-auto" onClick={() => setConfirm({ version: v, plan })} data-testid="revert-open">{t("برگرداندن این تغییر")}</button>}
                </div>
                <ul className="flex flex-col gap-1">
                  {(v.changed || []).map((k) => (
                    <li key={k} className="text-sm min-w-0 break-words">
                      <b>{FIELD_LABELS[k] ? t(FIELD_LABELS[k]) : k}</b>: <span className="text-ink-muted">{show(v.before?.[k])}</span> → <span className="text-ink">{show(v.after?.[k])}</span>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ol>
      )}
      {confirm && <Confirm plan={confirm.plan} version={confirm.version} current={product} busy={pending} error={err} onCancel={() => { setConfirm(null); setErr(""); }} onConfirm={run} />}
    </>
  );
}
