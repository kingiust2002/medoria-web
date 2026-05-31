// components/layout/Footer.jsx
import Link from "next/link";
import Logo from "./Logo";
import LanguageSwitcher from "./LanguageSwitcher";
import { getTranslations, CATEGORIES, getCategoryName } from "@/lib/i18n";
import { WA_NUMBER, TG_USER, waLink, bulkInquiryMessage } from "@/lib/whatsapp";
import Icon from "@/components/shared/Icon";
import Aurora from "@/components/shared/Aurora";

export default function Footer({ lang }) {
  const t = getTranslations(lang);

  return (
    <footer className="bg-navy text-white/50 pt-14 pb-24 md:pb-10 relative overflow-hidden noise">
      {/* Decorative gradient */}
      <div className="absolute top-0 inset-x-0 h-1 bg-brand-gradient" />
      <Aurora variant="dark" className="opacity-30" />

      <div className="container-x relative">
        <div className="grid gap-10 md:grid-cols-12 pb-10 border-b border-white/10">
          {/* Brand */}
          <div className="md:col-span-5">
            <Logo size={40} variant="full" white />
            <p className="mt-4 text-[13px] leading-relaxed max-w-xs text-white/60">{t.footer.desc}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <a href={waLink(bulkInquiryMessage(lang))} target="_blank" rel="noopener noreferrer"
                 className="btn-wa size-sm">
                <Icon name="chat" size={13} />
                {t.common.whatsapp}
              </a>
              <a href={`https://t.me/${TG_USER}`} target="_blank" rel="noopener noreferrer"
                 className="btn-tg size-sm">
                <Icon name="send" size={13} />
                {t.common.telegram}
              </a>
            </div>
            <div className="mt-5">
              <LanguageSwitcher lang={lang} white />
            </div>
          </div>

          {/* Catalog */}
          <div className="md:col-span-3">
            <div className="text-white font-semibold text-[12px] tracking-wider uppercase mb-4">{t.footer.catalog}</div>
            <ul className="space-y-2.5">
              <li><Link href={`/${lang}/catalog`} className="text-[13px] text-white/55 hover:text-white transition-colors">{t.common.all} {t.common.catalog.toLowerCase()}</Link></li>
              <li><Link href={`/${lang}/categories`} className="text-[13px] text-white/55 hover:text-white transition-colors">{t.common.categories}</Link></li>
              {CATEGORIES.slice(0, 3).map((c) => (
                <li key={c.slug}>
                  <Link href={`/${lang}/catalog?category=${c.slug}`} className="text-[13px] text-white/55 hover:text-white transition-colors">
                    {getCategoryName(c.slug, lang)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div className="md:col-span-2">
            <div className="text-white font-semibold text-[12px] tracking-wider uppercase mb-4">{t.footer.company}</div>
            <ul className="space-y-2.5">
              <li><Link href={`/${lang}/about`} className="text-[13px] text-white/55 hover:text-white transition-colors">{t.common.about}</Link></li>
              <li><Link href={`/${lang}/contact`} className="text-[13px] text-white/55 hover:text-white transition-colors">{t.common.contact}</Link></li>
              <li><Link href={`/${lang}/compare`} className="text-[13px] text-white/55 hover:text-white transition-colors">{t.compare.title}</Link></li>
            </ul>
          </div>

          {/* Contact */}
          <div className="md:col-span-2">
            <div className="text-white font-semibold text-[12px] tracking-wider uppercase mb-4">{t.footer.contact}</div>
            <ul className="space-y-2.5 text-[13px] text-white/55">
              <li className="flex items-start gap-2"><Icon name="mapPin" size={13} className="mt-0.5 shrink-0" />{t.common.address}</li>
              <li className="flex items-start gap-2">
                <Icon name="mail" size={13} className="mt-0.5 shrink-0" />
                <a href={`mailto:${process.env.NEXT_PUBLIC_EMAIL || "sales@medoria.tj"}`} className="hover:text-white transition-colors break-all">
                  {process.env.NEXT_PUBLIC_EMAIL || "sales@medoria.tj"}
                </a>
              </li>
              <li className="text-white/40 pt-2 leading-relaxed">{t.footer.work}</li>
            </ul>
          </div>
        </div>

        <div className="pt-5 text-[11px] text-white/30">{t.footer.copy}</div>
      </div>
    </footer>
  );
}
