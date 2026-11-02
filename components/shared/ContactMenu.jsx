// components/shared/ContactMenu.jsx
// The header "Contact" button as a small disclosure: click it and the three
// channels — WhatsApp, Telegram, Email — open in a list. Shared by the Health
// and Beauty headers; each passes its own house address and subject.
//   mode="dropdown"  desktop: a popover under the button
//   mode="inline"    mobile drawer: the list expands in place under the button
"use client";
import { useEffect, useId, useRef, useState } from "react";
import { bulkInquiryMessage } from "@/lib/whatsapp";
import { mailtoLink } from "@/lib/contact";
import Icon from "./Icon";
import { useContact } from "@/components/shared/ContactContext";

const EMAIL_LABEL = { tg: "Почта", fa: "ایمیل", ru: "Эл. почта", en: "Email" };

export default function ContactMenu({
  lang,
  label,
  email = "",
  emailSubject = "Medoria",
  className = "btn-primary size-sm",
  mode = "dropdown",
  onNavigate,
}) {
  const { waLink, TG_USER } = useContact();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const buttonRef = useRef(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const message = bulkInquiryMessage(lang);
  const items = [
    { href: waLink(message), icon: "chat", chip: "bg-[#22C55E]/12 text-[#22C55E]", label: "WhatsApp", external: true },
    { href: `https://t.me/${TG_USER}`, icon: "send", chip: "bg-[#229ED9]/12 text-[#229ED9]", label: "Telegram", external: true },
  ];
  const mail = mailtoLink(email, { subject: emailSubject, body: message });
  if (mail) {
    items.push({
      href: mail,
      icon: "mail",
      chip: "bg-brand-violet/10 text-brand-violet",
      label: EMAIL_LABEL[lang] || EMAIL_LABEL.en,
      external: false,
    });
  }

  const list = (
    <ul
      id={listId}
      className={
        mode === "dropdown"
          ? "absolute inset-x-0 top-full mt-2 z-50 rounded-xl border border-line bg-surface/95 backdrop-blur-xl shadow-2xl p-1.5 flex flex-col gap-1 animate-fade-up"
          : "mt-2 flex flex-col gap-1.5"
      }
    >
      {items.map((it) => (
        <li key={it.label}>
          <a
            href={it.href}
            {...(it.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            onClick={() => {
              setOpen(false);
              onNavigate?.();
            }}
            className="flex items-center gap-2.5 rounded-lg bg-canvas border border-line px-2 py-1.5 text-ink hover:border-brand-violet/30 hover:shadow-soft transition-all"
          >
            <span className={`w-7 h-7 rounded-lg grid place-items-center shrink-0 ${it.chip}`}>
              <Icon name={it.icon} size={14} />
            </span>
            <span className="flex-1 min-w-0 text-[12px] font-semibold leading-tight" dir="auto">
              {it.label}
            </span>
          </a>
        </li>
      ))}
    </ul>
  );

  return (
    <div
      ref={wrapRef}
      // dropdown: the wrapper is exactly as wide as the button and the list matches it
      className={mode === "dropdown" ? "relative min-w-[136px]" : "w-full"}
      onBlur={(e) => {
        // close when focus leaves the whole widget (keyboard users tabbing out)
        if (open && wrapRef.current && !wrapRef.current.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={listId}
        className={`${className} ${mode === "dropdown" ? "w-full justify-center" : ""}`}
      >
        <Icon name="chat" size={mode === "dropdown" ? 15 : 16} />
        {label}
        <Icon
          name="chevronDown"
          size={14}
          className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && list}
    </div>
  );
}
