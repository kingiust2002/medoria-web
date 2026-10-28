"use client";
// "My start page and shortcuts" — the signed-in person chooses where a fresh login lands and which (up to six) screens are pinned under the menu (N10).
// Shared by both panels (each passes its own save action). Only addresses the person may open are listed; the server checks again. Needs a personal
// account (the old shared login has none) and migration 50; without either the card says so and cannot save.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { SectionCard, Spinner, Select } from "@/components/operator/ui";
import Icon from "@/components/shared/Icon";
import { useT } from "@/components/panel/PanelI18n";
import { SHORTCUT_LIMIT } from "@/lib/operator/navLimits";

export default function PreferencesCard({ targets, initial, save }) {
  const t = useT();
  const router = useRouter();
  const root = targets[0]?.href;                                           // the dashboard
  const [start, setStart] = useState(initial.startPage || root);
  const [pins, setPins] = useState(() => initial.shortcuts || []);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const usable = initial.personal && initial.ready;
  const toggle = (href) => setPins((p) => (p.includes(href) ? p.filter((x) => x !== href) : p.length >= SHORTCUT_LIMIT ? p : [...p, href]));
  const unchanged = start === (initial.startPage || root) && pins.join("|") === (initial.shortcuts || []).join("|");

  async function submit(e) {
    e.preventDefault();
    if (busy || !usable) return;
    setBusy(true); setMsg(null);
    const res = await save({ startPage: start === root ? null : start, shortcuts: pins }).catch(() => null);
    setBusy(false);
    if (res?.ok) { setMsg({ ok: true, text: t("تنظیمات ذخیره شد.") }); router.refresh(); }
    else setMsg({ ok: false, text: t(res?.error) || t("ذخیرهٔ تنظیمات انجام نشد. دوباره تلاش کنید.") });
  }

  return (
    <SectionCard title={t("صفحهٔ شروع و میانبرهای من")} desc={t("فقط برای حساب شما و فقط در همین پنل؛ زبان و حالت روشن/تیره همان‌طور که بود در مرورگر نگه داشته می‌شوند.")} icon="settings">
      {!initial.personal ? (
        <p className="text-sm text-ink-muted" data-testid="prefs-note">{t("تنظیمات شخصی به حساب شخصی وابسته است؛ با ورود قدیمی (مشترک) ذخیره نمی‌شود.")}</p>
      ) : !initial.ready ? (
        <p className="text-sm text-warn" data-testid="prefs-note">{t("تنظیمات شخصی هنوز فعال نشده است (مهاجرت پایگاه داده اجرا نشده).")}</p>
      ) : null}
      <form onSubmit={submit} className="min-w-0">
        <label className="block text-sm font-medium text-ink mb-1.5" htmlFor="prefs-start">{t("صفحهٔ شروع پس از ورود")}</label>
        <Select id="prefs-start" value={start} onChange={(e) => setStart(e.target.value)} disabled={!usable || busy} className="max-w-full sm:max-w-xs" data-testid="prefs-start">
          {targets.map((x) => <option key={x.href} value={x.href}>{x.href === root ? t("داشبورد (پیش‌فرض)") : t(x.label)}</option>)}
        </Select>
        <fieldset className="mt-5 min-w-0">
          <legend className="text-sm font-medium text-ink mb-1.5">{t("میانبرهای ثابت (حداکثر {max})", { max: SHORTCUT_LIMIT })}</legend>
          <div className="grid sm:grid-cols-2 gap-2">
            {targets.filter((x) => x.href !== root).map((x) => {
              const on = pins.includes(x.href);
              return (
                <label key={x.href} className={`flex items-center gap-2.5 min-w-0 px-3 h-11 rounded-xl border text-sm cursor-pointer ${on ? "border-brand-violet/50 bg-brand-violet/5 text-ink" : "border-line text-ink-soft"} ${!on && pins.length >= SHORTCUT_LIMIT ? "opacity-50 cursor-not-allowed" : ""}`}>
                  <input type="checkbox" checked={on} disabled={!usable || busy || (!on && pins.length >= SHORTCUT_LIMIT)} onChange={() => toggle(x.href)} className="w-4 h-4 accent-brand-violet shrink-0" data-testid={`prefs-pin-${x.href.split("/").pop()}`} />
                  <Icon name={x.icon} size={16} className="shrink-0" /><span className="truncate">{t(x.label)}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
        {msg && <p role={msg.ok ? "status" : "alert"} data-testid="prefs-msg" className={`mt-3 text-sm break-words ${msg.ok ? "text-ok" : "text-warn"}`}>{msg.text}</p>}
        <div className="mt-4"><button type="submit" disabled={!usable || busy || unchanged} className="btn-primary size-md disabled:opacity-60" data-testid="prefs-save">{busy ? <Spinner /> : null} {t("ذخیره")}</button></div>
      </form>
    </SectionCard>
  );
}
