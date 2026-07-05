// components/beauty/BeautyFooter.jsx — mirrors the Health footer skeleton:
// navy base, copper hairline, brand column with WA/TG + language switcher,
// link columns, contact column, copyright row.
import Link from "next/link";
import { BeautyMarkImg } from "./BeautyBrand";
import LanguageSwitcher from "@/components/layout/LanguageSwitcher";
import Icon from "@/components/shared/Icon";
import { waLink, tgLink, bulkInquiryMessage } from "@/lib/whatsapp";
import { beautyCopy } from "./copy";

export default function BeautyFooter({ lang }) {
  const t = beautyCopy(lang);
  const email = process.env.NEXT_PUBLIC_EMAIL || "sales@medoria.tj";
  const anchors = [
    ["#collections", t.nav.collections],
    ["#worlds", t.nav.worlds],
    ["#partnership", t.nav.partnership],
  ];
  return (
    <footer className="text-white/50 pt-14 pb-24 md:pb-10 relative overflow-hidden noise" style={{ background: "#141D3C" }}>
      <div className="absolute top-0 inset-x-0 h-1" style={{ background: "linear-gradient(90deg,var(--v-navy),var(--v-copper),var(--v-brand-to))" }} />
      <div aria-hidden="true" className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(50% 60% at 85% 0%, rgba(200,125,78,0.14), transparent 60%)" }} />

      <div className="container-x relative">
        <div className="grid gap-10 md:grid-cols-12 pb-10 border-b border-white/10">
          {/* Brand */}
          <div className="md:col-span-5">
            <span dir="ltr" translate="no" aria-label="Medoria Beauty" className="flex items-center gap-3">
              <span className="rounded-full bg-white/95 p-2"><BeautyMarkImg size={26} /></span>
              <span aria-hidden="true" className="text-[12px] font-bold uppercase tracking-[0.34em] text-white/85">Beauty</span>
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
              {anchors.map(([href, label]) => (
                <li key={href}><a href={href} className="text-[13px] text-white/55 hover:text-white transition-colors">{label}</a></li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div className="md:col-span-2">
            <div className="text-white font-semibold text-[12px] tracking-wider uppercase mb-4">{t.footer.colCompany}</div>
            <ul className="space-y-2.5">
              <li><Link href={`/health/${lang}`} className="text-[13px] text-white/55 hover:text-white transition-colors">{t.nav.health}</Link></li>
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

        <div className="pt-5 text-[11px] text-white/30">{t.footer.copy}</div>
      </div>
    </footer>
  );
}
