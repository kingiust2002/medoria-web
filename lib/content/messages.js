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
  unavailable: tr("محتوای سایت در دسترس نیست (مهاجرت ۴۲ اجرا نشده یا پایگاه داده پاسخ نمی‌دهد)."),
  generic: tr("ذخیره نشد. دوباره تلاش کنید."),
};
