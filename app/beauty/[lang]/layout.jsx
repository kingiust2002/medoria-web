// app/beauty/[lang]/layout.jsx — Medoria Beauty shell: nude-luxury tokens
// (data-vertical), the Playfair Display serif (latin + cyrillic, loaded only on
// beauty routes), and the world's own slim chrome. Locale-validated like Health.
import { notFound } from "next/navigation";
import { LOCALES, LANG_META } from "@/lib/i18n";
import BeautyHeader from "@/components/beauty/BeautyHeader";
import BeautyFooter from "@/components/beauty/BeautyFooter";

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
    </div>
  );
}
