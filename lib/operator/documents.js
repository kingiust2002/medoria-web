// lib/operator/documents.js — product documents (N8): brochure, datasheet, certificate, manual — the rules for what may be uploaded and what a form may say.
// Plain module (no Next, no database) so it is unit-tested. The files are PDFs only; what the person may enter is cleaned here, and a PDF is looked at
// before it is stored in a PUBLIC bucket.
import { tr } from "../panel/i18n.js";
import { str, num } from "./validation.js";

export const DOC_KINDS = ["brochure", "datasheet", "certificate", "manual", "other"];
export const DOC_LANGS = ["fa", "tg", "ru", "en"];
export const DOC_LIMITS = { maxBytes: 15 * 1024 * 1024, maxPerProduct: 30, titleMax: 160 };

export const DOC_KIND_LABELS = {
  brochure: tr("بروشور"), datasheet: tr("برگهٔ مشخصات فنی"), certificate: tr("گواهی"), manual: tr("راهنمای استفاده"), other: tr("سند دیگر"),
};

export const DOC_MESSAGES = {
  unavailable: tr("برای اسناد محصول، مایگریشن ۴۸ باید روی پایگاه داده اجرا شود."),
  none: tr("فایلی انتخاب نشده است."),
  notPdf: tr("فقط فایل PDF مجاز است."),
  tooBig: tr("حجم سند بیش از ۱۵ مگابایت است."),
  damaged: tr("این فایل یک PDF سالم نیست."),
  active: tr("این PDF شامل اسکریپت، فایل پیوست یا رمز است و پذیرفته نمی‌شود. نسخهٔ ساده‌شده را بفرستید."),
  duplicate: tr("همین سند قبلاً برای این محصول ثبت شده است."),
  tooMany: tr("حداکثر ۳۰ سند برای هر محصول مجاز است."),
  badTitle: tr("عنوان سند لازم است (حداکثر ۱۶۰ نویسه)."),
  badKind: tr("نوع سند نامعتبر است."),
  badLang: tr("زبان سند نامعتبر است."),
  badDate: tr("تاریخ اعتبار نامعتبر است."),
  noProduct: tr("محصول پیدا نشد."),
  unknown: tr("سند پیدا نشد."),
  conflict: tr("این سند را شخص دیگری تغییر داده است؛ صفحه را تازه کنید."),
  generic: tr("ذخیرهٔ سند ناموفق بود."),
  uploadFailed: tr("آپلود سند ناموفق بود."),
  deleted: tr("سند حذف شد."),
};

const validDate = (s) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

// What the form of one document may send → { ok: true, value } | { ok: false, error }. Only the keys present in `input` are returned when `partial`.
export function cleanDocumentInput(input, { partial = false } = {}) {
  const i = input && typeof input === "object" ? input : {};
  const value = {};
  if (!partial || "title" in i) {
    const title = str(i.title, DOC_LIMITS.titleMax);
    if (!title) return { ok: false, error: DOC_MESSAGES.badTitle };
    value.title = title;
  }
  if (!partial || "kind" in i) {
    if (!DOC_KINDS.includes(i.kind)) return { ok: false, error: DOC_MESSAGES.badKind };
    value.kind = i.kind;
  }
  if (!partial || "lang" in i) {
    const lang = i.lang === "" || i.lang == null ? null : i.lang;
    if (lang !== null && !DOC_LANGS.includes(lang)) return { ok: false, error: DOC_MESSAGES.badLang };
    value.lang = lang;
  }
  if (!partial || "valid_until" in i) {
    const v = i.valid_until === "" || i.valid_until == null ? null : String(i.valid_until).trim();
    if (v !== null && !validDate(v)) return { ok: false, error: DOC_MESSAGES.badDate };
    value.valid_until = v;
  }
  if ("sort_order" in i) value.sort_order = num(i.sort_order, { min: -100000, max: 100000 }) ?? 0;
  return { ok: true, value };
}

// ── looking at a PDF before it is stored ───────────────────────────────────────────────────────────────────────────────
// A heuristic, not a virus scanner: it refuses a file that is not a complete PDF and one that carries script, an attached file, a rich-media object,
// a form-submission or launch action, or encryption (which cannot be inspected). Names written with #xx escapes are decoded first, so "/J#61vaScript"
// is not a way around it. Content hidden inside compressed object streams (/ObjStm) cannot be read without a PDF parser: such a file is accepted and
// reported as `compressed: true` — the file is still only ever served as application/pdf, never as a page of the site.
const ACTIVE = /\/(JavaScript|JS|Launch|EmbeddedFile|EmbeddedFiles|RichMedia|XFA|SubmitForm|ImportData|GoToR|GoToE|Encrypt)(?![A-Za-z0-9])/;

export function scanPdf(bytes) {
  if (!bytes || bytes.length < 16) return { ok: false, error: DOC_MESSAGES.damaged };
  const head = Buffer.from(bytes.subarray(0, 8)).toString("latin1");
  if (!head.startsWith("%PDF-")) return { ok: false, error: DOC_MESSAGES.notPdf };
  const tail = Buffer.from(bytes.subarray(Math.max(0, bytes.length - 2048))).toString("latin1");
  if (!tail.includes("%%EOF")) return { ok: false, error: DOC_MESSAGES.damaged };
  const text = Buffer.from(bytes).toString("latin1").replace(/#([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  if (ACTIVE.test(text)) return { ok: false, error: DOC_MESSAGES.active };
  return { ok: true, compressed: /\/ObjStm(?![A-Za-z0-9])/.test(text) };
}

export const isPdfFile = (file) => Boolean(file) && typeof file !== "string" && (file.type === "application/pdf" || /\.pdf$/i.test(String(file.name || "")));

// "documents/<time>-<random>-<name>.pdf": only letters, digits, dot, dash (the database accepts nothing else)
export function documentPath(name, now = Date.now(), rand = Math.random().toString(36).slice(2, 8)) {
  const stem = String(name || "document").split("/").pop().split("\\").pop().replace(/\.[^.]*$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "document";
  return `documents/${now}-${rand}-${stem}.pdf`;
}

export const DOC_TABLES = { health: "product_documents", beauty: "beauty_product_documents" };
export const DOC_PRODUCT_TABLES = { health: "products", beauty: "beauty_products" };
export const DOC_BUCKETS = { health: "product-images", beauty: "beauty-product-images" };       // the house's own bucket, folder documents/
