"use client";
// components/operator/SystemStatus.jsx — the "System status" screen of BOTH panels (N13). Three honest parts:
//   1. what the app checks ITSELF right now (database, which migrations are applied, which settings exist) — real checks, "unknown" when one cannot run;
//   2. what the server's scripts REPORTED (backup, freshness, restore drill, heartbeat) — fresh success = "reported OK", a failure = "failed", an old success =
//      "overdue", nothing = "unknown". Never green by assumption;
//   3. the alert path: the app cannot see whether a message reached a person, so it shows "not proven" until a person with the right says they received the
//      deliberate test alert (and then it is their statement, labelled as such).
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/shared/Icon";
import { PageHeader, SectionCard, Badge, Input, Spinner } from "@/components/operator/ui";
import { useT, usePanelLang } from "@/components/panel/PanelI18n";
import { OPS_KINDS } from "@/lib/ops/status";
import { CONFIG_LABELS } from "@/lib/operator/systemChecks";
import { tr } from "@/lib/panel/i18n";

const STATE = {
  ok: { label: tr("طبق گزارش، سالم"), tone: "ok" }, fail: { label: tr("ناموفق"), tone: "warn" }, overdue: { label: tr("گزارش به‌موقع نرسیده"), tone: "warn" }, unknown: { label: tr("نامعلوم"), tone: "neutral" },
};
const HEADLINE = {
  problem: { label: tr("مشکل گزارش شده است"), tone: "warn" }, attention: { label: tr("نیازمند توجه: چیزی نامعلوم یا عقب‌افتاده است"), tone: "warn" }, reported_ok: { label: tr("همهٔ اسکریپت‌ها اخیراً موفقیت گزارش کرده‌اند"), tone: "ok" },
};
const MIG = { present: { label: tr("اجرا شده"), tone: "ok" }, missing: { label: tr("اجرا نشده"), tone: "warn" }, unknown: { label: tr("نامعلوم"), tone: "neutral" }, no_probe: { label: tr("قابل سنجش نیست"), tone: "neutral" } };

