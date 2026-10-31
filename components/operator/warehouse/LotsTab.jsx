"use client";
// components/operator/warehouse/LotsTab.jsx — lots (batches), expiry dates and quarantine (migration 45) in the warehouse screen of BOTH panels:
// the alert strip, the chips under a product, the lots list with its history, and the dialog that quarantines / releases / rejects a lot or
// corrects its expiry date. The server decides again on every action (inventory.quarantine); the database refuses what is not allowed.
import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Icon from "@/components/shared/Icon";
import { Field, Input, Select, Textarea, Badge, EmptyState, Spinner } from "@/components/operator/ui";
import TabPager from "@/components/operator/warehouse/TabPager";
import { Modal, Err } from "@/components/operator/warehouse/WhUi";
import { useT, usePanelLang } from "@/components/panel/PanelI18n";
import { useCan } from "@/components/panel/Capabilities";
import { tr } from "@/lib/panel/i18n";
import { EXPIRING_DAYS } from "@/lib/warehouse/lotsCore";

export const STATE_LABEL = { active: tr("قابل‌استفاده"), quarantine: tr("قرنطینه"), rejected: tr("ردشده"), expired: tr("منقضی") };
export const STATE_TONE = { active: "ok", quarantine: "warn", rejected: "warn", expired: "warn" };
const STATUS_CHOICES = { active: ["quarantine", "rejected"], quarantine: ["active", "rejected"], rejected: [] };
const STATUS_LABEL = { active: tr("آزاد (قابل‌استفاده)"), quarantine: tr("قرنطینه"), rejected: tr("ردشده (نهایی)") };
const fmt = (n) => (Number.isFinite(n) ? String(Math.round(n * 1000) / 1000) : "—");

function daysText(t, num, d) {
  if (d == null) return null;
  if (d < 0) return t("{days} روز پیش منقضی شد", { days: num(-d) });
  if (d === 0) return t("امروز آخرین روز است");
  return t("{days} روز مانده", { days: num(d) });
}

// the counters above the stock and lots tabs; every counter is a link to the list it counts
export function LotAlerts({ data, base }) {
  const t = useT();
  const { num } = usePanelLang();
  if (!data.lotsAvailable || !data.alerts) return null;
  const a = data.alerts, w = data.alertWindow;
  const items = [
    { k: "expired", n: a.expired, label: t("منقضی (دارای موجودی)"), href: `${base}?tab=lots&view=expired` },
    { k: "expiring", n: a.expiring, label: t("انقضا تا {days} روز دیگر", { days: num(w) }), href: `${base}?tab=lots&view=expiring&window=${w}` },
    { k: "quarantine", n: a.quarantine, label: t("در قرنطینه"), href: `${base}?tab=lots&view=quarantine` },
    { k: "rejected", n: a.rejected, label: t("ردشده"), href: `${base}?tab=lots&view=rejected` },
    ...(a.lowUsable !== undefined && data.tab === "stock" ? [{ k: "low", n: a.lowUsable, label: t("کم‌موجودی (قابل‌استفاده)"), href: `${base}?tab=stock&low=1` }] : []),
  ].filter((x) => x.n > 0);
  if (!items.length) return <p className="mb-4 text-sm text-ink-muted" data-testid="wh-alerts-none"><Icon name="check" size={14} className="inline me-1" />{t("هشداری برای بچ‌ها و انقضا وجود ندارد.")}</p>;
  return (
    <div className="mb-4 flex flex-wrap gap-2" data-testid="wh-alerts" role="status">
      {items.map((x) => (
        <Link key={x.k} href={x.href} data-testid={`wh-alert-${x.k}`} className="rounded-xl px-3 py-2 text-sm bg-warn/10 text-warn hover:bg-warn/15 min-w-0 break-words">
          <b className="tabular">{num(x.n)}</b> {x.label}
        </Link>
      ))}
    </div>
  );
}

