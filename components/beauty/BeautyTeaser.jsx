// components/beauty/BeautyTeaser.jsx — premium Medoria Beauty pre-launch (SSR).
// Uses the additive beauty token scope (light-first). Editorial, NOT a product
// catalog — the real curated landing + products arrive in a later PR.
import Link from "next/link";
import Lockup from "@/components/layout/Lockup";

const COPY = {
  en: {
    eyebrow: "Pre-launch",
    desc: "A considered world of skincare, cosmetics and beauty essentials — curated, premium, and arriving soon.",
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
    desc: "Продуманный мир ухода, косметики и бьюти-эссеншалс — кураторская подборка, премиально, уже скоро.",
    blocks: [
      { title: "Уход за кожей", sub: "Продуманные формулы для ежедневного ритуала." },
      { title: "Косметика", sub: "Цвет и финиш, безупречно сдержанно." },
      { title: "Бьюти-эссеншалс", sub: "Инструменты безупречного ухода." },
    ],
    enterHealth: "В Medoria Health",
    backHome: "К выбору мира",
  },
  tg: {
    eyebrow: "Ба зудӣ",
    desc: "Ҷаҳони интихобшудаи нигоҳубини пӯст, косметика ва маводи зебоӣ — премиалӣ ва ба зудӣ.",
    blocks: [
      { title: "Нигоҳубини пӯст", sub: "Формулаҳои санҷидашуда барои ритуали ҳаррӯза." },
      { title: "Косметика", sub: "Ранг ва ҷило, бо назокат." },
      { title: "Маводи зебоӣ", sub: "Олоти нигоҳубини мукаммал." },
    ],
    enterHealth: "Ба Medoria Health",
    backHome: "Ба интихоби ҷаҳон",
  },
  fa: {
    eyebrow: "به‌زودی",
    desc: "دنیایی سنجیده از مراقبت پوست، آرایش و ملزومات زیبایی — منتخب، ممتاز و به‌زودی.",
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
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(85% 55% at 50% 0%, var(--v-glow), transparent 70%)" }}
      />
      <div className="relative mx-auto flex min-h-[100svh] max-w-4xl flex-col items-center px-6 py-16 text-center">
        <Lockup vertical="beauty" size={30} />
        <span
          className="mt-9 inline-block rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em]"
          style={{ color: "var(--v-accent)", border: "1px solid rgb(var(--v-ring))" }}
        >
          {t.eyebrow}
        </span>
        <h1 className="mt-5 font-display text-4xl font-extrabold tracking-tight sm:text-5xl" style={{ color: "rgb(var(--v-ink))" }}>
          Medoria Beauty
        </h1>
        <p className="mt-4 max-w-xl text-[15px] leading-relaxed" style={{ color: "rgb(var(--v-ink-muted))" }}>
          {t.desc}
        </p>

        <ul className="mt-12 grid w-full gap-5 sm:grid-cols-3">
          {t.blocks.map((b, i) => (
            <li key={i} className="v-glass rounded-2xl p-6 text-start">
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
          <Link
            href="/"
            className="v-focus rounded-full px-5 py-2.5 text-sm font-semibold"
            style={{ color: "rgb(var(--v-ink-muted))", border: "1px solid rgb(var(--v-line))" }}
          >
            {t.backHome}
          </Link>
        </div>
      </div>
    </main>
  );
}
