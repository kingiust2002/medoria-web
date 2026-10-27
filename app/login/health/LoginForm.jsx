"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/shared/Icon";
import { Spinner } from "@/components/operator/ui";
import { useT } from "@/components/panel/PanelI18n";
import PanelLangSwitch from "@/components/panel/PanelLangSwitch";

export default function LoginForm() {
  const t = useT();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [needCode, setNeedCode] = useState(false);          // the panel has two-step login: ask for the code
  const [useRecovery, setUseRecovery] = useState(false);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/operator/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, ...(needCode ? (useRecovery ? { recovery: code } : { code }) : {}) }),
      });
      if (res.ok) {
        router.push("/operator");
        router.refresh();
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (data.needCode) setNeedCode(true);
      setError(t(data.error) || t("ورود ناموفق بود."));
    } catch {
      setError(t("ارتباط برقرار نشد. دوباره تلاش کنید."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen grid place-items-center p-4 bg-brand-gradient-soft dark:bg-canvas">
      <div className="absolute top-4 end-4 z-10"><PanelLangSwitch /></div>
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-3 mb-7 text-center">
          <span className="grid place-items-center w-14 h-14 rounded-2xl bg-brand-gradient text-white shadow-brand">
            <Icon name="lock" size={24} />
          </span>
          <div>
            <h1 className="text-2xl font-extrabold font-display gradient-text">Medoria</h1>
            <p className="text-sm text-ink-muted mt-1">{t("ورود به پنل اپراتور")}</p>
          </div>
        </div>

        <form onSubmit={submit} className="card p-6 flex flex-col gap-4">
          <label className="block">
            <span className="block text-[13px] font-medium text-ink-soft mb-1.5">{t("نام کاربری")}</span>
            <input
              type="text"
              name="username"
              dir="ltr"
              autoFocus
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="input w-full"
              placeholder="username"
            />
          </label>

          <label className="block">
            <span className="block text-[13px] font-medium text-ink-soft mb-1.5">{t("رمز عبور")}</span>
            <input
              type="password"
              name="password"
              dir="ltr"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input w-full"
              placeholder="••••••••"
            />
          </label>

          {needCode && (
            <label className="block">
              <span className="block text-[13px] font-medium text-ink-soft mb-1.5">{useRecovery ? t("کد بازیابی") : t("کد ۶ رقمی برنامهٔ احراز هویت")}</span>
              <input
                type="text"
                name="code"
                dir="ltr"
                inputMode={useRecovery ? "text" : "numeric"}
                autoComplete="one-time-code"
                autoFocus
                spellCheck={false}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="input w-full tabular"
                placeholder={useRecovery ? "XXXX-XXXX-XXXX" : "123456"}
              />
              <button type="button" onClick={() => { setUseRecovery((v) => !v); setCode(""); }} className="text-[12px] text-ink-muted underline underline-offset-2 mt-1.5">
                {useRecovery ? t("استفاده از کد برنامه") : t("کد را ندارم — استفاده از کد بازیابی")}
              </button>
            </label>
          )}

          {error && (
            <div className="flex items-center gap-2 text-[13px] text-warn bg-warn/10 rounded-xl px-3 py-2.5">
              <Icon name="alertTriangle" size={16} />
              {error}
            </div>
          )}

          <button type="submit" disabled={loading || !username || !password || (needCode && !code)} className="btn-primary size-lg w-full disabled:opacity-60">
            {loading ? <Spinner /> : <Icon name="arrowL" size={18} />}
            {loading ? t("در حال ورود…") : t("ورود")}
          </button>
        </form>

        <p className="text-center text-[11px] text-ink-faint mt-5 leading-relaxed">{t("دسترسی فقط برای کارکنان مجاز. تمام فعالیت‌ها ثبت می‌شود.")}</p>
      </div>
    </div>
  );
}
