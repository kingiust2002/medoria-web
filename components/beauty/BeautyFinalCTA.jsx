// components/beauty/BeautyFinalCTA.jsx — mirrors Health's FinalCTA panel
// (animated gradient, dot pattern, copy left / stacked actions right) in the
// navy→copper beauty gradient.
import Icon from "@/components/shared/Icon";
import { Reveal } from "@/components/shared/Reveal";
import { waLink, tgLink, bulkInquiryMessage } from "@/lib/whatsapp";
import { beautyCopy } from "./copy";

export default function BeautyFinalCTA({ lang }) {
  const t = beautyCopy(lang).finalCta;
  return (
    <section id="contact" className="py-14 md:py-20 bg-canvas-soft">
      <div className="container-x">
        <Reveal>
          <div
            className="relative bg-[length:200%_200%] animate-gradient-pan rounded-[2rem] p-8 md:p-14 overflow-hidden noise"
            style={{
              backgroundImage: "linear-gradient(115deg,#1C2951 0%,#31427C 40%,#B26E3F 78%,#EFC894 100%)",
              boxShadow: "0 24px 70px -14px rgba(28,41,81,0.55)",
            }}
          >
            <div className="absolute inset-0 opacity-[0.14] pointer-events-none">
              <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <pattern id="beautyCtaPattern" x="0" y="0" width="32" height="32" patternUnits="userSpaceOnUse">
                    <circle cx="2" cy="2" r="1" fill="white" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#beautyCtaPattern)" />
              </svg>
            </div>
            <div className="absolute -top-1/4 -right-1/4 w-[50%] h-[50%] rounded-full pointer-events-none"
              style={{ background: "radial-gradient(circle, rgba(255,255,255,0.16) 0%, transparent 70%)" }} />

            <div className="relative grid md:grid-cols-2 gap-8 items-center">
              <div>
                <div className="text-[10px] font-bold tracking-[0.18em] text-white/70 uppercase mb-3">{t.tag}</div>
                <h2 className="font-beauty text-2xl md:text-4xl font-semibold text-white mb-4 leading-tight">{t.h}</h2>
                <p className="text-white/85 text-[14px] md:text-base leading-relaxed">{t.sub}</p>
              </div>
              <div className="flex flex-col gap-3">
                <a href={waLink(bulkInquiryMessage(lang))} target="_blank" rel="noopener noreferrer" className="btn-wa size-xl w-full justify-center">
                  <Icon name="chat" size={18} /> {t.wa}
                </a>
                <a href={tgLink(bulkInquiryMessage(lang))} target="_blank" rel="noopener noreferrer"
                  className="btn h-14 px-7 rounded-2xl text-[14px] bg-white/15 hover:bg-white/25 text-white border border-white/30 w-full justify-center transition-colors">
                  <Icon name="send" size={18} /> {t.tgm}
                </a>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
