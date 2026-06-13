// app/beauty/[lang]/layout.jsx — Medoria Beauty shell.
// PR1 ships a placeholder; the curated luxury landing + sector-scoped catalog
// arrive in a later PR. Kept deliberately minimal (own chrome, not the Health
// header/footer) and locale-validated like the Health tree.
import { notFound } from "next/navigation";
import { LOCALES, LANG_META } from "@/lib/i18n";

export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export default function BeautyLayout({ children, params }) {
  const { lang } = params;
  if (!LOCALES.includes(lang)) notFound();
  const dir = LANG_META[lang].dir;
  return (
    <div lang={lang} dir={dir} data-vertical="beauty" className={dir === "rtl" ? "font-farsi" : "font-sans"}>
      <script
        dangerouslySetInnerHTML={{
          __html: `document.documentElement.lang="${lang}";document.documentElement.dir="${dir}";`,
        }}
      />
      {children}
    </div>
  );
}
