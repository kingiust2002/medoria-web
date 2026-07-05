"use client";
// components/beauty/BeautyPartnership.jsx — mirrors Health's Procurement
// section 1:1 (info + icon benefits on the left, request form card on the
// right; message assembled and handed to WhatsApp/Telegram).
import { useState } from "react";
import { waLink, tgLink } from "@/lib/whatsapp";
import Icon from "@/components/shared/Icon";
import { beautyCopy } from "./copy";

export default function BeautyPartnership({ lang }) {
  const L = beautyCopy(lang).partnership;
  const [list, setList] = useState("");
  const [org, setOrg] = useState("");
  const [contact, setContact] = useState("");

  const buildMessage = () =>
    [L.msgTitle, "", org ? `• ${org}` : "", contact ? `• ${contact}` : "", "", L.msgList, list || "—"]
      .filter(Boolean)
      .join("\n");

  return (
    <section id="partnership" className="py-14 md:py-20 bg-canvas-soft border-y border-line">
      <div className="container-x">
        <div className="grid lg:grid-cols-[1fr,1.2fr] gap-8 lg:gap-12 items-start">
          {/* Left — info */}
          <div>
            <div className="section-tag mb-3">{L.tag}</div>
            <h2 className="section-h-lg mb-5 max-w-md">{L.h}</h2>
            <p className="text-[15px] text-ink-muted leading-relaxed mb-7 max-w-md">{L.sub}</p>

            <ul className="space-y-3">
              {L.benefits.map(([icon, text], i) => (
                <li key={i} className="flex items-center gap-3">
                  <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(200,125,78,0.10)", color: "var(--v-accent)" }}>
                    <Icon name={icon} size={17} strokeWidth={1.75} />
                  </span>
                  <span className="text-[14px] font-medium text-ink">{text}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Right — request card */}
          <div className="card p-6 md:p-8 shadow-card">
            <div className="grid grid-cols-2 gap-3 mb-3">
              <input value={org} onChange={(e) => setOrg(e.target.value)} placeholder={L.org} className="input w-full" />
              <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder={L.contact} className="input w-full" />
            </div>
            <textarea
              value={list}
              onChange={(e) => setList(e.target.value)}
              placeholder={L.ph}
              rows={7}
              className="input w-full h-auto py-3 leading-relaxed resize-y mb-4"
            />
            <div className="grid sm:grid-cols-2 gap-3">
              <a href={waLink(buildMessage())} target="_blank" rel="noopener noreferrer" className="btn-wa size-lg w-full justify-center">
                <Icon name="chat" size={16} /> {L.wa}
              </a>
              <a href={tgLink(buildMessage())} target="_blank" rel="noopener noreferrer" className="btn-tg size-lg w-full justify-center">
                <Icon name="send" size={16} /> {L.tg}
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
