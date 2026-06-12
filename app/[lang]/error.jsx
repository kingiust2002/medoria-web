// app/[lang]/error.jsx — graceful failure boundary for the public site.
// Shown only when a server render genuinely fails (e.g. database unreachable
// on a page's very first render). Localized, branded, recoverable — and the
// underlying error never reaches the visitor.
"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { LOCALES, DEFAULT_LOCALE } from "@/lib/i18n";

const COPY = {
  fa: { title: "مشکلی پیش آمد", sub: "لطفاً چند لحظه بعد دوباره تلاش کنید.", retry: "تلاش دوباره", home: "صفحه اصلی" },
  tg: { title: "Хатогӣ рух дод", sub: "Лутфан баъд аз чанд лаҳза боз кӯшиш кунед.", retry: "Аз нав кӯшиш", home: "Саҳифаи асосӣ" },
  ru: { title: "Что-то пошло не так", sub: "Пожалуйста, попробуйте ещё раз через мгновение.", retry: "Повторить", home: "На главную" },
  en: { title: "Something went wrong", sub: "Please try again in a moment.", retry: "Try again", home: "Home" },
};

export default function LangError({ error, reset }) {
  const pathname = usePathname();
  const seg = (pathname || "/").split("/")[1];
  const lang = LOCALES.includes(seg) ? seg : DEFAULT_LOCALE;
  const t = COPY[lang] || COPY.en;

  useEffect(() => {
    // Server logs carry the real cause; the digest links this view to them.
    console.error("page error:", error?.digest || error?.message);
  }, [error]);

  return (
    <div dir={lang === "fa" ? "rtl" : "ltr"} className="min-h-[60vh] flex items-center justify-center bg-canvas-soft px-4">
      <div className="text-center max-w-md">
        <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-warn/10 text-warn flex items-center justify-center text-2xl font-bold">!</div>
        <h1 className="font-display text-2xl font-bold text-ink mb-2">{t.title}</h1>
        <p className="text-sm text-ink-muted mb-6">{t.sub}</p>
        <div className="flex items-center justify-center gap-3">
          <button onClick={() => reset()} className="btn-primary size-md">{t.retry}</button>
          <a href={`/${lang}`} className="btn-ghost size-md">{t.home}</a>
        </div>
      </div>
    </div>
  );
}
