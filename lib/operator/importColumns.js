// lib/operator/importColumns.js
// Single, dependency-free source of truth for operator spreadsheet columns.
// Shared by import validation, template generation, workbook parsing, and
// direct CI verification.

// tier drives the template colouring + legend:
//   "required" (red)   — must fill (name in at least one language)
//   "auto"     (green) — leave empty and the importer fills it
//   "optional" (blue)  — fill if needed, otherwise ignored
export const IMPORT_COLUMNS = [
  { key: "name_fa",          tier: "required", label: "نام فارسی (نام را حداقل به یک زبان بنویس)", example: "دستکش نیتریل آبی" },
  { key: "name_en",          tier: "auto",     label: "نام انگلیسی (خالی = ترجمهٔ خودکار)", example: "Nitrile gloves blue" },
  { key: "sku",              tier: "auto",     label: "کد محصول — خالی = ساخت خودکار / کلید بروزرسانی", example: "" },
  { key: "category_slug",    tier: "optional", label: "اسلاگ دسته (از صفحه دسته‌ها)", example: "gloves" },
  { key: "brand",            tier: "optional", label: "برند", example: "MediCare" },
  { key: "price",            tier: "optional", label: "قیمت دلار — خالی = استعلام", example: "8.50" },
  { key: "price_on_request", tier: "auto",     label: "استعلام قیمت (خالی = خودکار از قیمت)", example: "" },
  { key: "unit",             tier: "optional", label: "واحد", example: "بسته ۱۰۰ عددی" },
  { key: "min_order_qty",    tier: "auto",     label: "حداقل سفارش (خالی = ۱)", example: "" },
  { key: "in_stock",         tier: "auto",     label: "موجود (خالی = بله)", example: "" },
  { key: "is_active",        tier: "auto",     label: "فعال در سایت (خالی = بله)", example: "" },
  { key: "is_featured",      tier: "optional", label: "ویژه (yes/no)", example: "no" },
  { key: "badge",            tier: "optional", label: "نشان: NEW / TOP / SALE", example: "" },
  { key: "image_url",        tier: "optional", label: "آدرس تصویر اصلی", example: "https://example.com/glove.jpg" },
  { key: "slug",             tier: "auto",     label: "اسلاگ صفحه (خالی = خودکار)", example: "" },
  { key: "name_ru",          tier: "auto",     label: "نام روسی (خالی = ترجمهٔ خودکار)", example: "" },
  { key: "name_tg",          tier: "auto",     label: "نام تاجیکی (خالی = ترجمهٔ خودکار)", example: "" },
  { key: "description_fa",   tier: "optional", label: "توضیحات (یک زبان کافی‌ست)", example: "" },
  { key: "description_en",   tier: "auto",     label: "توضیحات انگلیسی (خالی = ترجمهٔ خودکار)", example: "" },
  { key: "description_ru",   tier: "auto",     label: "توضیحات روسی (خالی = ترجمهٔ خودکار)", example: "" },
  { key: "description_tg",   tier: "auto",     label: "توضیحات تاجیکی (خالی = ترجمهٔ خودکار)", example: "" },
  { key: "tags",             tier: "optional", label: "برچسب‌ها جدا با |", example: "دستکش|نیتریل" },
  { key: "gallery_urls",     tier: "optional", label: "گالری، آدرس‌ها جدا با |", example: "" },
  { key: "specs",            tier: "optional", label: "مشخصات key:value جدا با |", example: "سایز:M|رنگ:آبی" },
  { key: "seo_title",        tier: "optional", label: "عنوان سئو", example: "" },
  { key: "seo_description",  tier: "optional", label: "توضیح سئو", example: "" },
  { key: "brochure_url",     tier: "optional", label: "آدرس بروشور PDF", example: "" },
];

export const IMPORT_COLUMN_KEYS = IMPORT_COLUMNS.map((column) => column.key);
