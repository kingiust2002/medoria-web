// components/shared/FloatingWhatsApp.jsx
// Premium floating "contact" launcher. Deliberately styled DIFFERENTLY from the
// AI assistant launcher (which is a violet brand-gradient + sparkles): this one
// is a dark navy glass orb with a cyan glow and an "online" dot, so the two
// never get visually confused. WhatsApp/Telegram are shown as elegant cards
// (brand colours only as small icon chips, not flat green/blue fills).
"use client";
import { useState, useEffect } from "react";
import { TG_USER, waLink, bulkInquiryMessage } from "@/lib/whatsapp";
import Icon from "./Icon";

const COPY = {
  tg: { title: "Бо мо дар тамос шавед", hint: "Одатан зуд ҷавоб медиҳем" },
  fa: { title: "با ما در تماس باشید", hint: "معمولاً سریع پاسخ می‌دهیم" },
  ru: { title: "Свяжитесь с нами", hint: "Обычно отвечаем быстро" },
  en: { title: "Get in touch", hint: "We usually reply fast" },
};

export default function FloatingWhatsApp({ lang }) {
  const c = COPY[lang] || COPY.en;
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 400);
    fn();
    window.addEventListener("scroll", fn);
    return () => window.removeEventListener("scroll", fn);
  }, []);

  const wa = waLink(bulkInquiryMessage(lang));
  const tg = `https://t.me/${TG_USER}`;
  const arrow = lang === "fa" ? "arrowL" : "arrow";

  const Row = ({ href, icon, chip, label }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="group/row flex items-center gap-3 rounded-2xl bg-canvas border border-line px-3 py-2.5 hover:border-brand-violet/30 hover:-translate-y-0.5 hover:shadow-soft transition-all"
    >
      <span className={`w-9 h-9 rounded-xl grid place-items-center shrink-0 ${chip}`}>
        <Icon name={icon} size={17} />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[13px] font-semibold text-ink leading-tight">{label}</span>
        <span className="block text-[11px] text-ink-muted truncate">{c.hint}</span>
      </span>
      <Icon name={arrow} size={14} className="text-ink-faint group-hover/row:text-brand-violet transition-colors" />
    </a>
  );

  return (
    <>
      {/* Desktop — premium dark FAB (only after scroll), opposite corner to the AI launcher */}
      <div
        className={`hidden md:flex fixed bottom-6 end-6 z-50 flex-col items-end gap-3 transition-all duration-300 ${
          scrolled ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 translate-y-4 pointer-events-none"
        }`}
      >
        {open && (
          <div className="w-[270px] rounded-3xl border border-line bg-surface/95 backdrop-blur-xl shadow-2xl p-3 animate-fade-up">
            <div className="px-1 pb-2.5 mb-2 border-b border-line">
              <p className="text-[13px] font-bold text-ink leading-tight">{c.title}</p>
              <p className="text-[11px] text-ink-muted mt-0.5">{c.hint}</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Row href={wa} icon="chat" chip="bg-[#22C55E]/12 text-[#22C55E]" label="WhatsApp" />
              <Row href={tg} icon="send" chip="bg-[#229ED9]/12 text-[#229ED9]" label="Telegram" />
            </div>
          </div>
        )}
        <button
          onClick={() => setOpen(!open)}
          aria-label={c.title}
          aria-expanded={open}
          className="relative h-14 w-14 rounded-full bg-navy text-white grid place-items-center shadow-[0_14px_34px_-10px_rgba(8,11,23,0.7)] ring-1 ring-white/10 hover:scale-105 active:scale-95 transition-transform"
        >
          <span className="absolute inset-0 rounded-full bg-cyan-400/25 blur-md -z-10" aria-hidden="true" />
          {!open && <span className="absolute -top-0.5 -end-0.5 w-3.5 h-3.5 rounded-full bg-emerald-400 ring-2 ring-navy" aria-hidden="true" />}
          <Icon name={open ? "close" : "chat"} size={22} strokeWidth={2} />
        </button>
      </div>

      {/* Mobile — slim premium bar */}
      <div className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-surface/95 backdrop-blur-xl border-t border-line px-3 py-2 flex gap-2 shadow-[0_-2px_12px_rgba(15,23,42,0.06)]">
        <a href={wa} target="_blank" rel="noopener noreferrer"
           className="flex-1 flex items-center justify-center gap-2 h-11 rounded-xl bg-navy text-white text-[13px] font-semibold active:scale-95 transition-transform">
          <span className="w-6 h-6 rounded-lg bg-[#22C55E]/20 text-[#22C55E] grid place-items-center"><Icon name="chat" size={14} /></span>
          WhatsApp
        </a>
        <a href={tg} target="_blank" rel="noopener noreferrer"
           className="flex-1 flex items-center justify-center gap-2 h-11 rounded-xl bg-navy text-white text-[13px] font-semibold active:scale-95 transition-transform">
          <span className="w-6 h-6 rounded-lg bg-[#229ED9]/20 text-[#229ED9] grid place-items-center"><Icon name="send" size={14} /></span>
          Telegram
        </a>
      </div>
    </>
  );
}
