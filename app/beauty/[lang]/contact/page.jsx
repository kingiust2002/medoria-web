// app/beauty/[lang]/contact/page.jsx — server wrapper (SEO) + client contact.
import { LOCALES } from "@/lib/i18n";
import { getBeautyTranslations } from "@/components/beauty/i18n";
import ContactInner from "./ContactInner";
import { CONTACT_COPY } from "./copy";

export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export async function generateMetadata(props) {
  const params = await props.params;
  const { lang } = params;
  if (!LOCALES.includes(lang)) return {};
  const c = CONTACT_COPY[lang] || CONTACT_COPY.en;
  const t = getBeautyTranslations(lang);
  return { title: `${c.hero.title} — ${t.common.brand}`, description: c.hero.sub, robots: lang === "fa" ? { index: false, follow: true } : undefined };
}

export default async function BeautyContactPage(props) {
  const params = await props.params;
  return <ContactInner lang={params.lang} />;
}