export default function SystemStatus({ data, confirmAction }) {
  const t = useT();
  const { date: fmtDate } = usePanelLang();
  const router = useRouter();
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState(null);
  const [pending, start] = useTransition();
  const ov = data.reports.overview;
  const when = (iso) => (iso ? fmtDate(iso, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
  const missingCount = data.migrations.filter((m) => m.state === "missing").length;

  function confirm(e) {
    e.preventDefault();
    setMsg(null);
    start(async () => {
      const res = await confirmAction(note).catch(() => null);
      if (res?.ok) { setNote(""); setMsg({ ok: true, text: t("ثبت شد.") }); router.refresh(); } else setMsg({ ok: false, text: t(res?.error) || t("ارتباط با سرور برقرار نشد.") });
    });
  }

  return (
    <>
      <PageHeader title={t("وضعیت سیستم")} subtitle={t("آنچه برنامه خودش می‌سنجد و آنچه اسکریپت‌های سرور گزارش داده‌اند؛ بدون گزارش، هرگز «سالم» نشان داده نمی‌شود.")} />

      <section className="card p-4 mb-6" data-testid="sys-headline" data-state={ov.headline}>
        <div className="flex flex-wrap items-center gap-2"><Badge tone={HEADLINE[ov.headline].tone}>{t(HEADLINE[ov.headline].label)}</Badge>
          <span className="text-xs text-ink-muted break-words">{t("«سالم» یعنی اسکریپت اخیراً موفقیت گزارش کرده؛ نه اینکه نسخهٔ پشتیبان بازیابی‌شدنی است یا هشدار به کسی رسیده است.")}</span></div>
        {!data.reports.ok && <p role="alert" data-testid="sys-reports-error" className="mt-2 text-sm text-warn break-words">{t(data.reports.error) || t("گزارش‌های سرور خوانده نشد.")}</p>}
        {!data.config.opsToken && <p className="mt-2 text-xs text-ink-muted break-words" data-testid="sys-no-token">{t("توکن گزارش سرور تنظیم نشده است؛ تا تنظیم نشود، اسکریپت‌ها نمی‌توانند چیزی گزارش دهند و همه‌چیز «نامعلوم» می‌ماند.")}</p>}
      </section>

      <SectionCard title={t("گزارش اسکریپت‌های سرور")} desc={t("هر ردیف آخرین گزارش را با زمان پایگاه داده نشان می‌دهد.")} icon="shield" className="mb-6">
        <ul className="divide-y divide-line" data-testid="sys-reports">
          {ov.items.map((i) => (
            <li key={i.kind} className="py-3 flex flex-wrap items-start gap-x-4 gap-y-1 min-w-0" data-testid={`sys-${i.kind}`} data-state={i.state}>
              <Badge tone={STATE[i.state].tone}>{t(STATE[i.state].label)}</Badge>
              <div className="min-w-0 flex-1 basis-56">
                <p className="text-sm font-medium text-ink break-words">{t(OPS_KINDS[i.kind].label)}</p>
                <p className="text-xs text-ink-muted break-words">{t(OPS_KINDS[i.kind].how)}</p>
                <p className="text-xs text-ink-soft mt-0.5 break-words">
                  {i.reportedAt ? `${t("آخرین گزارش")}: ${when(i.reportedAt)}` : t("هنوز گزارشی نرسیده است.")}
                  {i.state !== "ok" && i.lastPassAt ? ` · ${t("آخرین موفقیت")}: ${when(i.lastPassAt)}` : ""}
                  {i.detail ? ` · ${i.detail}` : ""}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </SectionCard>

      <SectionCard title={t("مسیر هشدار")} desc={t("برنامه نمی‌تواند ببیند پیام به کسی رسیده یا نه.")} icon="alertTriangle" className="mb-6">
        <div data-testid="sys-alert" data-state={ov.alert.state}>
          <Badge tone={ov.alert.state === "confirmed" ? "neutral" : "warn"}>{ov.alert.state === "confirmed" ? t("تأییدِ گفتهٔ مدیر؛ توسط برنامه راستی‌آزمایی نشده") : ov.alert.state === "awaiting" ? t("هشدار آزمایشی فرستاده شده؛ دریافت تأیید نشده") : t("هرگز آزموده نشده")}</Badge>
          <p className="text-xs text-ink-muted mt-2 break-words">
            {ov.alert.testedAt ? `${t("آخرین هشدار آزمایشی")}: ${when(ov.alert.testedAt)}` : t("هیچ هشدار آزمایشی ثبت نشده است. روی سرور: production-backup.sh --alert-test")}
            {ov.alert.confirmedAt ? ` · ${t("تأیید دریافت")}: ${when(ov.alert.confirmedAt)}${ov.alert.by ? ` — ${ov.alert.by}` : ""}${ov.alert.note ? ` — ${ov.alert.note}` : ""}` : ""}
          </p>
          {data.canConfirm && ov.alert.state !== "never_tested" && (
            <form onSubmit={confirm} className="mt-3 flex flex-wrap items-center gap-2 min-w-0">
              <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} placeholder={t("یادداشت (مثلاً: در تلگرام و ایمیل رسید)")} aria-label={t("یادداشت")} className="w-72 max-w-full" data-testid="sys-confirm-note" />
              <button type="submit" disabled={pending} className="btn-ghost size-md disabled:opacity-60" data-testid="sys-confirm">{pending ? <Spinner /> : <Icon name="check" size={16} />} {t("هشدار آزمایشی به دستم رسید")}</button>
            </form>
          )}
          {!data.canConfirm && <p className="text-xs text-ink-muted mt-2">{t("فقط مدیر اصلی می‌تواند دریافت هشدار را تأیید کند.")}</p>}
          {msg && <p role={msg.ok ? "status" : "alert"} data-testid="sys-confirm-msg" className={`mt-2 text-sm break-words ${msg.ok ? "text-ok" : "text-warn"}`}>{msg.text}</p>}
        </div>
      </SectionCard>

      <SectionCard title={t("بررسی زندهٔ برنامه")} desc={t("همین حالا، هنگام باز شدن این صفحه.")} icon="settings" className="mb-6">
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2" data-testid="sys-live">
          <div className="flex items-center gap-2 min-w-0" data-testid="sys-db" data-state={data.db.state}>
            <Badge tone={data.db.state === "ok" ? "ok" : "warn"}>{data.db.state === "ok" ? t("پاسخ می‌دهد") : t("پاسخ نمی‌دهد")}</Badge><span className="text-sm text-ink break-words">{t("پایگاه داده")}</span>
          </div>
          {Object.entries(CONFIG_LABELS).map(([k, label]) => (
            <div key={k} className="flex items-center gap-2 min-w-0" data-testid={`sys-cfg-${k}`} data-set={data.config[k] ? "1" : "0"}>
              <Badge tone={data.config[k] ? "ok" : "neutral"}>{data.config[k] ? t("تنظیم شده") : t("تنظیم نشده")}</Badge><span className="text-sm text-ink break-words">{t(label)}</span>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title={t("مهاجرت‌های پایگاه داده")} desc={missingCount ? t("{count} مهاجرت هنوز اجرا نشده است؛ ویژگی‌های وابسته تا اجرای آن‌ها کار نمی‌کنند.", { count: missingCount }) : t("وجود جدول یا ستون هر مهاجرت سنجیده می‌شود (نه محتوای آن).")} icon="layers">
        <ul className="flex flex-wrap gap-2" data-testid="sys-migrations">
          {data.migrations.map((m) => (
            <li key={m.migration} data-testid={`sys-mig-${m.migration}`} data-state={m.state}><Badge tone={MIG[m.state].tone}>{m.migration} · {t(MIG[m.state].label)}</Badge></li>
          ))}
        </ul>
      </SectionCard>
    </>
  );
}
