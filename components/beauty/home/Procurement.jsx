// components/home/Procurement.jsx
"use client";
import { useState } from "react";
import { getBeautyTranslations as getTranslations } from "@/components/beauty/i18n";
import { waLink, tgLink } from "@/lib/whatsapp";
import Icon from "@/components/shared/Icon";

const LABELS = {
  ru: {
    tag: "ПРОФЕССИОНАЛЬНОЕ СОТРУДНИЧЕСТВО",
    title: "Отправьте нам ваш запрос",
    sub: "Напишите нужные направления и бренды — пришлём прайс-лист, образцы и условия сотрудничества. Особые условия для салонов и оптовых закупок.",
    placeholder: "Ваш запрос (по одной позиции в строке)…\n\nНапример:\nУход за кожей — 10 позиций\nМакияж — 15 позиций\nБьюти-инструменты — 5 позиций",
    sendWa: "Отправить в WhatsApp",
    sendTg: "Отправить в Telegram",
    benefits: [
      ["⚡", "Быстрый ответ"],
      ["💄", "Образцы для салонов"],
      ["📦", "Доставка по Таджикистану"],
      ["📋", "Договор и счёт-фактура"],
    ],
  },
  tg: {
    tag: "ҲАМКОРИИ КАСБӢ",
    title: "Дархости худро бифиристед",
    sub: "Самтҳо ва брендҳои лозимаро нависед — прайс-лист, намунаҳо ва шартҳои ҳамкориро мефиристем. Шартҳои махсус барои салонҳо ва харидорони оптӣ.",
    placeholder: "Дархости шумо (як дар як сатр)…\n\nМисол:\nНигоҳубини пӯст — 10 ном\nОроиш — 15 ном\nАбзорҳои зебоӣ — 5 ном",
    sendWa: "Фиристодан ба WhatsApp",
    sendTg: "Фиристодан ба Telegram",
    benefits: [
      ["⚡", "Ҷавоби зуд"],
      ["💄", "Намунаҳо барои салонҳо"],
      ["📦", "Расондан ба Тоҷикистон"],
      ["📋", "Шартнома ва ҳисобнома"],
    ],
  },
  en: {
    tag: "PROFESSIONAL PARTNERSHIP",
    title: "Send us your request",
    sub: "Tell us the worlds and brands you need — we will send the price list, samples and partnership terms. Special terms for salons and wholesale.",
    placeholder: "Your request (one per line)…\n\nExample:\nSkincare — 10 items\nMakeup — 15 items\nBeauty tools — 5 items",
    sendWa: "Send to WhatsApp",
    sendTg: "Send to Telegram",
    benefits: [
      ["⚡", "Fast reply"],
      ["💄", "Samples for salons"],
      ["📦", "Delivery across Tajikistan"],
      ["📋", "Contract & invoice"],
    ],
  },
  fa: {
    tag: "همکاری حرفه‌ای",
    title: "درخواست خود را ارسال کنید",
    sub: "دنیاها و برندهای موردنیاز را بنویسید — پرایس‌لیست، نمونه و شرایط همکاری را می‌فرستیم. شرایط ویژه برای سالن‌ها و خرید عمده.",
    placeholder: "درخواست شما (هر مورد در یک خط)…\n\nمثال:\nمراقبت پوست — ۱۰ مورد\nآرایش — ۱۵ مورد\nابزار زیبایی — ۵ مورد",
    sendWa: "ارسال به واتساپ",
    sendTg: "ارسال به تلگرام",
    benefits: [
      ["⚡", "پاسخ سریع"],
      ["💄", "نمونه برای سالن‌ها"],
      ["📦", "ارسال سراسری"],
      ["📋", "قرارداد و فاکتور رسمی"],
    ],
  },
};

export default function Procurement({ lang }) {
  const t = getTranslations(lang);
  const L = LABELS[lang] || LABELS.en;
  const [list, setList] = useState("");
  const [org, setOrg] = useState("");
  const [contact, setContact] = useState("");

  const buildMessage = () => {
    return [
      lang === "fa" ? "📋 درخواست همکاری — مدوریا بیوتی" :
      lang === "tg" ? "📋 Дархости ҳамкорӣ — Medoria Beauty" :
      lang === "en" ? "📋 Partnership request — Medoria Beauty" :
                      "📋 Запрос на сотрудничество — Medoria Beauty",
      "",
      org ? `🏥 ${org}` : "",
      contact ? `📞 ${contact}` : "",
      "",
      lang === "fa" ? "📦 لیست درخواست:" :
      lang === "tg" ? "📦 Рӯйхати дархост:" :
      lang === "en" ? "📦 Request list:" :
                      "📦 Список запроса:",
      list || "—",
    ].filter(Boolean).join("\n");
  };

  return (
    <section id="procurement" className="py-14 md:py-20 bg-canvas-soft border-y border-line">
      <div className="container-x">
        <div className="grid lg:grid-cols-[1fr,1.2fr] gap-8 lg:gap-12 items-start">
          {/* Left — info */}
          <div>
            <div className="section-tag text-cyan-600 mb-3" data-fil-node>{L.tag}</div>
            <h2 className="section-h-lg mb-5 max-w-md">{L.title}</h2>
            <p className="text-[15px] text-ink-muted leading-relaxed mb-7 max-w-md">{L.sub}</p>

            <ul className="space-y-3">
              {L.benefits.map(([emoji, text], i) => (
                <li key={i} className="flex items-center gap-3">
                  <span className="text-2xl">{emoji}</span>
                  <span className="text-[14px] font-medium text-ink">{text}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Right — form */}
          <div className="card p-6 md:p-8 shadow-card">
            <div className="grid grid-cols-2 gap-3 mb-3">
              <input
                value={org}
                onChange={(e) => setOrg(e.target.value)}
                placeholder={lang === "fa" ? "سالن / سازمان" : lang === "tg" ? "Салон / ташкилот" : lang === "en" ? "Salon / organization" : "Салон / организация"}
                className="input w-full"
              />
              <input
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder={lang === "fa" ? "تلفن یا ایمیل" : lang === "tg" ? "Тамос" : lang === "en" ? "Phone or email" : "Телефон/email"}
                className="input w-full"
              />
            </div>
            <textarea
              value={list}
              onChange={(e) => setList(e.target.value)}
              rows={8}
              placeholder={L.placeholder}
              className="input w-full h-auto py-3 resize-none text-[13px] leading-relaxed font-mono"
            />

            <div className="grid grid-cols-2 gap-2 mt-4">
              <a
                href={waLink(buildMessage())}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-wa size-lg"
              >
                <Icon name="chat" size={16} />
                {L.sendWa}
              </a>
              <a
                href={tgLink(buildMessage())}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-tg size-lg"
              >
                <Icon name="send" size={16} />
                {L.sendTg}
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
