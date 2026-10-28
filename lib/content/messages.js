// lib/content/messages.js — the refusals of the site-content actions, in the person's language (Persian keys; the panel translates them).
// Kept in its own file inside the translation scope (scripts/i18n/extract.mjs); lib/siteContent.js re-exports it.
import { tr } from "../panel/i18n.js";

export const CONTENT_MESSAGES = {
  bad_kind: tr("نوع محتوا معتبر نیست."),
  no_text: tr("حداقل یک زبان باید متن داشته باشد."),
  too_long: tr("یکی از متن‌ها از حد مجاز طولانی‌تر است."),
  bad_link: tr("پیوند باید با «/» یا «https://» شروع شود."),
  no_answer: tr("برای هر پرسش، پاسخ هم لازم است (در همان زبان)."),
  bad_order: tr("ترتیب باید عددی صحیح باشد."),
  stale: tr("این مورد در این فاصله تغییر کرده است؛ صفحه را تازه کنید."),
  unknown: tr("این مورد وجود ندارد."),
  too_many: tr("تعداد موارد این بخش به حد مجاز رسیده است؛ مواردی را حذف کنید."),
  bad_phone: tr("شمارهٔ تلفن باید با «+» و کد کشور شروع شود و ۷ تا ۱۵ رقم باشد، مثلاً +992900000000."),
  bad_whatsapp: tr("شمارهٔ واتساپ باید فقط رقم باشد (با کد کشور، بدون «+»)، ۷ تا ۱۵ رقم."),
  bad_telegram: tr("نام کاربری تلگرام باید ۵ تا ۳۲ حرف انگلیسی، عدد یا «_» باشد."),
  bad_email: tr("نشانی ایمیل معتبر نیست."),
  no_contact: tr("حداقل یکی از راه‌های تماس را بنویسید."),
  contact_exists: tr("برای این بخش یک مورد تماس وجود دارد؛ همان را ویرایش کنید."),
  bad_product: tr("این محصول در همین بخش پیدا نشد."),
  featured_exists: tr("این محصول از پیش در فهرست ویژه است."),
  featured_full: tr("حداکثر ۱۲ محصول ویژه مجاز است؛ یکی را بردارید."),
  unavailable: tr("محتوای سایت در دسترس نیست (مهاجرت ۴۲ یا ۵۱ اجرا نشده یا پایگاه داده پاسخ نمی‌دهد)."),
  generic: tr("ذخیره نشد. دوباره تلاش کنید."),
};
