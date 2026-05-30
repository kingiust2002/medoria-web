// lib/price.js — single source of truth for null-price ("Request price").
// Import everywhere a price is rendered or put into a message.
import { getTranslations } from "@/lib/i18n";

// Returns true when the product has no fixed price → show "Request price".
export function isOnRequest(product) {
  return (
    product == null ||
    product.price == null ||
    product.price === "" ||
    Number(product.price) === 0
  );
}

// Format a numeric price consistently (2 decimals, with currency).
export function formatPrice(value) {
  return `$${Number(value).toFixed(2)}`;
}

// Localized "Request price" label for UI. Requires the common.requestPrice key:
//   fa:"استعلام قیمت" ru:"Запросить цену" tg:"Нархро пурсед" en:"Request price"
export function priceLabel(product, lang) {
  if (isOnRequest(product)) return getTranslations(lang).common.requestPrice;
  return formatPrice(product.price);
}

// For WhatsApp/Telegram message bodies (avoids printing "$null").
export function priceLine(product, lang) {
  if (isOnRequest(product)) return getTranslations(lang).common.requestPrice;
  return `${formatPrice(product.price)} / ${product.unit}`;
}
