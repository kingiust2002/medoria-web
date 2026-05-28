# Medoria — فاز ۳ (Design Refinement)

## 🎨 تغییرات این فاز

### ۱. ریدیزاین کامل رنگ‌ها — آبی پزشکی B2B
- رنگ اصلی از **بنفش/صورتی** به **آبی #2563EB** (مثل Medline/McKesson)
- فیروزه‌ای #06B6D4 برای accent
- صورتی/بنفش فقط برای badge های SALE
- لوگو رنگارنگ خودش حفظ شد (gradient اصلی)
- پس‌زمینه سفید + grid ظریف، فضای خالی بیشتر

### ۲. آیکون‌های SVG حرفه‌ای
- تمام emoji ها با آیکون‌های SVG خط‌محور (Lucide-style) جایگزین شدن
- `components/shared/Icon.jsx` — کتابخانه ۴۰+ آیکون پزشکی
- آیکون‌های دستکش، ماسک، استتوسکوپ، باند، دماسنج، فلاسک و...

### ۳. Sticky Quote Panel
- نوار شناور پایین صفحه محصول (دسکتاپ)
- وقتی scroll می‌کنی ظاهر میشه
- WhatsApp + Telegram + درخواست فاکتور + Compare

### ۴. localStorage برای زبان
- زبان انتخابی ذخیره میشه
- دفعه بعد خودکار به همون زبان میره
- اگه ذخیره نشده، زبان مرورگر تشخیص داده میشه

### ۵. Badge Filter + Grid/List Toggle
- فیلتر NEW / TOP / SALE / بدون نشان
- دکمه تغییر نمای شبکه‌ای / لیستی
- نمای لیستی: عکس بزرگ‌تر کنار توضیحات کامل

### ۶. اتصال جدول categories
- `lib/categories.js` برای خواندن از Supabase

### ۷. SEO پیشرفته
- OpenGraph + Twitter card per language
- Keywords، alternate languages
- متادیتای جداگانه برای صفحه categories

## 📊 پیشرفت کلی: ~۹۰٪

### مونده برای فاز ۴ (polish نهایی):
- Quick view modal
- Mega search با dropdown پیشنهاد
- بخش مجزای "Send procurement list"
- PDF price list واقعی
- ذخیره contact form در Supabase
- Map در Contact

## استقرار

۱. **Supabase**: اگه قبلاً اجرا نکردی، `supabase-migration.sql` + `supabase-migration-phase2.sql`
۲. **GitHub**: همه فایل‌های قدیمی پاک، فایل‌های این zip آپلود
۳. **Vercel**: خودکار build میشه

⚠️ چون Tailwind config و globals.css تغییر کردن، حتماً **این دو فایل رو هم آپلود کن**:
- `tailwind.config.js`
- `app/globals.css`
