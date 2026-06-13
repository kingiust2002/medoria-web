// components/beauty/BeautyTeaser.jsx — Medoria Beauty pre-launch (SSR, light).
// Carmine/rose glass atmosphere + glass editorial cards. Editorial, NOT a
// catalog — no products, prices, or availability. Tajik-first copy.
import Link from "next/link";
import Lockup from "@/components/layout/Lockup";

const COPY = {
  en: {
    eyebrow: "Pre-launch",
    desc: "A curated beauty collection for professional partners — skincare, cosmetics and selected essentials with a light, refined, trustworthy luxury.",
    blocks: [
      { title: "Skincare", sub: "Considered formulations for an everyday ritual." },
      { title: "Cosmetics", sub: "Colour and finish, quietly refined." },
      { title: "Beauty Essentials", sub: "The tools of a polished routine." },
    ],
    enterHealth: "Enter Medoria Health",
    backHome: "Back to gateway",
  },
  ru: {
    eyebrow: "Скоро",
    desc: "Кураторская бьюти-коллекция для профессиональных партнёров — уход, косметика и избранные аксессуары с лёгкой, утончённой и надёжной роскошью.",
    blocks: [
      { title: "Уход за кожей", sub: "Продуманные формулы для ежедневного ритуала." },
      { title: "Косметика", sub: "Цвет и финиш, безупречно сдержанно." },
      { title: "Аксессуары красоты", sub: "Инструменты безупречного ухода." },
    ],
    enterHealth: "В Medoria Health",
    backHome: "К выбору мира",
  },
  tg: {
    eyebrow: "Ба зудӣ",
    desc: "Маҷмӯаи зебоӣ барои шарикони касбӣ: нигоҳубин, косметика ва лавозимоти интихобӣ бо эҳсоси люкс, сабук ва боэътимод.",
    blocks: [
      { title: "Нигоҳубини пӯст", sub: "Формулаҳои санҷидашуда барои ритуали ҳаррӯза." },
      { title: "Косметика", sub: "Ранг ва ҷило, бо назокат." },
      { title: "Лавозимоти зебоӣ", sub: "Олоти нигоҳубини мукаммал." },
    ],
    enterHealth: "Ба Medoria Health",
    backHome: "Ба интихоби ҷаҳон",
  },
  fa: {
    eyebrow: "به‌زودی",
    desc: "مجموعه‌ای منتخب از زیبایی برای شرکای حرفه‌ای: مراقبت پوست، آرایش و ملزومات منتخب با لوکسی سبک، ظریف و قابل‌اعتماد.",
    blocks: [
      { title: "مراقبت پوست", sub: "فرمول‌های سنجیده برای آیینی روزانه." },
      { title: "آرایش", sub: "رنگ و پرداخت، با ظرافت." },
      { title: "ملزومات زیبایی", sub: "ابزارهای یک روتین آراسته." },
    ],
    enterHealth: "مدوریا هلث",
    backHome: "بازگشت به دروازه",
  },
};

export default function BeautyTeaser({ lang }) {
  const t = COPY[lang] || COPY.en;
  return (
    <main data-vertical="beauty" className="v-scope relative min-h-[100svh] overflow-hidden">
      {/* warm carmine / rose atmosphere */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 45% at 50% 0%, rgba(184,57,94,0.14), transparent 65%)," +
            "radial-gradient(50% 40% at 80% 30%, rgba(231,197,151,0.18), transparent 70%)",
        }}
      />
      <div
        aria-hidden="true"
        className="v-shimmer pointer-events-none absolute -inset-x-12 top-24 h-40 rotate-[-12deg]"
        style={{ background: "linear-gradient(110deg, transparent 35%, rgba(255,255,255,0.45) 50%, transparent 65%)" }}
      />

      <div className="relative mx-auto flex min-h-[100svh] max-w-4xl flex-col items-center px-6 py-16 text-center">
        <span className="mb-6 text-[10px] font-bold uppercase tracking-[0.3em]" style={{ color: "var(--v-accent)", opacity: 0.85 }}>
          ROSE · CHAMPAGNE · ELEGANT
        </span>
        <Lockup vertical="beauty" size={34} />
        <span
          className="mt-7 inline-block rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em]"
          style={{ color: "var(--v-accent)", border: "1px solid rgb(var(--v-ring))", background: "rgb(var(--v-surface) / 0.6)" }}
        >
          {t.eyebrow}
        </span>
        <p className="mt-6 max-w-xl text-[15px] leading-relaxed" style={{ color: "rgb(var(--v-ink-muted))" }}>
          {t.desc}
        </p>

        <ul className="mt-12 grid w-full gap-5 sm:grid-cols-3">
          {t.blocks.map((b, i) => (
            <li key={i} className="v-glass relative overflow-hidden rounded-2xl p-6 text-start">
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 top-0 h-px"
                style={{ background: "linear-gradient(90deg, transparent, var(--v-sheen), transparent)" }}
              />
              <div className="text-[11px] font-bold tracking-wider" style={{ color: "var(--v-accent)" }}>0{i + 1}</div>
              <h2 className="mt-2 font-display text-lg font-bold" style={{ color: "rgb(var(--v-ink))" }}>{b.title}</h2>
              <p className="mt-1.5 text-[13px] leading-relaxed" style={{ color: "rgb(var(--v-ink-muted))" }}>{b.sub}</p>
            </li>
          ))}
        </ul>

        <div className="mt-12 flex flex-wrap items-center justify-center gap-3">
          <Link href={`/health/${lang}`} className="v-cta v-focus rounded-full px-5 py-2.5 text-sm font-semibold">
            {t.enterHealth}
          </Link>
          <Link href="/" className="v-btn v-focus rounded-full px-5 py-2.5 text-sm font-semibold">
            {t.backHome}
          </Link>
        </div>
      </div>
    </main>
  );
}
