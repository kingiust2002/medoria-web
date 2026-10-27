"use client";
// "My password / my two-step login" — shared by the Health and the Beauty panel (each passes its own server actions). Shown in the
// settings page, and on its own (mode="setup") when the account is restricted until a temporary password is changed or a required
// two-step login is set up. Every sensitive step asks for the current password (and a code when two-step is on); the server checks.
import { useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/shared/Icon";
import { Field, Input, SectionCard, Spinner } from "@/components/operator/ui";
import { useT } from "@/components/panel/PanelI18n";

function Notice({ tone = "warn", children }) {
  if (!children) return null;
  return <div role={tone === "warn" ? "alert" : "status"} className={`text-sm break-words ${tone === "warn" ? "text-warn" : "text-ok"}`}>{children}</div>;
}

function PasswordCard({ user, actions }) {
  const t = useT();
  const router = useRouter();
  const [f, setF] = useState({ current: "", next: "", repeat: "", code: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState("");
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setErr(""); setDone("");
    const res = await actions.changeMyPassword(f).catch(() => null);
    setBusy(false);
    if (res?.ok) {
      setF({ current: "", next: "", repeat: "", code: "" });
      setDone(res.sessionsEnded ? t("رمز عبور عوض شد؛ نشست‌های دیگر شما بسته شد.") : t("رمز عبور عوض شد."));
      router.refresh();
    } else setErr(t(res?.error) || t("ذخیره نشد. دوباره تلاش کنید."));
  }

  return (
    <SectionCard title={t("رمز عبور")} icon="lock" desc={user.mustChangePassword ? t("رمز فعلی شما موقت است؛ برای ادامه یک رمز تازه بگذارید.") : t("با عوض کردن رمز، نشست‌های دیگر شما بسته می‌شود.")}>
      <form onSubmit={submit} className="grid gap-3 max-w-md">
        <Field label={t("رمز عبور فعلی")}><Input type="password" autoComplete="current-password" value={f.current} onChange={set("current")} required /></Field>
        <Field label={t("رمز عبور تازه")} hint={t("حداقل ۱۲ نویسه؛ حرف و عدد (یا ۱۶ نویسه و بیشتر)")}><Input type="password" autoComplete="new-password" value={f.next} onChange={set("next")} required /></Field>
        <Field label={t("تکرار رمز عبور تازه")}><Input type="password" autoComplete="new-password" value={f.repeat} onChange={set("repeat")} required /></Field>
        {user.hasTotp && <Field label={t("کد ورود دومرحله‌ای")}><Input inputMode="numeric" autoComplete="one-time-code" dir="ltr" value={f.code} onChange={set("code")} /></Field>}
        <Notice>{err}</Notice>
        <Notice tone="ok">{done}</Notice>
        <div><button type="submit" className="btn-primary size-md" disabled={busy}>{busy ? <Spinner /> : <Icon name="check" size={16} />} {t("تغییر رمز عبور")}</button></div>
      </form>
    </SectionCard>
  );
}

function CodesBox({ codes, onClose }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  return (
    <div className="grid gap-3">
      <p className="text-sm text-ink-soft">{t("این کدهای بازیابی فقط یک بار نمایش داده می‌شوند. آن‌ها را جای امن نگه دارید؛ هر کد یک بار کار می‌کند.")}</p>
      <ul dir="ltr" data-testid="recovery-codes" className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 font-mono text-sm">
        {codes.map((c) => <li key={c} className="px-3 py-1.5 rounded-lg bg-line-soft select-all">{c}</li>)}
      </ul>
      <div className="flex gap-2">
        <button type="button" className="btn-ghost size-sm" onClick={async () => { try { await navigator.clipboard.writeText(codes.join("\n")); setCopied(true); } catch { /* selectable */ } }}><Icon name={copied ? "check" : "copy"} size={16} /> {copied ? t("کپی شد") : t("کپی")}</button>
        <button type="button" className="btn-primary size-sm" onClick={onClose}>{t("ذخیره کردم")}</button>
      </div>
    </div>
  );
}

function TwoStepCard({ user, actions }) {
  const t = useT();
  const router = useRouter();
  const [step, setStep] = useState("idle");           // idle | password | scan | codes | renew | disable
  const [f, setF] = useState({ current: "", code: "" });
  const [pending, setPending] = useState(null);       // { secretGroups, otpauth, blob }
  const [codes, setCodes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const reset = () => { setStep("idle"); setF({ current: "", code: "" }); setPending(null); setErr(""); };

  async function run(fn, onOk) {
    if (busy) return;
    setBusy(true); setErr("");
    const res = await fn().catch(() => null);
    setBusy(false);
    if (res?.ok) onOk(res); else setErr(t(res?.error) || t("ذخیره نشد. دوباره تلاش کنید."));
  }

  return (
    <SectionCard title={t("ورود دومرحله‌ای")} icon="shield" desc={user.hasTotp ? t("روشن است: هنگام ورود، کدی از برنامهٔ احراز هویت گوشی هم لازم است.") : user.require2fa ? t("مدیر اصلی آن را برای شما الزامی کرده است؛ برای ادامه آن را راه‌اندازی کنید.") : t("اختیاری: یک لایهٔ امنیتی دیگر با کدی از گوشی.")}>
      <div className="grid gap-3 max-w-md">
        {codes ? <CodesBox codes={codes} onClose={() => { setCodes(null); reset(); router.refresh(); }} /> : (
          <>
            {step === "idle" && !user.hasTotp && <div><button type="button" className="btn-primary size-md" onClick={() => setStep("password")}><Icon name="shield" size={16} /> {t("راه‌اندازی ورود دومرحله‌ای")}</button></div>}
            {step === "idle" && user.hasTotp && (
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-ghost size-sm" onClick={() => setStep("renew")}>{t("کدهای بازیابی تازه")}</button>
                {!user.require2fa && <button type="button" className="btn-ghost size-sm" onClick={() => setStep("disable")}>{t("خاموش کردن")}</button>}
              </div>
            )}

            {step === "password" && (
              <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); run(() => actions.startMyTwoStep({ current: f.current }), (res) => { setPending(res); setF({ current: "", code: "" }); setStep("scan"); }); }}>
                <Field label={t("رمز عبور فعلی")}><Input type="password" autoComplete="current-password" value={f.current} onChange={set("current")} required /></Field>
                <Notice>{err}</Notice>
                <div className="flex gap-2"><button type="submit" className="btn-primary size-sm" disabled={busy}>{busy ? <Spinner /> : null} {t("ادامه")}</button><button type="button" className="btn-ghost size-sm" onClick={reset}>{t("انصراف")}</button></div>
              </form>
            )}

            {step === "scan" && pending && (
              <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); run(() => actions.confirmMyTwoStep({ blob: pending.blob, code: f.code }), (res) => { setCodes(res.recoveryCodes); setPending(null); }); }}>
                <p className="text-sm text-ink-soft">{t("در برنامهٔ احراز هویت گوشی (Google Authenticator، Authy، …) یک حساب تازه با «وارد کردن کلید» بسازید و این کلید را بزنید:")}</p>
                <code dir="ltr" data-testid="totp-secret" className="px-3 py-2 rounded-lg bg-line-soft font-mono text-sm break-all select-all">{pending.secretGroups}</code>
                <a href={pending.otpauth} className="text-xs text-brand-violet underline break-all" dir="ltr">{t("یا این پیوند را روی گوشی باز کنید")}</a>
                <Field label={t("کد ۶ رقمی نمایش‌داده‌شده در برنامه")}><Input inputMode="numeric" autoComplete="one-time-code" dir="ltr" value={f.code} onChange={set("code")} required /></Field>
                <Notice>{err}</Notice>
                <div className="flex gap-2"><button type="submit" className="btn-primary size-sm" disabled={busy}>{busy ? <Spinner /> : null} {t("تأیید و روشن کردن")}</button><button type="button" className="btn-ghost size-sm" onClick={reset}>{t("انصراف")}</button></div>
              </form>
            )}

            {(step === "renew" || step === "disable") && (
              <form className="grid gap-3" onSubmit={(e) => {
                e.preventDefault();
                if (step === "renew") run(() => actions.newMyRecoveryCodes({ current: f.current, code: f.code }), (res) => setCodes(res.recoveryCodes));
                else run(() => actions.disableMyTwoStep({ current: f.current, code: f.code }), () => { reset(); router.refresh(); });
              }}>
                <Field label={t("رمز عبور فعلی")}><Input type="password" autoComplete="current-password" value={f.current} onChange={set("current")} required /></Field>
                <Field label={t("کد ورود دومرحله‌ای")}><Input inputMode="numeric" autoComplete="one-time-code" dir="ltr" value={f.code} onChange={set("code")} required /></Field>
                <Notice>{err}</Notice>
                <div className="flex gap-2"><button type="submit" className="btn-primary size-sm" disabled={busy}>{busy ? <Spinner /> : null} {step === "renew" ? t("ساخت کدهای تازه") : t("خاموش کردن")}</button><button type="button" className="btn-ghost size-sm" onClick={reset}>{t("انصراف")}</button></div>
              </form>
            )}
          </>
        )}
      </div>
    </SectionCard>
  );
}

export default function AccountSecurity({ user, actions, mode = "settings" }) {
  const t = useT();
  return (
    <div className="grid gap-5">
      {mode === "setup" && (
        <div role="status" className="card p-4 text-sm text-ink-soft" data-testid="account-setup">
          {user.mustChangePassword ? t("برای ادامه باید رمز عبور موقت خود را عوض کنید.") : t("برای ادامه باید ورود دومرحله‌ای را راه‌اندازی کنید.")}
        </div>
      )}
      {(mode === "settings" || user.mustChangePassword) && <PasswordCard user={user} actions={actions} />}
      {(mode === "settings" || (!user.mustChangePassword && user.require2fa && !user.hasTotp)) && <TwoStepCard user={user} actions={actions} />}
    </div>
  );
}
