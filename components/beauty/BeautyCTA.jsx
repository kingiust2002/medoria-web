// components/beauty/BeautyCTA.jsx — professional-partnership contact band
// (server component; WhatsApp/Telegram reuse the existing contact plumbing).
import BeautyMark from "./BeautyMark";
import Icon from "@/components/shared/Icon";
import { waLink, tgLink, bulkInquiryMessage } from "@/lib/whatsapp";
import { beautyCopy } from "./copy";

export default function BeautyCTA({ lang }) {
  const t = beautyCopy(lang).cta;
  return (
    <section id="contact" className="relative mx-auto max-w-6xl px-5 pb-28 pt-8">
      <div
        className="v-glass relative overflow-hidden rounded-[2rem] px-7 py-14 text-center sm:px-14"
        style={{ boxShadow: "var(--v-shadow)" }}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{ background: "radial-gradient(70% 90% at 50% -10%, var(--v-glow), transparent 60%)" }}
        />
        <div className="relative">
          <div className="mx-auto mb-5 w-fit"><BeautyMark size={44} /></div>
          <h2 className="font-beauty text-3xl font-bold tracking-tight sm:text-4xl" style={{ color: "var(--v-navy)" }}>
            {t.title}
          </h2>
          <p className="mx-auto mt-3 max-w-md text-[14px] leading-relaxed" style={{ color: "rgb(var(--v-ink-muted))" }}>
            {t.sub}
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
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
