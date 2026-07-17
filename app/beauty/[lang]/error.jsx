// app/beauty/[lang]/error.jsx — graceful failure boundary for the Beauty
// routes. Localized, branded, recoverable; the underlying error never reaches
// the visitor. Links home within the Beauty vertical.
"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { LOCALES, DEFAULT_LOCALE } from "@/lib/i18n";

const COPY = {
  fa: { title: "مشکلی پیش آمد", sub: "لطفاً چند لحظه بعد دوباره تلاش کنید.", retry: "تلاش دوباره", home: "خانه" },
  tg: { title: "Хатогӣ рух дод", sub: "Лутфан баъд аз чанд лаҳза боз кӯшиш кунед.", retry: "Аз нав кӯшиш", home: "Асосӣ" },
  ru: { title: "Что-то пошло не так", sub: "Пожалуйста, попробуйте ещё раз через мгновение.", retry: "Повторить", home: "Главная" },
  en: { title: "Something went wrong", sub: "Please try again in a moment.", retry: "Try again", home: "Home" },
};

export default function BeautyError({ error, reset }) {
  const pathname = usePathname();
  const parts = (pathname || "/").split("/");
  const seg = parts[1] === "health" || parts[1] === "beauty" ? parts[2] : parts[1];
  const lang = LOCALES.includes(seg) ? seg : DEFAULT_LOCALE;
  const t = COPY[lang] || COPY.en;

  useEffect(() => {
    console.error("beauty page error:", error?.digest || error?.message);
  }, [error]);

  return (
    <div dir={lang === "fa" ? "rtl" : "ltr"} className="min-h-[60vh] flex items-center justify-center bg-canvas-soft px-4">
      <div className="text-center max-w-md">
        <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-warn/10 text-warn flex items-center justify-center text-2xl font-bold">!</div>
        <h1 className="font-display text-2xl font-bold text-ink mb-2">{t.title}</h1>
        <p className="text-sm text-ink-muted mb-6">{t.sub}</p>
        <div className="flex items-center justify-center gap-3">
          <button onClick={() => reset()} className="btn-primary size-md">{t.retry}</button>
          <a href={`/beauty/${lang}`} className="btn-contact size-md">{t.home}</a>
        </div>
      </div>
    </div>
  );
}
