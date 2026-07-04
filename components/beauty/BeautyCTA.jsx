// components/beauty/BeautyCTA.jsx — closing partnership anchor: deep navy
// panel with refined copper detailing (server component; WhatsApp/Telegram
// reuse the existing contact plumbing; a campaign backdrop slot is supported).
import Image from "next/image";
import { BeautyMarkImg } from "./BeautyBrand";
import Icon from "@/components/shared/Icon";
import { waLink, tgLink, bulkInquiryMessage } from "@/lib/whatsapp";
import { beautyCopy } from "./copy";

export default function BeautyCTA({ lang, media }) {
  const t = beautyCopy(lang).cta;
  const backdrop = media?.["cta-backdrop"];
  return (
    <section id="contact" className="relative mx-auto max-w-6xl px-5 pb-28 pt-8">
      <div
        className="relative overflow-hidden rounded-[2rem] px-7 py-16 text-center text-white sm:px-14"
        style={{ background: "var(--v-navy)", boxShadow: "var(--v-shadow)" }}
      >
        {backdrop && (
          <Image src={backdrop} alt="" fill sizes="92vw" className="object-cover opacity-25" />
        )}
        {/* copper detailing */}
        <span aria-hidden="true" className="absolute inset-x-0 top-0 h-px" style={{ background: "linear-gradient(90deg, transparent, var(--v-copper), transparent)" }} />
        <span aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(60% 80% at 50% -10%, rgba(200,125,78,0.22), transparent 60%)" }} />

        <div className="relative">
          <div className="mx-auto mb-6 w-fit rounded-full bg-white/95 p-3 shadow-lg">
            <BeautyMarkImg size={40} />
          </div>
          <h2 className="font-beauty text-3xl font-semibold tracking-tight sm:text-4xl">{t.title}</h2>
          <p className="mx-auto mt-3 max-w-md text-[14px] leading-relaxed text-white/70">{t.sub}</p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <a href={waLink(bulkInquiryMessage(lang))} target="_blank" rel="noopener noreferrer" className="btn-wa size-lg v-focus">
              <Icon name="chat" size={15} /> WhatsApp
            </a>
            <a href={tgLink(bulkInquiryMessage(lang))} target="_blank" rel="noopener noreferrer" className="btn-tg size-lg v-focus">
              <Icon name="send" size={15} /> Telegram
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
