# Medoria v2 — Phase 2

سایت کاتالوگ پزشکی B2B با Next.js + Supabase + Tailwind CSS.

## ✨ ویژگی‌های فاز ۲ (جدید)

- 🔄 **مقایسه محصولات** — تا ۴ محصول کنار هم، با هایلایت بهترین قیمت
- 🏷️ **فیلتر برند** در کاتالوگ
- 📂 **صفحه دسته‌بندی‌ها** (`/categories`) — مرور کامل ۶ دسته
- 📧 **فرم تماس واقعی** — ارسال خودکار به واتساپ یا تلگرام
- 🖼️ **گالری چند عکس** برای محصول با Lightbox
- 📄 **محتوای کامل About** — معرفی، ماموریت، ارزش‌ها، مشتریان
- 📞 **محتوای کامل Contact** — کارت‌های تماس، ساعات کاری، فرم حرفه‌ای

## ساختار

```
app/
  [lang]/                ← ۴ زبان: ru, tg, en, fa
    page.jsx             ← Home
    catalog/
      page.jsx           ← کاتالوگ + فیلتر برند + Compare
      [slug]/page.jsx    ← محصول + گالری + Compare
    compare/page.jsx     ← 🆕 مقایسه side-by-side
    categories/page.jsx  ← 🆕 مرور دسته‌بندی‌ها
    about/page.jsx       ← 🆕 محتوای کامل
    contact/page.jsx     ← 🆕 فرم واقعی
    layout.jsx

components/
  layout/                ← Header (با لینک Categories), Footer, TopBar, Logo
  home/                  ← Hero, Stats, CategoryGrid, Featured, ...
  catalog/               ← ProductCard (با Compare), CompareDrawer 🆕
  product/               ← QuoteModal, ProductGallery 🆕
  shared/                ← FloatingWhatsApp

lib/
  i18n.js                ← همه ترجمه‌ها (فاز ۲ کامل)
  supabase.js
  whatsapp.js
  compare.js             ← 🆕 localStorage hook

public/
  logo.png, logo-text.png
```

---

## مراحل استقرار

### مرحله ۱ — Supabase SQL

در **SQL Editor** اجرا کن (به ترتیب):

1. `supabase-migration.sql` (اگه قبلاً اجرا نشده)
2. `supabase-migration-phase2.sql` ← جدید

### مرحله ۲ — Environment Variables (Vercel)

این متغیرها باید باشن (احتمالاً قبلاً تنظیم شدن):

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_WA_NUMBER
NEXT_PUBLIC_TG_USERNAME
NEXT_PUBLIC_EMAIL
NEXT_PUBLIC_PHONE
```

### مرحله ۳ — GitHub

تمام فایل‌های قدیمی repo را پاک کن، فایل‌های این پوشه را آپلود کن.

Vercel خودکار build می‌کنه.

---

## استفاده

### مقایسه محصولات

- روی ⇆ (گوشه بالا راست کارت) کلیک کن
- یک نوار شناور پایین صفحه ظاهر می‌شه
- تا ۴ محصول می‌تونی اضافه کنی (پنجمی، اولی رو جایگزین می‌کنه)
- روی نوار کلیک → صفحه `/compare`
- ارزان‌ترین قیمت "BEST" نشون داده میشه

### گالری محصول

- ستون اصلی: `image_url`
- ستون گالری: `gallery_urls` (آرایه از URLها)

مثال در Supabase:
```json
{
  "image_url": "products/glv-001-main.jpg",
  "gallery_urls": ["products/glv-001-2.jpg", "products/glv-001-3.jpg"]
}
```

تا ۵ thumbnail نشون داده میشه. کلیک روی عکس → Lightbox.

### فیلتر برند

- در Supabase، ستون `brand` رو پر کن
- خودکار به صفحه کاتالوگ اضافه میشه

### Specs و بروشور

- `specs` (JSONB): `{"Размер": "M", "Материал": "Нитрил"}`
- `brochure_url`: لینک PDF

---

## URLها

| صفحه       | روسی              | فارسی             |
|------------|-------------------|-------------------|
| Home       | `/ru`             | `/fa`             |
| Catalog    | `/ru/catalog`     | `/fa/catalog`     |
| Product    | `/ru/catalog/123` | `/fa/catalog/123` |
| Categories | `/ru/categories`  | `/fa/categories`  |
| Compare    | `/ru/compare`     | `/fa/compare`     |
| About      | `/ru/about`       | `/fa/about`       |
| Contact    | `/ru/contact`     | `/fa/contact`     |
