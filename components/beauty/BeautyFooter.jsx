// components/beauty/BeautyFooter.jsx — mirrors the Health footer skeleton:
// navy base, copper hairline, brand column with WA/TG + language switcher,
// link columns, contact column, copyright row.
import Link from "next/link";
import { BeautyWordLockup } from "./BeautyBrand";
import LanguageSwitcher from "@/components/layout/LanguageSwitcher";
import Icon from "@/components/shared/Icon";
import { waLink, tgLink, bulkInquiryMessage } from "@/lib/whatsapp";
import { getBeautyTranslations } from "./i18n";

export default function BeautyFooter({ lang }) {
  const t = getBeautyTranslations(lang);
  const email = process.env.NEXT_PUBLIC_EMAIL || "sales@medoria.tj";
  const home = `/beauty/${lang}`;
  const links = [
    [`${home}/catalog`, t.nav.collections],
    [`${home}/worlds`, t.nav.worlds],
    [`${home}/about`, t.nav.about],
    [`${home}/contact`, t.nav.contact],
  ];
  return (
    <footer className="text-white/50 pt-14 pb-24 md:pb-10 relative overflow-hidden noise" style={{ background: "#141D3C" }}>
      <div className="absolute top-0 inset-x-0 h-1" style={{ background: "linear-gradient(90deg,var(--v-navy),var(--v-copper),var(--v-brand-to))" }} />
      <div aria-hidden="true" className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(50% 60% at 85% 0%, rgba(200,125,78,0.14), transparent 60%)" }} />

      <div className="container-x relative">
        <div className="grid gap-10 md:grid-cols-12 pb-10 border-b border-white/10">
          {/* Brand */}
          <div className="md:col-span-5">
            {/* Beauty's official wordmarks are navy-toned — they disappear on
                this navy footer, so (like Health.jsx's onDark swap) the whole
                lockup sits on its own light badge instead of the page bg. */}
            <span className="inline-flex w-fit items-center rounded-full bg-white/95 py-2 px-3.5">
              <BeautyWordLockup height={20} />
            </span>
            <p className="mt-4 text-[13px] leading-relaxed max-w-xs text-white/60">{t.footer.desc}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <a href={waLink(bulkInquiryMessage(lang))} target="_blank" rel="noopener noreferrer" className="btn-wa size-sm">
                <Icon name="chat" size={13} /> WhatsApp
              </a>
              <a href={tgLink(bulkInquiryMessage(lang))} target="_blank" rel="noopener noreferrer" className="btn-tg size-sm">
                <Icon name="send" size={13} /> Telegram
              </a>
            </div>
            <div className="mt-5 flex items-center gap-3">
              <LanguageSwitcher lang={lang} white />
            </div>
          </div>

          {/* Collection */}
          <div className="md:col-span-3">
            <div className="text-white font-semibold text-[12px] tracking-wider uppercase mb-4">{t.footer.colCollection}</div>
            <ul className="space-y-2.5">
              {links.map(([href, label]) => (
                <li key={href}><Link href={href} className="text-[13px] text-white/55 hover:text-white transition-colors">{label}</Link></li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div className="md:col-span-2">
            <div className="text-white font-semibold text-[12px] tracking-wider uppercase mb-4">{t.footer.colCompany}</div>
            <ul className="space-y-2.5">
              <li><Link href={`${home}/about`} className="text-[13px] text-white/55 hover:text-white transition-colors">{t.nav.about}</Link></li>
              <li><Link href="/" className="text-[13px] text-white/55 hover:text-white transition-colors">{t.nav.gateway}</Link></li>
            </ul>
          </div>

          {/* Contact */}
          <div className="md:col-span-2">
            <div className="text-white font-semibold text-[12px] tracking-wider uppercase mb-4">{t.footer.colContact}</div>
            <ul className="space-y-2.5 text-[13px] text-white/55">
              <li className="flex items-start gap-2">
                <Icon name="mail" size={13} className="mt-0.5 shrink-0" />
                <a href={`mailto:${email}`} className="hover:text-white transition-colors break-all">{email}</a>
              </li>
            </ul>
          </div>
        </div>

        <div className="pt-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="text-[11px] text-white/30">{t.footer.copy}</div>
          {/* Single cross-vertical entry — lives here at the very bottom instead
              of the top nav; the mirror of it will be added to Health later. */}
          <Link href={`/health/${lang}`}
            className="group inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/[0.06] hover:bg-white/[0.12] px-4 py-2 text-[12px] font-semibold text-white/85 hover:text-white transition-colors">
            <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--v-copper)]" />
            {t.common.enterHealth}
            <Icon name={lang === "fa" ? "arrowL" : "arrow"} size={13} className="transition-transform group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
          </Link>
        </div>
      </div>
    </footer>
  );
}
