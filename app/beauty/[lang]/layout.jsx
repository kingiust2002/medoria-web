// app/beauty/[lang]/layout.jsx — Medoria Beauty shell. Mirrors the Health
// layout chrome (header, main, footer, floating WhatsApp) with the beauty
// reskin scope (data-vertical) + a self-hosted Playfair Display serif (latin +
// cyrillic, via next/font — no external Google Fonts request at runtime, no
// font-swap flash, only loaded on beauty routes).
import { notFound } from "next/navigation";
import { Playfair_Display } from "next/font/google";
import { LOCALES, LANG_META } from "@/lib/i18n";
import BeautyHeader from "@/components/beauty/BeautyHeader";
import BeautyFooter from "@/components/beauty/BeautyFooter";
import FloatingWhatsApp from "@/components/shared/FloatingWhatsApp";
import BeautyAiAssistant from "@/components/beauty/BeautyAiAssistant";

// Beauty's own mark — overrides the root's neutral fused favicon. Tight-
// cropped to the glyph (the source PNG carries generous transparent
// padding, which read as a faint, tiny icon at real favicon size).
export function generateMetadata({ params }) {
  const { lang } = params;
  if (!LOCALES.includes(lang)) return {};
  return { icons: { icon: { url: "/brand/beauty-mark-icon.webp", type: "image/webp" }, apple: { url: "/brand/beauty-mark-icon.webp", type: "image/webp" } } };
}

// Exposes --font-beauty (consumed by tailwind.config.js `font-beauty` and the
// [data-vertical="beauty"] .font-display / .section-h-lg rules in globals.css).
const playfairDisplay = Playfair_Display({
  subsets: ["latin", "cyrillic"],
  weight: ["500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-beauty",
  display: "swap",
});

export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export default function BeautyLayout({ children, params }) {
  const { lang } = params;
  if (!LOCALES.includes(lang)) notFound();
  const dir = LANG_META[lang].dir;
  return (
    <div
      lang={lang}
      dir={dir}
      data-vertical="beauty"
      className={`v-scope ${playfairDisplay.variable} ${dir === "rtl" ? "font-farsi" : "font-sans"}`}
    >
      <script
        dangerouslySetInnerHTML={{
          __html: `document.documentElement.lang="${lang}";document.documentElement.dir="${dir}";`,
        }}
      />
      <BeautyHeader lang={lang} />
      <main>{children}</main>
      <BeautyFooter lang={lang} />
      <FloatingWhatsApp lang={lang} />
      <BeautyAiAssistant lang={lang} />
    </div>
  );
}
