"use client";
// "Publish quality rules" — the main manager chooses which gaps of a product BLOCK publishing it (N6). Shared by both panels (each passes its own
// save action). Everybody who may see products reads the rule; only a person with the right edits it. The server applies the rule to every way
// a product can go live; this card only chooses it. Without migration 46 the card says so and cannot save.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { SectionCard, Spinner } from "@/components/operator/ui";
import { useT } from "@/components/panel/PanelI18n";
import { ALL_GAP_CODES, GAP_BY_CODE } from "@/lib/operator/publishRules";
import { gapLabel } from "@/lib/operator/completeness";

export default function PublishRulesCard({ initial, canEdit, save }) {
  const t = useT();
  const router = useRouter();
  const [chosen, setChosen] = useState(() => new Set(initial.rules || []));
  const [version, setVersion] = useState(initial.version || 0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const ready = initial.state === "ok";
  const unchanged = [...chosen].sort().join() === [...(initial.savedRules || initial.rules || [])].sort().join();
  const toggle = (code) => setChosen((s) => { const n = new Set(s); n.has(code) ? n.delete(code) : n.add(code); return n; });

  async function submit(e) {
    e.preventDefault();
    if (busy || !canEdit || !ready) return;
    setBusy(true); setMsg(null);
    const res = await save(ALL_GAP_CODES.filter((c) => chosen.has(c)), version).catch(() => null);
    setBusy(false);
    if (res?.ok) { setVersion(res.version); setMsg({ ok: true, text: t("قوانین ذخیره شد.") }); router.refresh(); }
    else setMsg({ ok: false, text: t(res?.error) || t("ذخیرهٔ قوانین ناموفق بود.") });
  }

  const groups = [
    { title: t("پایه"), codes: ALL_GAP_CODES.filter((c) => ["image", "sku", "category"].includes(c)) },
    { title: t("نام محصول"), codes: ALL_GAP_CODES.filter((c) => c.startsWith("name_")) },
    { title: t("توضیحات"), codes: ALL_GAP_CODES.filter((c) => c.startsWith("description_")) },
    { title: t("مشخصات"), codes: ALL_GAP_CODES.filter((c) => c === "specs") },
  ];

  return (
    <SectionCard title={t("قوانین کیفیت انتشار")} desc={t("هر مورد انتخاب‌شده، انتشار محصول را تا تکمیل‌شدنش مسدود می‌کند — برای ذخیرهٔ مستقیم، تأییدشده، زمان‌بندی‌شده، گروهی، ورود فایل و بازگردانی نسخه یکسان است.")} icon="shield">
      <form onSubmit={submit} data-testid="publish-rules" className="min-w-0">
        {!ready && (
          <p role="status" data-testid="rules-unavailable" className="mb-4 text-sm rounded-xl px-3 py-2.5 bg-warn/10 text-warn break-words">
            {initial.state === "none" ? t("برای ذخیرهٔ قوانین، مایگریشن ۴۶ باید روی پایگاه داده اجرا شود. تا آن زمان هیچ قاعده‌ای فعال نیست.") : t("قوانین خوانده نشد؛ برای اطمینان، انتشار محصولات تا برطرف‌شدن مشکل انجام نمی‌شود.")}
          </p>
        )}
        {ready && !canEdit && <p className="mb-4 text-sm text-ink-muted" data-testid="rules-readonly">{t("فقط می‌توانید قوانین را ببینید؛ اجازهٔ تغییر آن‌ها را ندارید.")}</p>}
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-4">
          {groups.map((g) => (
            <fieldset key={g.title} className="min-w-0">
              <legend className="text-xs font-semibold text-ink-muted mb-1.5">{g.title}</legend>
              <div className="flex flex-col gap-1">
                {g.codes.map((code) => (
                  <label key={code} className="flex items-center gap-2.5 text-sm text-ink min-h-[40px] min-w-0 break-words">
                    <input type="checkbox" className="w-5 h-5 shrink-0" data-testid={`rule-${code}`} checked={chosen.has(code)} disabled={!canEdit || !ready || busy} onChange={() => toggle(code)} />
                    <span className="min-w-0">{gapLabel(GAP_BY_CODE[code], t)}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
        <p className="mt-4 text-xs text-ink-muted leading-relaxed">{t("محصولی که هم‌اکنون روی سایت است به‌خاطر کمبودهای قبلی‌اش متوقف نمی‌شود؛ فقط ویرایشی که کمبود تازه‌ای بسازد مسدود می‌شود. تنوع‌ها (variants) جداگانه ارزیابی نمی‌شوند.")}</p>
        {initial.updatedLabel && <p className="mt-1 text-xs text-ink-muted break-words" data-testid="rules-last">{t("آخرین تغییر: {who}", { who: initial.updatedLabel })}</p>}
        {msg && <p role={msg.ok ? "status" : "alert"} data-testid="rules-msg" className={`mt-3 text-sm break-words ${msg.ok ? "text-ok" : "text-warn"}`}>{msg.text}</p>}
        {canEdit && ready && (
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="submit" disabled={busy || unchanged} className="btn-primary size-md disabled:opacity-60" data-testid="rules-save">{busy ? <Spinner /> : null} {t("ذخیرهٔ قوانین")}</button>
            <button type="button" disabled={busy || chosen.size === 0} onClick={() => setChosen(new Set())} className="btn-ghost size-md" data-testid="rules-clear">{t("برداشتن همهٔ قوانین")}</button>
          </div>
        )}
      </form>
    </SectionCard>
  );
}
