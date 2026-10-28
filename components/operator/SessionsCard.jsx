"use client";
// Active sessions of THIS panel, with "end all other sessions" and "end every session". Shared by the
// Health and Beauty settings pages; each passes its own server actions and its own login address.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/shared/Icon";
import { Spinner } from "@/components/operator/ui";
import { useT, usePanelLang } from "@/components/panel/PanelI18n";


export default function SessionsCard({ sessions, currentSid, actions, loginHref, registryReady }) {
  const t = useT();
  const { date: fmtDate } = usePanelLang();
  const router = useRouter();
  const [ask, setAsk] = useState(null);                 // "others" | "all"
  const [msg, setMsg] = useState(null);
  const [pending, startTransition] = useTransition();

  function run(kind) {
    startTransition(async () => {
      const res = await (kind === "all" ? actions.revokeAll() : actions.revokeOthers());
      setAsk(null);
      if (!res.ok) { setMsg({ ok: false, text: t(res.error) }); return; }
      if (res.loggedOut) { router.push(loginHref); router.refresh(); return; }
      setMsg({ ok: true, text: res.count ? t("{count} نشست دیگر پایان یافت.", { count: res.count }) : t("نشست دیگری فعال نبود.") });
      router.refresh();
    });
  }

  if (!registryReady) {
    return <p className="text-sm text-ink-soft leading-relaxed">{t("ثبت نشست‌ها هنوز فعال نیست: مایگریشن ۳۰ را در پایگاه داده اجرا کنید. تا آن زمان فقط خروج از همین مرورگر کار می‌کند.")}</p>;
  }

  return (
    <div>
      {msg && <div role="status" className={`mb-3 text-sm rounded-xl px-3 py-2.5 ${msg.ok ? "bg-ok/10 text-ok" : "bg-warn/10 text-warn"}`}>{msg.text}</div>}

      <ul className="divide-y divide-line">
        {sessions.map((s) => (
          <li key={s.sid} className="py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="font-medium text-ink">{s.sid === currentSid ? t("این نشست") : t("نشست دیگر")}</span>
            <span className="text-ink-muted text-xs">{t("ورود: {faDate}", { faDate: fmtDate(s.created_at) })}</span>
            <span className="text-ink-faint text-xs">{t("پایان خودکار: {faDate}", { faDate: fmtDate(s.expires_at) })}</span>
            <span className="text-ink-faint text-xs" dir="ltr" title={t("نشانهٔ شبکه (هش کوتاه، نه آدرس)")}>{t("شبکه {slice}", { slice: String(s.ip_hash || "—").slice(0, 8) })}</span>
          </li>
        ))}
        {sessions.length === 0 && <li className="py-2.5 text-sm text-ink-muted">{t("نشست فعالی ثبت نشده است.")}</li>}
      </ul>
      <p className="text-[11px] text-ink-faint mt-2 leading-relaxed">{t("یک حساب مشترک است؛ این فهرست نشان نمی‌دهد چه کسی وارد شده، فقط چند نشست فعال است و از چه شبکه‌ای (به‌صورت هش).")}</p>

      <div className="flex flex-wrap items-center gap-2 mt-3">
        {ask ? (
          <>
            <span className="text-sm text-ink">{ask === "all" ? t("همهٔ نشست‌ها (از جمله این یکی) پایان یابد؟") : t("نشست‌های دیگر پایان یابد؟")}</span>
            <button type="button" disabled={pending} onClick={() => run(ask)} className="btn-primary size-sm !bg-warn hover:!bg-warn/90 disabled:opacity-60">{pending ? <Spinner /> : <Icon name="check" size={15} />} {t("بله")}</button>
            <button type="button" disabled={pending} onClick={() => setAsk(null)} className="btn-ghost size-sm">{t("انصراف")}</button>
          </>
        ) : (
          <>
            <button type="button" onClick={() => setAsk("others")} className="btn-ghost size-sm"><Icon name="logout" size={15} /> {t("پایان نشست‌های دیگر")}</button>
            <button type="button" onClick={() => setAsk("all")} className="btn-ghost size-sm !text-warn hover:!border-warn/40"><Icon name="lock" size={15} /> {t("پایان همهٔ نشست‌ها")}</button>
          </>
        )}
      </div>
    </div>
  );
}
