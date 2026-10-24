// app/health/[lang]/catalog/[slug]/not-found.jsx
// Shown (with a real HTTP 404) when the product slug is unknown OR the product is
// archived (is_active = false). A client component only so it can read the locale
// from the URL: not-found boundaries receive no props.
"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { LOCALES, DEFAULT_LOCALE, getTranslations } from "@/lib/i18n";
import Icon from "@/components/shared/Icon";

export default function ProductNotFound() {
  const params = useParams();
  const lang = LOCALES.includes(params?.lang) ? params.lang : DEFAULT_LOCALE;
  const t = getTranslations(lang);
  return (
    <div className="container-x py-20 text-center">
      <Icon name="package" size={48} className="text-ink-faint mx-auto mb-4" strokeWidth={1.2} />
      <p className="text-ink-muted">{t.common.noResults}</p>
      <Link href={`/health/${lang}/catalog`} className="btn-primary size-md mt-6 inline-flex">
        {t.product.backToCatalog.replace(/[←→]/g, "").trim()}
      </Link>
    </div>
  );
}
