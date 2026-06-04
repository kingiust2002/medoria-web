// components/home/GlobeSection.jsx — "nationwide reach" band with a real 3D globe.
// Theme-aware: dark navy band + dark globe in dark mode; light band + light globe
// in light mode. The globe (cobe/WebGL) is client-only.
"use client";
import { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import dynamic from "next/dynamic";
import { Reveal } from "@/components/shared/Reveal";

const Globe = dynamic(() => import("@/components/shared/Globe"), { ssr: false });

const COPY = {
  fa: { tag: "دسترسی سراسری", title: "تأمین مطمئن در سراسر تاجیکستان", sub: "از دوشنبه تا دورترین نقاط — تحویل سریع، قیمت رقابتی و پشتیبانی محلی." },
  ru: { tag: "ОХВАТ ПО СТРАНЕ", title: "Надёжные поставки по всему Таджикистану", sub: "От Душанбе до самых отдалённых районов — быстрая доставка и местная поддержка." },
  tg: { tag: "ФАРОГИРИИ САРОСАРӢ", title: "Таъминоти боэътимод дар саросари Тоҷикистон", sub: "Аз Душанбе то дурдасттарин минтақаҳо — расондани зуд ва дастгирии маҳаллӣ." },
  en: { tag: "NATIONWIDE REACH", title: "Reliable supply across Tajikistan", sub: "From Dushanbe to the most remote regions — fast delivery, fair pricing and local support." },
};

export default function GlobeSection({ lang }) {
  const c = COPY[lang] || COPY.en;
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const dark = !mounted || resolvedTheme === "dark";

  return (
    <section className={`relative overflow-hidden py-16 md:py-24 ${dark ? "bg-navy text-white noise" : "bg-canvas-soft text-ink border-y border-line"}`}>
      <div className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent ${dark ? "via-white/30" : "via-brand-violet/25"} to-transparent`} />
      <div className="container-x grid lg:grid-cols-2 gap-10 items-center">
        <Reveal>
          <div className={`text-[11px] font-bold tracking-[0.18em] uppercase mb-3 ${dark ? "text-cyan-300" : "gradient-text"}`}>{c.tag}</div>
          <h2 className="font-display text-2xl md:text-4xl font-extrabold leading-tight mb-4">{c.title}</h2>
          <p className={`leading-[1.85] max-w-md ${dark ? "text-white/70" : "text-ink-muted"}`}>{c.sub}</p>
        </Reveal>
        <Reveal delay={0.1}>
          <Globe dark={dark} />
        </Reveal>
      </div>
    </section>
  );
}
