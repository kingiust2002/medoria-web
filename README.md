# 🏥 Medoria — کاتالوگ B2B مصرفی پزشکی تاجیکستان

سایت کاتالوگی پزشکی حرفه‌ای با Next.js 14 + Supabase + Tailwind CSS.

## ✨ ویژگی‌ها

### چندزبانه واقعی
- 🇷🇺 روسی · 🇹🇯 تاجیکی · 🇬🇧 انگلیسی · 🇮🇷 فارسی (RTL)
- ذخیره زبان انتخابی در localStorage
- متادیتای SEO جدا برای هر زبان

### کاتالوگ کامل
- جستجو + Mega search با dropdown
- فیلتر دسته‌بندی، برند، Badge (NEW/TOP/SALE)
- نمای Grid / List
- مرتب‌سازی بر اساس قیمت/نام
- اسکلت بارگذاری حرفه‌ای

### صفحه محصول
- گالری چند عکس با Lightbox و کیبورد
- Specs (JSONB)، بروشور PDF
- Sticky Quote Panel هنگام scroll
- محصولات مشابه
- آیکون categoryهای پیش‌فرض هنگام نبود عکس

### مقایسه محصولات
- تا ۴ محصول کنار هم
- نوار شناور پایین صفحه
- هایلایت ارزان‌ترین قیمت
- ذخیره در localStorage

### استعلام B2B
- WhatsApp & Telegram با پیام آماده ۴ زبانه
- فرم Request Quote
- فرم Contact ذخیره در Supabase
- بخش "ارسال لیست خرید" برای خرید عمده

### بخش‌های Home (۱۱ بخش)
۱. Hero با نمایش لوگو
۲. Stats با تعداد واقعی محصولات
۳. ۶ دسته‌بندی با تعداد live
۴. محصولات منتخب
۵. مارکی برندها
۶. چرا مدوریا (۶ مزیت)
۷. روند ۴ مرحله‌ای خرید
۸. ۳ مخاطب اصلی
۹. ⭐ نظر مشتریان (Testimonials)
۱۰. 📋 فرم لیست خرید عمده
۱۱. CTA نهایی

---

## 🚀 مراحل Deploy

### مرحله ۱ — Supabase SQL

تو **SQL Editor** Supabase، **به ترتیب** این ۳ فایل رو RUN کن:

1. `supabase-migration.sql` — جدول‌های اصلی
2. `supabase-migration-phase2.sql` — جدول contact_inquiries
3. `supabase-seed-data.sql` — **۲۴ محصول واقعی** ✨

> ⚠️ اگه قبلاً migration رو زدی، فقط فایل ۳ (seed) رو اجرا کن.

### مرحله ۲ — Environment Variables (Vercel)

```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_xxx
NEXT_PUBLIC_WA_NUMBER=992XXXXXXXXX
NEXT_PUBLIC_TG_USERNAME=YourTelegramUser
NEXT_PUBLIC_EMAIL=sales@medoria.tj
NEXT_PUBLIC_PHONE=+992XXXXXXXXX
```

### مرحله ۳ — GitHub & Vercel

1. همه فایل‌های قدیمی repo رو پاک کن
2. محتویات این پوشه (همه فایل‌ها و پوشه‌ها) رو آپلود کن
3. Vercel خودکار build می‌کنه (۲-۳ دقیقه)

---

## 🎨 لوگوها

سه نسخه در `/public`:
- `logo.png` — فقط آیکون (هدر، compact)
- `logo-full.png` — آیکون + متن "Medoria" (Hero، Footer)
- `logo-text.png` — فقط typography

استفاده در کد:
```jsx
<Logo variant="icon" />          // فقط آیکون
<Logo variant="icon" showText /> // آیکون + متن (Header)
<Logo variant="full" />          // لوگو کامل (Footer)
<Logo variant="text" />          // فقط typography
```

---

## 📦 افزودن محصولات

### روش ۱: SQL Editor
از `supabase-seed-data.sql` به‌عنوان الگو استفاده کن. هر محصول نیاز داره:
- 4 زبان: `name_ru`, `name_tg`, `name_en`, `name_fa`
- توضیحات: `description_ru/tg/en/fa`
- پایه: `sku`, `category`, `brand`, `price`, `unit`
- اختیاری: `badge` (NEW/TOP/SALE), `is_featured`, `image_url`, `gallery_urls`

### روش ۲: Table Editor (UI)
Supabase → Table Editor → products → Insert row

### عکس محصول
آپلود به Supabase Storage (bucket: `product-images`) → URL یا path رو در `image_url` ذخیره کن. می‌تونی آرایه‌ای از URLها در `gallery_urls` بذاری.

---

## 🛠️ ساختار

```
app/
  [lang]/
    page.jsx              ← Home (11 بخش)
    catalog/
      page.jsx            ← لیست با فیلتر/سرچ/Compare
      [slug]/page.jsx     ← صفحه محصول
    compare/page.jsx      ← مقایسه side-by-side
    categories/page.jsx
    about/page.jsx
    contact/page.jsx
    layout.jsx
  page.jsx                ← localStorage lang redirect
  layout.jsx
  globals.css

components/
  layout/    Header, Footer, TopBar, Logo, LanguageSwitcher
  home/      Hero, StatsBar, CategoryGrid, FeaturedProducts,
             Brands, WhyMedoria, Process, Audience,
             Trust 🆕, Procurement 🆕, FinalCTA
  catalog/   ProductCard, CompareDrawer
  product/   ProductGallery, QuoteModal, StickyQuotePanel
  shared/    Icon (40+ SVG), FloatingWhatsApp

lib/
  i18n.js       4-language translations
  supabase.js   getProducts, getProduct, getRelated, imageUrl
  whatsapp.js   waLink, tgLink, message builders
  compare.js    useCompare hook with localStorage
  categories.js Supabase categories fetcher

public/
  logo.png, logo-full.png, logo-text.png
```

---

## 🔧 طراحی

پالت رنگ B2B پزشکی (آبی محور، الهام از Medline/McKesson):
- **Primary**: #2563EB (آبی اصلی)
- **Cyan**: #06B6D4 (accent)
- **Navy**: #0F172A (متن، footer)
- **Tint Blue/Cyan**: پس‌زمینه‌های ملایم
- لوگو رنگارنگ خودش حفظ شده (gradient اصلی)

---

## 📱 پیشرفت پروژه

✅ **فاز ۱**: ساخت اولیه
✅ **فاز ۲**: Compare, Brand filter, Categories page, Contact form, Gallery
✅ **فاز ۳**: Redesign B2B (آبی), SVG icons, Sticky panel, localStorage, Grid/List, Badge filter
✅ **فاز ۴**: لوگوهای کامل, Testimonials, Procurement section, Brands marquee, Live counts, Seed data واقعی

**پروژه ۱۰۰٪ آماده استفاده در محیط واقعی.**
