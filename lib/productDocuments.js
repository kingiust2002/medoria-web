// lib/productDocuments.js — how the PUBLIC product pages present the documents of a product (N8): brochure, datasheet, certificate, manual. Pure.
// The rows come from the database functions public_product_documents / public_beauty_product_documents (published, still valid, active product).
export const DOC_COPY = {
  tg: { heading: "Ҳуҷҷатҳо", open: "Кушодан", validUntil: "эътибор то", kinds: { brochure: "Брошюра", datasheet: "Варақаи техникӣ", certificate: "Шаҳодатнома", manual: "Дастур", other: "Ҳуҷҷат" }, langs: { fa: "Форсӣ", tg: "Тоҷикӣ", ru: "Русӣ", en: "Англисӣ" } },
  ru: { heading: "Документы", open: "Открыть", validUntil: "действует до", kinds: { brochure: "Брошюра", datasheet: "Технический паспорт", certificate: "Сертификат", manual: "Инструкция", other: "Документ" }, langs: { fa: "Персидский", tg: "Таджикский", ru: "Русский", en: "Английский" } },
  en: { heading: "Documents", open: "Open", validUntil: "valid until", kinds: { brochure: "Brochure", datasheet: "Datasheet", certificate: "Certificate", manual: "Manual", other: "Document" }, langs: { fa: "Persian", tg: "Tajik", ru: "Russian", en: "English" } },
  fa: { heading: "اسناد", open: "باز کردن", validUntil: "اعتبار تا", kinds: { brochure: "بروشور", datasheet: "برگهٔ مشخصات فنی", certificate: "گواهی", manual: "راهنمای استفاده", other: "سند" }, langs: { fa: "فارسی", tg: "تاجیکی", ru: "روسی", en: "انگلیسی" } },
};

export const docCopy = (lang) => DOC_COPY[lang] || DOC_COPY.en;

const sizeText = (bytes) => {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return "";
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
};

// rows from the database function → what the page shows. `urlOf(path)` builds the public address of the stored file (the house's own bucket).
export function publicDocumentItems(rows, lang, urlOf) {
  const c = docCopy(lang);
  return (Array.isArray(rows) ? rows : []).filter((r) => r && typeof r.file_path === "string" && r.title).map((r) => ({
    id: r.id,
    href: urlOf(r.file_path),
    title: String(r.title),
    kindLabel: c.kinds[r.kind] || c.kinds.other,
    meta: [r.lang ? c.langs[r.lang] : null, r.valid_until ? `${c.validUntil} ${String(r.valid_until).slice(0, 10)}` : null, sizeText(r.file_size)].filter(Boolean).join(" · "),
  }));
}
