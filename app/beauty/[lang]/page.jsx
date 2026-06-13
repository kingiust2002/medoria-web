// app/beauty/[lang]/page.jsx — Medoria Beauty placeholder.
// Real curated landing + catalog arrive in a later PR; this thin page is kept
// noindex until then so it never competes in search as an empty page.
import Link from "next/link";
import { notFound } from "next/navigation";
import Brand from "@/components/layout/Brand";
import { LOCALES } from "@/lib/i18n";

const COPY = {
  tg: { kicker: "Ба зудӣ", body: "Ҷаҳони косметика ва зебоии Medoria ба зудӣ меояд.", health: "Ба Medoria Health", home: "Интихоби ҷаҳон" },
  ru: { kicker: "Скоро", body: "Премиальный мир косметики и красоты Medoria скоро откроется.", health: "В Medoria Health", home: "Выбор мира" },
  en: { kicker: "Coming soon", body: "Medoria’s premium world of cosmetics & beauty is coming soon.", health: "Visit Medoria Health", home: "Choose your world" },
  fa: { kicker: "به‌زودی", body: "دنیای آرایشی و زیبایی مدوریا به‌زودی.", health: "مدوریا هلث", home: "انتخاب دنیا" },
};

export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export function generateMetadata({ params }) {
  const { lang } = params;
  return {
    title: "Medoria Beauty — Coming soon",
    robots: { index: false, follow: true },
    alternates: { canonical: `/beauty/${lang}` },
  };
}

export default function BeautyComingSoon({ params }) {
  const { lang } = params;
  if (!LOCALES.includes(lang)) notFound();
  const t = COPY[lang] || COPY.en;
  return (
    <main className="relative min-h-screen overflow-hidden bg-white text-[#0B1120]">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div
          className="absolute left-1/2 top-1/4 h-[70vh] w-[70vh] -translate-x-1/2 rounded-full blur-3xl"
          style={{ background: "radial-gradient(circle, rgba(240,40,158,0.12), transparent 70%)" }}
        />
      </div>
      <div className="relative mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-5 text-center">
        <Brand height={40} />
        <span className="mt-8 inline-block rounded-full border border-[#F0289E]/30 bg-[#F0289E]/5 px-3 py-1 text-[12px] font-semibold uppercase tracking-wide text-[#C81E86]">
          {t.kicker}
        </span>
        <h1 className="mt-4 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">Medoria Beauty</h1>
        <p className="mt-4 max-w-md text-[#4A5568]">{t.body}</p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href={`/health/${lang}`} className="rounded-full bg-[#3B82F6] px-5 py-2.5 text-sm font-semibold text-white">
            {t.health}
          </Link>
          <Link href="/" className="rounded-full border border-black/10 px-5 py-2.5 text-sm font-semibold text-[#334155]">
            {t.home}
          </Link>
        </div>
      </div>
    </main>
  );
}
