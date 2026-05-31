// components/shared/FloatingWhatsApp.jsx
"use client";
import { useState, useEffect } from "react";
import { WA_NUMBER, TG_USER, waLink, bulkInquiryMessage } from "@/lib/whatsapp";
import Icon from "./Icon";

export default function FloatingWhatsApp({ lang }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 400);
    window.addEventListener("scroll", fn);
    return () => window.removeEventListener("scroll", fn);
  }, []);

  return (
    <>
      {/* Desktop floating button — only when scrolled */}
      {scrolled && (
        <div className="hidden md:flex fixed bottom-6 end-6 z-50 flex-col items-end gap-3 animate-fade-up">
          {open && (
            <div className="card p-2 flex flex-col gap-1.5">
              <a href={waLink(bulkInquiryMessage(lang))} target="_blank" rel="noopener noreferrer"
                 className="btn-wa size-md min-w-[180px]">
                <Icon name="chat" size={16} />
                WhatsApp
              </a>
              <a href={`https://t.me/${TG_USER}`} target="_blank" rel="noopener noreferrer"
                 className="btn-tg size-md min-w-[180px]">
                <Icon name="send" size={16} />
                Telegram
              </a>
            </div>
          )}
          <button
            onClick={() => setOpen(!open)}
            className="h-14 w-14 rounded-full bg-brand-gradient shadow-brand text-white flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
            aria-label="Contact"
          >
            <Icon name={open ? "close" : "chat"} size={22} strokeWidth={2.2} />
          </button>
        </div>
      )}

      {/* Mobile bottom bar — always visible on mobile */}
      <div className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-surface/95 backdrop-blur-xl border-t border-line px-4 py-2.5 flex gap-2 shadow-[0_-2px_12px_rgba(15,23,42,0.04)]">
        <a href={waLink(bulkInquiryMessage(lang))} target="_blank" rel="noopener noreferrer"
           className="btn-wa size-md flex-1">
          <Icon name="chat" size={15} />
          WhatsApp
        </a>
        <a href={`https://t.me/${TG_USER}`} target="_blank" rel="noopener noreferrer"
           className="btn-tg size-md flex-1">
          <Icon name="send" size={15} />
          Telegram
        </a>
      </div>
    </>
  );
}
