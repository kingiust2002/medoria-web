// app/page.jsx — Medoria gateway (SSR, light, crawlable, JS-optional).
// Always rendered at "/"; it never auto-forwards. Visitors choose between
// Medoria Health (medical) and Medoria Beauty (cosmetics). Heavy scroll-driven
// motion is intentionally deferred to a later PR — this shell stays fast and
// accessible, with real headings and links that work without JavaScript.
import Link from "next/link";
import Brand from "@/components/layout/Brand";
import { SWITCHER_LOCALES, DEFAULT_LOCALE, LANG_META } from "@/lib/i18n";

export const metadata = {
  title: "Medoria — Health & Beauty in Tajikistan",
  description:
    "Choose your Medoria world — Medoria Health for medical supplies and consumables, or Medoria Beauty for premium cosmetics. Serving clinics, pharmacies and beauty professionals across Tajikistan.",
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    siteName: "Medoria",
    title: "Medoria — Health & Beauty",
    description:
      "Medoria Health for medical supplies. Medoria Beauty for premium cosmetics.",
  },
};

const SUBHEAD = { en: "Choose your world", ru: "Выберите ваш мир", tg: "Ҷаҳони худро интихоб кунед" };

const WORLDS = [
  {
    key: "health",
    cta: "Enter Medoria Health",
    name: "Medoria Health",
    tagline: {
      en: "Medical supplies & consumables",
      ru: "Медицинские товары и расходные материалы",
      tg: "Молҳои тиббӣ ва маводи масрафӣ",
    },
    ring: "#3B82F6", // clinical blue
    glow: "rgba(59,130,246,0.35)",
  },
  {
    key: "beauty",
    cta: "Enter Medoria Beauty",
    name: "Medoria Beauty",
    tagline: {
      en: "Premium cosmetics & beauty",
      ru: "Премиальная косметика и красота",
      tg: "Косметикаи махсус ва зебоӣ",
    },
    ring: "#F0289E", // rose / luxury
    glow: "rgba(240,40,158,0.32)",
  },
];

export default function Gateway() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-white text-[#0B1120]">
      {/* soft, static brand wash — light base, no JS, decorative only */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div
          className="absolute -top-1/3 left-1/2 h-[80vh] w-[80vh] -translate-x-1/2 rounded-full blur-3xl"
          style={{ background: "radial-gradient(circle, rgba(59,130,246,0.12), transparent 70%)" }}
        />
        <div
          className="absolute -bottom-1/3 left-1/4 h-[70vh] w-[70vh] rounded-full blur-3xl"
          style={{ background: "radial-gradient(circle, rgba(240,40,158,0.10), transparent 70%)" }}
        />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-5xl flex-col items-center px-5 py-12">
        <header className="flex flex-col items-center text-center">
          <Brand height={40} />
          <h1 className="mt-8 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">Medoria</h1>
          <p className="mt-3 text-sm text-[#4A5568] sm:text-base">
            {SUBHEAD.en} · {SUBHEAD.ru} · {SUBHEAD.tg}
          </p>
        </header>

        <nav aria-label="Choose a Medoria experience" className="mt-12 grid w-full gap-6 sm:grid-cols-2">
          {WORLDS.map((w) => (
            <section
              key={w.key}
              className="group relative flex flex-col rounded-3xl border border-black/[0.06] bg-white/80 p-7 shadow-[0_10px_40px_-12px_rgba(15,23,42,0.18)] backdrop-blur transition-transform duration-300 hover:-translate-y-1"
            >
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 rounded-3xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                style={{ boxShadow: `0 24px 70px -20px ${w.glow}` }}
              />
              <h2 className="text-xl font-bold sm:text-2xl">{w.name}</h2>
              <p className="mt-2 text-sm text-[#4A5568]">{w.tagline.en}</p>
              <p className="text-sm text-[#64708A]">{w.tagline.ru}</p>
              <p className="text-sm text-[#64708A]">{w.tagline.tg}</p>

              <Link
                href={`/${w.key}/${DEFAULT_LOCALE}`}
                className="mt-6 inline-flex w-fit items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white transition-transform duration-300 hover:scale-[1.03]"
                style={{ background: w.ring }}
              >
                {w.cta}
                <span aria-hidden="true">→</span>
              </Link>

              {/* per-language entry points — crawlable, JS-free */}
              <ul className="mt-5 flex flex-wrap items-center gap-2 border-t border-black/[0.05] pt-4">
                {SWITCHER_LOCALES.map((code) => (
                  <li key={code}>
                    <Link
                      href={`/${w.key}/${code}`}
                      className="rounded-md border border-black/[0.08] px-2.5 py-1 text-[12px] font-semibold text-[#334155] transition-colors hover:border-black/20"
                    >
                      {LANG_META[code].name}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </nav>

        <footer className="mt-auto pt-12 text-center text-xs text-[#94A3B8]">© {new Date().getFullYear()} Medoria</footer>
      </div>
    </main>
  );
}
