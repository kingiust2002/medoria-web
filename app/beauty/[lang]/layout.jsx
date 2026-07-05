// app/beauty/[lang]/layout.jsx — Medoria Beauty shell. Mirrors the Health
// layout chrome (header, main, footer, floating WhatsApp) with the beauty
// reskin scope (data-vertical) + the Playfair serif, loaded only here.
import { notFound } from "next/navigation";
import { LOCALES, LANG_META } from "@/lib/i18n";
import BeautyHeader from "@/components/beauty/BeautyHeader";
import BeautyFooter from "@/components/beauty/BeautyFooter";
import FloatingWhatsApp from "@/components/shared/FloatingWhatsApp";

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
      className={`v-scope ${dir === "rtl" ? "font-farsi" : "font-sans"}`}
    >
      {/* Beauty display serif — scoped to this route tree only */}
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,600;0,700;1,500;1,600&display=swap"
      />
      <script
        dangerouslySetInnerHTML={{
          __html: `document.documentElement.lang="${lang}";document.documentElement.dir="${dir}";`,
        }}
      />
      <BeautyHeader lang={lang} />
      <main>{children}</main>
      <BeautyFooter lang={lang} />
      <FloatingWhatsApp lang={lang} />
    </div>
  );
}
