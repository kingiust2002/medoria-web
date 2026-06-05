// app/[lang]/contact/page.jsx — server wrapper (SEO) + client contact page.
import { LOCALES, getTranslations } from "@/lib/i18n";
import { buildAlternates } from "@/lib/seo";
import ContactInner from "./ContactInner";

export async function generateMetadata({ params }) {
  const { lang } = params;
  if (!LOCALES.includes(lang)) return {};
  const t = getTranslations(lang);
  return {
    title: `${t.contact.hero.title} — ${t.common.brand}`,
    description: t.contact.hero.sub,
    alternates: buildAlternates(lang, "/contact"),
  };
}

export default function ContactPage({ params }) {
  return <ContactInner lang={params.lang} />;
}
