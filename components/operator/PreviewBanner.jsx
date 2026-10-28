// components/operator/PreviewBanner.jsx — the strip above a PRIVATE preview of a product (N5): it says what this page is, where its content comes
// from, whether the product is live, and offers the other content languages. Server component, in the language of the panel (the viewer is staff).
import Link from "next/link";
import { getPanel } from "@/lib/panel/server";
import { PREVIEW_LANGS } from "@/lib/operator/previewDraft";

const sourceText = (t, source) => {
  if (source === "draft") return t("مقادیر ذخیره‌نشدهٔ فرم نمایش داده می‌شود.");
  if (source === "request") return t("پیشنهاد یک درخواست تأیید نمایش داده می‌شود (هنوز اعمال نشده).");
  if (source === "new") return t("محصول تازه — هنوز ذخیره نشده.");
  return t("نسخهٔ ذخیره‌شدهٔ محصول نمایش داده می‌شود.");
};

export default async function PreviewBanner({ house, lang, id, token, requestId, state }) {
  const { t, dir } = await getPanel();
  const q = token ? `?token=${encodeURIComponent(token)}` : requestId ? `?request=${encodeURIComponent(requestId)}` : "";
  const edit = id === "new" ? `${house === "beauty" ? "/beauty/operator" : "/operator"}/products/new` : `${house === "beauty" ? "/beauty/operator" : "/operator"}/products/${id}/edit`;
  const live = state.stored ? state.stored.is_active : false;
  return (
    <div dir={dir} role="region" aria-label={t("پیش‌نمایش خصوصی")} data-testid="preview-banner" className="border-b-2 border-warn/50 bg-warn/10 text-ink text-sm">
      <div className="container-x py-3 flex flex-wrap items-center gap-x-5 gap-y-2 min-w-0">
        <p className="font-bold text-warn">{t("پیش‌نمایش خصوصی")}</p>
        <p className="min-w-0 flex-1 basis-72 break-words">
          {t("فقط برای شما که وارد پنل شده‌اید دیده می‌شود. این صفحه برای عموم نیست، در موتورهای جستجو نمی‌آید، بازدید یا درخواستی ثبت نمی‌کند و دکمه‌های ارسال کار نمی‌کنند.")}{" "}
          <span data-testid="preview-source">{sourceText(t, state.source)}</span>{" "}
          {state.draftGone && <b data-testid="preview-draft-gone">{t("پیش‌نویس ذخیره‌نشده دیگر در دسترس نیست (۳۰ دقیقه گذشته یا از نشست دیگر)؛ نسخهٔ ذخیره‌شده نشان داده می‌شود.")}</b>}{" "}
          {state.stored && <span data-testid="preview-live">{live ? t("این محصول هم‌اکنون روی سایت منتشر است.") : t("این محصول هنوز روی سایت نیست (غیرفعال یا آرشیو).")}</span>}{" "}
          {state.hiddenVariants > 0 && <span>{t("{count} تنوع غیرفعال در این نما نیست.", { count: state.hiddenVariants })}</span>}
        </p>
        <nav aria-label={t("زبان پیش‌نمایش")} className="flex flex-wrap items-center gap-1 min-w-0 max-w-full">
          {PREVIEW_LANGS.map((l) => (
            <Link key={l} href={`/${house}/${l}/preview/${id}${q}`} prefetch={false} data-testid={`preview-lang-${l}`} aria-current={l === lang ? "page" : undefined}
              className={`btn-ghost size-sm uppercase ${l === lang ? "!border-brand-violet/50 !text-brand-violet !bg-brand-violet/5" : ""}`}>{l}</Link>
          ))}
          <Link href={edit} prefetch={false} className="btn-ghost size-sm" data-testid="preview-back">{t("بازگشت به ویرایش")}</Link>
        </nav>
      </div>
    </div>
  );
}
