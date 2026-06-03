// components/shared/NewsletterForm.jsx — email signup (stored in Supabase).
"use client";
import { useState } from "react";
import { subscribeNewsletter } from "@/lib/supabase";
import Icon from "./Icon";

const COPY = {
  fa: { title: "خبرنامهٔ مدوریا", sub: "محصولات تازه و پیشنهادها را اول دریافت کنید.", ph: "ایمیل شما", btn: "عضویت", ok: "ثبت شد! ممنون.", already: "قبلاً عضو شده‌اید.", err: "خطا، دوباره تلاش کنید." },
  ru: { title: "Рассылка Medoria", sub: "Новинки и предложения — первыми.", ph: "Ваш email", btn: "Подписаться", ok: "Готово! Спасибо.", already: "Вы уже подписаны.", err: "Ошибка, попробуйте снова." },
  tg: { title: "Хабарномаи Medoria", sub: "Маҳсулоти нав ва пешниҳодҳоро аввалин гиред.", ph: "Email-и шумо", btn: "Обуна", ok: "Сабт шуд! Раҳмат.", already: "Шумо аллакай обуна ҳастед.", err: "Хато, бори дигар кӯшиш кунед." },
  en: { title: "Medoria newsletter", sub: "Get new products and offers first.", ph: "Your email", btn: "Subscribe", ok: "Subscribed! Thank you.", already: "You're already subscribed.", err: "Something went wrong." },
};

export default function NewsletterForm({ lang, center = false }) {
  const c = COPY[lang] || COPY.en;
  const [email, setEmail] = useState("");
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (busy || !email.trim()) return;
    setBusy(true); setState(null);
    const res = await subscribeNewsletter(email, lang);
    setBusy(false);
    if (res.ok) { setState(res.already ? "already" : "ok"); setEmail(""); }
    else setState("err");
  };

  return (
    <div className={center ? "text-center" : ""}>
      <h3 className="font-display text-lg md:text-xl font-bold text-ink mb-1.5">{c.title}</h3>
      <p className="text-[13px] text-ink-muted mb-4">{c.sub}</p>
      <form onSubmit={submit} className={`flex gap-2 ${center ? "max-w-md mx-auto" : ""}`}>
        <input
          type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder={c.ph} dir="ltr" aria-label={c.ph}
          className="input flex-1 h-11"
        />
        <button type="submit" disabled={busy} className="btn-primary size-md shrink-0 disabled:opacity-60">
          {busy ? <Icon name="refresh" size={15} className="animate-spin" /> : <Icon name="send" size={15} />}
          <span className="hidden sm:inline">{c.btn}</span>
        </button>
      </form>
      {state && (
        <p className={`text-[12px] mt-2.5 ${state === "err" ? "text-warn" : "text-ok"}`}>
          {state === "ok" ? c.ok : state === "already" ? c.already : c.err}
        </p>
      )}
    </div>
  );
}
