// components/home/GlobeSection.jsx — "nationwide reach" band with an interactive globe.
"use client";
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
  return (
    <section className="relative overflow-hidden bg-navy text-white py-16 md:py-24 noise">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
      <div className="container-x grid lg:grid-cols-2 gap-10 items-center">
        <Reveal>
          <div className="text-[11px] font-bold tracking-[0.18em] uppercase text-cyan-300 mb-3">{c.tag}</div>
          <h2 className="font-display text-2xl md:text-4xl font-extrabold leading-tight mb-4">{c.title}</h2>
          <p className="text-white/70 leading-[1.85] max-w-md">{c.sub}</p>
        </Reveal>
        <Reveal delay={0.1}>
          <Globe />
        </Reveal>
      </div>
    </section>
  );
}
