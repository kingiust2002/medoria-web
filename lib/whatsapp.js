// lib/whatsapp.js
// Generate professional, multilingual inquiry messages.
// Prices are rendered via lib/price.js so "request price" products never
// produce a "$null" line.
import { priceLine } from "@/lib/price";

const WA_NUMBER = process.env.NEXT_PUBLIC_WA_NUMBER || "992000000000";
const TG_USER   = process.env.NEXT_PUBLIC_TG_USERNAME || "medoria_tj";

const MSG_TEMPLATES = {
  ru: (p, qty, org, url, priceStr) => `Здравствуйте! Прошу прислать актуальную цену и наличие:

📦 Товар: ${p.name_ru || p.name_en}
🔖 Код: ${p.sku || "—"}
💵 Цена в каталоге: ${priceStr}
🔢 Нужное количество: ${qty || "—"}
🏥 Организация: ${org || "—"}
🔗 Ссылка: ${url}

Спасибо!`,

  tg: (p, qty, org, url, priceStr) => `Салом! Лутфан нарх ва мавҷудии ҷориро равон кунед:

📦 Мол: ${p.name_tg || p.name_en}
🔖 Код: ${p.sku || "—"}
💵 Нарх дар каталог: ${priceStr}
🔢 Миқдори лозимӣ: ${qty || "—"}
🏥 Ташкилот: ${org || "—"}
🔗 Истинод: ${url}

Раҳмат!`,

  en: (p, qty, org, url, priceStr) => `Hello! Please send current price and availability:

📦 Product: ${p.name_en}
🔖 SKU: ${p.sku || "—"}
💵 Catalog price: ${priceStr}
🔢 Quantity needed: ${qty || "—"}
🏥 Organization: ${org || "—"}
🔗 Link: ${url}

Thank you!`,

  fa: (p, qty, org, url, priceStr) => `سلام! لطفاً قیمت روز و موجودی این محصول را ارسال کنید:

📦 محصول: ${p.name_fa || p.name_en}
🔖 کد: ${p.sku || "—"}
💵 قیمت کاتالوگ: ${priceStr}
🔢 تعداد مورد نیاز: ${qty || "—"}
🏥 سازمان: ${org || "—"}
🔗 لینک: ${url}

با تشکر!`,
};

const QUICK_TEMPLATES = {
  ru: (p, url, priceStr) => `Здравствуйте! Интересует "${p.name_ru || p.name_en}" — ${priceStr}. ${url}`,
  tg: (p, url, priceStr) => `Салом! "${p.name_tg || p.name_en}" — ${priceStr}. ${url}`,
  en: (p, url, priceStr) => `Hello! Interested in "${p.name_en}" — ${priceStr}. ${url}`,
  fa: (p, url, priceStr) => `سلام! می‌خواهم درباره "${p.name_fa || p.name_en}" — ${priceStr} اطلاع بگیرم. ${url}`,
};

const BULK_TEMPLATES = {
  ru: () => `Здравствуйте! Хотел бы получить прайс-лист и обсудить условия поставки для нашей организации.`,
  tg: () => `Салом! Мехоҳам нархнома гирам ва шартҳои таҳвилро муҳокима кунам.`,
  en: () => `Hello! I'd like to receive your price list and discuss supply terms for our organization.`,
  fa: () => `سلام! می‌خواهم لیست قیمت دریافت کنم و شرایط تأمین برای سازمان خود را بررسی کنم.`,
};

export function waLink(message) {
  return `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(message)}`;
}

export function tgLink(message) {
  return `https://t.me/${TG_USER}?text=${encodeURIComponent(message)}`;
}

export function productInquiryMessage(product, lang, { qty, org, url } = {}) {
  const fn = MSG_TEMPLATES[lang] || MSG_TEMPLATES.en;
  return fn(product, qty, org, url || "", priceLine(product, lang));
}

export function quickInquiryMessage(product, lang, url) {
  const fn = QUICK_TEMPLATES[lang] || QUICK_TEMPLATES.en;
  return fn(product, url || "", priceLine(product, lang));
}

export function bulkInquiryMessage(lang) {
  const fn = BULK_TEMPLATES[lang] || BULK_TEMPLATES.en;
  return fn();
}

export { WA_NUMBER, TG_USER };
