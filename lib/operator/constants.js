// lib/operator/constants.js — shared, secret-free constants (client + server).
export const QUOTE_STATUSES = ["new", "contacted", "in_progress", "quoted", "closed", "spam"];

export const QUOTE_STATUS_FA = {
  new: "جدید",
  contacted: "تماس گرفته شد",
  in_progress: "در حال پیگیری",
  quoted: "قیمت داده شد",
  closed: "بسته شده",
  spam: "اسپم",
};

export const QUOTE_STATUS_TONE = {
  new: "info",
  contacted: "violet",
  in_progress: "warn",
  quoted: "ok",
  closed: "muted",
  spam: "pink",
};

export const PRODUCT_BADGES = [
  { value: "", label: "بدون نشان" },
  { value: "NEW", label: "جدید (NEW)" },
  { value: "TOP", label: "پرفروش (TOP)" },
  { value: "SALE", label: "تخفیف (SALE)" },
];

export const CONTACT_FA = { whatsapp: "واتساپ", telegram: "تلگرام", phone: "تلفن" };
export const LANG_FA = { fa: "فارسی", ru: "روسی", tg: "تاجیکی", en: "انگلیسی" };
