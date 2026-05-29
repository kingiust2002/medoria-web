// components/home/Procurement.jsx
"use client";
import { useState } from "react";
import { getTranslations } from "@/lib/i18n";
import { waLink, tgLink } from "@/lib/whatsapp";
import Icon from "@/components/shared/Icon";

const LABELS = {
  ru: {
    tag: "ОПТОВЫЕ ЗАКУПКИ",
    title: "Отправьте нам ваш список закупок",
    sub: "Загрузите список нужных позиций — мы пришлём актуальные цены, наличие и условия в течение часа. Особые условия для больниц и оптовых дистрибьюторов.",
    placeholder: "Список позиций (по одной в строке)…\n\nНапример:\nПерчатки нитриловые, размер M — 500 уп.\nМаски 3-сл — 1000 шт.\nШприц 5мл — 2000 шт.",
    sendWa: "Отправить в WhatsApp",
    sendTg: "Отправить в Telegram",
    benefits: [
      ["⚡", "Ответ в течение часа"],
      ["💰", "Цены ниже рыночных"],
      ["📦", "Доставка по Таджикистану"],
      ["📋", "Договор и счёт-фактура"],
    ],
  },
  tg: {
    tag: "ХАРИДОРИИ ОПТӢ",
    title: "Рӯйхати харидҳои худро бифиристед",
    sub: "Рӯйхати маводи лозимаро бифиристед — дар як соат нархҳои нав, мавҷудӣ ва шартҳоро мефиристем. Шартҳои махсус барои беморхонаҳо ва дистрибьюторҳо.",
    placeholder: "Рӯйхати маҳсулот (як дар як сатр)…\n\nМисол:\nДастпӯши нитрилӣ, M — 500 қ.\nНиқоби 3-қабата — 1000 д.\nШприци 5мл — 2000 д.",
    sendWa: "Фиристодан ба WhatsApp",
    sendTg: "Фиристодан ба Telegram",
    benefits: [
      ["⚡", "Ҷавоб дар як соат"],
      ["💰", "Нархҳои аз бозор паст"],
      ["📦", "Расондан ба Тоҷикистон"],
      ["📋", "Шартнома ва ҳисобнома"],
    ],
  },
  en: {
    tag: "BULK PROCUREMENT",
    title: "Send us your procurement list",
    sub: "Upload your list of needed items — we'll send current prices, availability, and terms within an hour. Special terms for hospitals and wholesale distributors.",
    placeholder: "List of items (one per line)…\n\nExample:\nNitrile gloves, size M — 500 boxes\n3-ply masks — 1000 pcs\n5ml syringes — 2000 pcs",
    sendWa: "Send to WhatsApp",
    sendTg: "Send to Telegram",
    benefits: [
      ["⚡", "Reply within an hour"],
      ["💰", "Better than market prices"],
      ["📦", "Delivery across Tajikistan"],
      ["📋", "Contract & invoice"],
    ],
  },
  fa: {
    tag: "خرید عمده",
    title: "لیست خرید خود را ارسال کنید",
    sub: "لیست محصولات مورد نیاز خود را ارسال کنید — ظرف یک ساعت قیمت‌های روز، موجودی و شرایط را می‌فرستیم. شرایط ویژه برای بیمارستان‌ها و توزیع‌کنندگان عمده.",
    placeholder: "لیست محصولات (هر کدام در یک خط)…\n\nمثال:\nدستکش نیتریل، سایز M — ۵۰۰ بسته\nماسک ۳ لایه — ۱۰۰۰ عدد\nسرنگ ۵cc — ۲۰۰۰ عدد",
    sendWa: "ارسال به واتساپ",
    sendTg: "ارسال به تلگرام",
    benefits: [
      ["⚡", "پاسخ ظرف یک ساعت"],
      ["💰", "قیمت‌های پایین‌تر از بازار"],
      ["📦", "تحویل در سراسر تاجیکستان"],
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
      lang === "fa" ? "📋 درخواست خرید عمده" :
      lang === "tg" ? "📋 Дархости харидории оптӣ" :
      lang === "en" ? "📋 Bulk procurement request" :
                      "📋 Запрос на оптовую закупку",
      "",
      org ? `🏥 ${org}` : "",
      contact ? `📞 ${contact}` : "",
      "",
      lang === "fa" ? "📦 لیست محصولات:" :
      lang === "tg" ? "📦 Рӯйхати маҳсулот:" :
      lang === "en" ? "📦 Product list:" :
                      "📦 Список товаров:",
      list || "—",
    ].filter(Boolean).join("\n");
  };

  return (
    <section id="procurement" className="py-14 md:py-20 bg-canvas-soft border-y border-line">
      <div className="container-x">
        <div className="grid lg:grid-cols-[1fr,1.2fr] gap-8 lg:gap-12 items-start">
          {/* Left — info */}
          <div>
            <div className="section-tag text-cyan-600 mb-3">{L.tag}</div>
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
                placeholder={lang === "fa" ? "نام سازمان" : lang === "tg" ? "Ташкилот" : lang === "en" ? "Organization" : "Организация"}
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