// the lots of a product, as small chips under its stock row (lots with stock only; the list is already cut on the server)
export function LotChips({ lots, code }) {
  const t = useT();
  if (!lots?.length) return null;
  return (
    <p className="text-xs mt-1 flex flex-wrap gap-x-2 gap-y-1" data-testid="wh-lot-chips">
      {lots.map((l) => (
        <span key={l.id} data-lot-state={l.state} className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 ${l.state === "active" ? "bg-line-soft text-ink-soft" : "bg-warn/10 text-warn"}`}>
          <span dir="ltr">{l.code}</span><span dir="ltr">· {fmt(l.quantity)}</span>{l.expiry && <span dir="ltr">· {l.expiry}</span>}{l.state !== "active" && <span>· {t(STATE_LABEL[l.state])}</span>}
        </span>
      ))}
    </p>
  );
}

function LotModal({ lot, actions, onClose, onDone }) {
  const t = useT();
  const [status, setStatus] = useState("");
  const [changeExpiry, setChangeExpiry] = useState(false);
  const [expiry, setExpiry] = useState(lot.expiry || "");
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const choices = STATUS_CHOICES[lot.status] || [];
  function submit(e) {
    e.preventDefault();
    setErr("");
    start(async () => {
      const res = await actions.updateLot({ lotId: lot.id, version: lot.version, status: status || undefined, setExpiry: changeExpiry, expiry: changeExpiry ? expiry : undefined, reason });
      if (res.ok) onDone(null); else setErr(t(res.error, res.params));
    });
  }
  return (
    <Modal title={t("وضعیت و تاریخ انقضای بچ")} onClose={onClose}>
      <form onSubmit={submit} data-testid="wh-form-lot">
        <Err>{err}</Err>
        <p className="text-sm text-ink-soft mb-4 break-words"><span dir="ltr">{lot.sku}</span> · <span dir="ltr">{lot.code}</span> · {t(STATE_LABEL[lot.state])}</p>
        {lot.status === "rejected" ? (
          <p className="text-sm rounded-xl px-3 py-2.5 bg-line-soft text-ink-soft mb-4">{t("این بچ ردشده است و دیگر تغییر نمی‌کند. برای خارج کردن موجودی آن از «اصلاح موجودی» (کاهش، با انتخاب این بچ) استفاده کنید.")}</p>
        ) : (
          <div className="grid gap-4">
            <Field label={t("وضعیت تازه")}>
              <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label={t("وضعیت تازه")} data-testid="wh-lot-status">
                <option value="">{t("بدون تغییر")}</option>
                {choices.map((c) => <option key={c} value={c}>{t(STATUS_LABEL[c])}</option>)}
              </Select>
            </Field>
            <label className="flex items-center gap-2 text-sm text-ink-soft"><input type="checkbox" checked={changeExpiry} onChange={(e) => setChangeExpiry(e.target.checked)} className="w-4 h-4 accent-brand-violet" data-testid="wh-lot-expiry-toggle" />{t("تاریخ انقضا را تغییر می‌دهم")}</label>
            {changeExpiry && (
              <Field label={t("تاریخ انقضا")} hint={t("آخرین روز اعتبار؛ خالی = بدون تاریخ انقضا")}>
                <Input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} dir="ltr" aria-label={t("تاریخ انقضا")} data-testid="wh-lot-expiry" />
              </Field>
            )}
            <Field label={t("دلیل")} required hint={t("در تاریخچهٔ بچ ثبت می‌شود.")}>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={300} aria-label={t("دلیل")} data-testid="wh-lot-reason" />
            </Field>
          </div>
        )}
        <div className="flex gap-2 mt-5">
          {lot.status !== "rejected" && <button type="submit" disabled={pending || (!status && !changeExpiry)} className="btn-primary size-md flex-1 disabled:opacity-60">{pending ? <Spinner /> : <Icon name="save" size={17} />}{t("ثبت")}</button>}
          <button type="button" onClick={onClose} className="btn-ghost size-md">{t("بستن")}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function LotsTab({ data, actions, base, code }) {
  const t = useT();
  const { num, date: fmtDate } = usePanelLang();
  const router = useRouter();
  const canQuarantine = useCan("inventory.lot_status");
  const [modal, setModal] = useState(null);
  const [msg, setMsg] = useState(null);
  const form = useRef(null);
  const done = () => { setModal(null); setMsg({ text: t("انجام شد."), ok: true }); router.refresh(); };

  if (!data.lotsAvailable) {
    return <EmptyState icon="layers" title={t("ثبت بچ و انقضا هنوز فعال نشده")} desc={t("برای ثبت بچ کالا، تاریخ انقضا و قرنطینه مایگریشن ۴۵ باید اجرا شود. تا آن زمان انبار مثل قبل کار می‌کند.")} />;
  }
  return (
    <>
      <LotAlerts data={data} base={base} />
      {msg && <div role="status" className="mb-4 text-sm rounded-xl px-3 py-2.5 flex items-center gap-2 bg-ok/10 text-ok"><Icon name="check" size={16} /> {msg.text}</div>}
      <form ref={form} action={base} method="get" className="card-flat p-3 mb-4 flex flex-wrap items-center gap-2" data-testid="wh-lots-filter">
        <input type="hidden" name="tab" value="lots" />
        <Input name="q" defaultValue={data.q} placeholder={t("کد بچ، SKU یا نام…")} aria-label={t("جستجو")} className="flex-1 min-w-[160px]" />
        <Select name="view" defaultValue={data.view} aria-label={t("نمایش")} className="w-auto min-w-[150px]" data-testid="wh-lots-view">
          <option value="all">{t("همهٔ بچ‌های دارای موجودی")}</option>
          <option value="expired">{t("منقضی")}</option>
          <option value="expiring">{t("نزدیک به انقضا")}</option>
          <option value="quarantine">{t("قرنطینه")}</option>
          <option value="rejected">{t("ردشده")}</option>
        </Select>
        <Select name="window" defaultValue={String(data.alertWindow)} aria-label={t("بازهٔ انقضا")} className="w-auto min-w-[120px]">
          {EXPIRING_DAYS.map((d) => <option key={d} value={String(d)}>{t("تا {days} روز", { days: num(d) })}</option>)}
        </Select>
        <Select name="location" defaultValue={data.locationId ? String(data.locationId) : ""} aria-label={t("انبار")} className="w-auto min-w-[120px]">
          <option value="">{t("همهٔ انبارها")}</option>
          {data.locations.map((l) => <option key={l.id} value={String(l.id)}>{l.code}</option>)}
        </Select>
        <button type="submit" className="btn-primary size-md"><Icon name="search" size={16} /> {t("نمایش")}</button>
      </form>

      {data.lots.length === 0 ? (
        <EmptyState icon="layers" title={t("بچی با این مشخصات نیست")} desc={t("بچ هنگام «ورود کالا» با نوشتن کد بچ ساخته می‌شود.")} />
      ) : (
        <div className="card divide-y divide-line overflow-hidden" data-testid="wh-lots">
          {data.lots.map((l) => (
            <div key={l.id} data-testid="wh-lot" data-lot-code={l.code} data-lot-state={l.state} className="px-3 sm:px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2 min-w-0">
              <div className="min-w-0 flex-1 basis-52">
                <p className="font-medium text-ink truncate"><span dir="ltr">{l.code}</span> <span className="text-ink-muted font-normal">· <span dir="ltr">{l.sku}</span>{l.name ? ` · ${l.name}` : ""}</span></p>
                <p className="text-xs text-ink-muted mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                  <span dir="ltr">{l.expiry || t("بدون تاریخ انقضا")}</span>
                  {daysText(t, num, l.daysLeft) && <span>{daysText(t, num, l.daysLeft)}</span>}
                  {Object.entries(l.byLocation).filter(([, q]) => q > 0).map(([id, q]) => <span key={id} dir="ltr">{code(Number(id))}: {fmt(q)}</span>)}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0 text-sm tabular">
                <Badge tone={STATE_TONE[l.state] || "neutral"} data-testid="wh-lot-state">{t(STATE_LABEL[l.state] || l.state)}</Badge>
                <b>{fmt(l.qty)}</b>
              </div>
              <div className="flex flex-wrap gap-1 shrink-0">
                <Link className="btn-ghost size-sm" href={`${base}?tab=lots&lot=${l.id}${data.view !== "all" ? `&view=${data.view}` : ""}`} data-testid="wh-lot-history">{t("تاریخچه")}</Link>
                {canQuarantine && l.status !== "rejected" && <button type="button" className="btn-ghost size-sm" onClick={() => setModal(l)} data-testid="wh-lot-edit">{t("وضعیت / انقضا")}</button>}
              </div>
            </div>
          ))}
        </div>
      )}
      <TabPager data={{ ...data, hasMore: false }} base={base} tab="lots" total={data.total} pageCount={data.pageCount} />

      {data.history && (
        <section className="card p-4 mt-4" data-testid="wh-lot-detail" aria-label={t("تاریخچهٔ بچ")}>
          <h3 className="font-semibold text-ink mb-2">{t("تاریخچهٔ بچ")}</h3>
          {data.history.error ? <Err>{t(data.history.error)}</Err> : (
            <>
              <ul className="space-y-1.5 text-sm" data-testid="wh-lot-events">
                {data.history.events.map((e) => (
                  <li key={e.id} className="break-words">
                    <b>{e.kind === "create" ? t("ساخته شد") : e.kind === "status" ? t("تغییر وضعیت") : t("تغییر تاریخ انقضا")}</b>{" "}
                    <span dir="ltr">{e.from ? `${e.from} → ` : ""}{e.to || "—"}</span>{e.reason ? ` · ${e.reason}` : ""} <span className="text-ink-muted">· {e.who} · {fmtDate(e.at)}</span>
                  </li>
                ))}
              </ul>
              {data.history.movements.length > 0 && (
                <ul className="space-y-1.5 text-sm mt-3 pt-3 border-t border-line" data-testid="wh-lot-moves">
                  {data.history.movements.map((m) => (
                    <li key={m.id} className="break-words"><b dir="ltr" className={m.delta > 0 ? "text-ok" : "text-warn"}>{m.delta > 0 ? "+" : ""}{fmt(m.delta)}</b> <span dir="ltr">{code(m.locationId)}</span> · {t({ receive: "ورود", issue: "خروج", transfer: "انتقال", adjust: "اصلاح", reversal: "برگشت" }[m.kind] || m.kind)}{m.reason ? ` · ${m.reason}` : ""}{m.reference ? ` · ${m.reference}` : ""} <span className="text-ink-muted">· {m.who} · {fmtDate(m.at)}</span></li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      )}
      {modal && <LotModal lot={modal} actions={actions} onClose={() => setModal(null)} onDone={done} />}
    </>
  );
}
