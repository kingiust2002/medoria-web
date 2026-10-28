// lib/operator/userLabels.js — the texts of the people screen that are shared by the server and the browser (no Node imports).
import { tr } from "../panel/i18n.js";
import { OPERATION_IDS } from "./authz.js";

export const OPERATION_CHOICES = OPERATION_IDS;
export const OPERATION_LABELS = {
  "products.create": tr("افزودن محصول"), "products.content": tr("ویرایش اطلاعات محصول"), "products.price": tr("تغییر قیمت"),
  "products.stock_flag": tr("تغییر «موجود / ناموجود»"), "products.publish": tr("انتشار محصول"), "products.archive": tr("آرشیو محصول"),
  "products.delete": tr("حذف دائمی محصول"), "products.bulk": tr("ویرایش گروهی محصولات"), "products.import": tr("ورود فایل محصولات"),
  "products.restore_version": tr("بازگردانی نسخهٔ قبلی"), "products.export": tr("خروجی محصولات"),
  "categories.create": tr("افزودن دسته"), "categories.edit": tr("ویرایش دسته"), "categories.archive": tr("آرشیو دسته"), "categories.delete": tr("حذف دسته"),
  "brands.create": tr("افزودن برند"), "brands.edit": tr("ویرایش برند"), "brands.archive": tr("آرشیو برند"), "brands.delete": tr("حذف برند"),
  "media.upload": tr("بارگذاری تصویر"), "media.edit": tr("ویرایش تصویر"), "media.delete": tr("حذف تصویر"),
  "documents.edit": tr("ویرایش سند محصول"), "documents.publish": tr("انتشار سند"), "documents.delete": tr("حذف سند"),
  "quotes.status": tr("تغییر وضعیت درخواست"), "quotes.assign": tr("ارجاع درخواست"), "quotes.delete": tr("حذف درخواست"), "quotes.export": tr("خروجی درخواست‌ها"),
  "inventory.receive": tr("ورود کالا به انبار"), "inventory.issue": tr("خروج کالا از انبار"), "inventory.transfer": tr("انتقال بین انبارها"),
  "inventory.reserve": tr("رزرو موجودی"), "inventory.adjust": tr("اصلاح موجودی"), "inventory.count_close": tr("بستن شمارش انبار"),
  "content.edit": tr("ویرایش محتوای سایت"), "content.publish": tr("انتشار محتوا"), "content.schedule": tr("زمان‌بندی انتشار"),
};
