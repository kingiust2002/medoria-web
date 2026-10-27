
import { tr } from "../panel/i18n.js";
// lib/operator/constants.js — shared, secret-free constants (client + server).
export const QUOTE_STATUSES = ["new", "contacted", "in_progress", "quoted", "closed", "archived", "spam"];

// The panel's "active" tab: everything that is neither archived nor spam.
// "archived" needs migration 29 (it widens the status CHECK of both tables).
export const QUOTE_ACTIVE_STATUSES = ["new", "contacted", "in_progress", "quoted", "closed"];

export const QUOTE_STATUS_FA = {
  new: tr("جدید"),
  contacted: tr("تماس گرفته شد"),
  in_progress: tr("در حال پیگیری"),
  quoted: tr("قیمت داده شد"),
  closed: tr("بسته شده"),
  archived: tr("آرشیو شده"),
  spam: tr("اسپم"),
};

export const QUOTE_STATUS_TONE = {
  new: "info",
  contacted: "violet",
  in_progress: "warn",
  quoted: "ok",
  closed: "muted",
  archived: "muted",
  spam: "pink",
};

export const PRODUCT_BADGES = [
  { value: "", label: tr("بدون نشان") },
  { value: "NEW", label: tr("جدید (NEW)") },
  { value: "TOP", label: tr("پرفروش (TOP)") },
  { value: "SALE", label: tr("تخفیف (SALE)") },
];

export const CONTACT_FA = { whatsapp: tr("واتساپ"), telegram: tr("تلگرام"), phone: tr("تلفن") };
export const LANG_FA = { fa: tr("فارسی"), ru: tr("روسی"), tg: tr("تاجیکی"), en: tr("انگلیسی") };
