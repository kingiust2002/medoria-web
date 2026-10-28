"use client";
// Confirmation dialog for permanently deleting ONE ARCHIVED product. Shared by the Health and Beauty panels; each
// passes its own server action as `onDelete`. The person must type the product's SKU (or its name when it has none);
// the server repeats every check (archived only, matching text, activity log written first), this is the convenience.
import { useState } from "react";
import Icon from "@/components/shared/Icon";
import { Spinner, productDisplayName } from "@/components/operator/ui";
import { expectedConfirmation, confirmationMatches } from "@/lib/operator/productDelete";
import { useT, usePanelLang } from "@/components/panel/PanelI18n";

export default function DeleteProductModal({ product, onClose, onDelete, onDone }) {
  const t = useT();
  const { lang } = usePanelLang();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const want = expectedConfirmation(product);
  const ok = confirmationMatches(typed, product);

  async function run(e) {
    e.preventDefault();
    if (!ok || busy) return;
    setErr(""); setBusy(true);
    let res;
    try { res = await onDelete(product.id, typed); } catch { res = null; }
    setBusy(false);
    if (res?.ok || res?.notFound) onDone(res);       // gone either way: refresh the list
    else setErr(t(res?.error) || t("حذف ناموفق بود. دوباره تلاش کنید."));
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" onClick={busy ? undefined : onClose}>
      <div className="absolute inset-0 bg-navy/40 backdrop-blur-sm" />
      <form onSubmit={run} onClick={(e) => e.stopPropagation()} dir="rtl" role="dialog" aria-modal="true" aria-labelledby="del-product-title"
        className="relative card p-6 w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain animate-fade-in">
        <div className="flex items-center justify-between mb-4">
          <h2 id="del-product-title" className="font-bold text-lg text-ink">{t("حذف دائمی این محصول؟")}</h2>
          <button type="button" onClick={onClose} disabled={busy} aria-label={t("بستن")} className="grid place-items-center w-9 h-9 rounded-lg hover:bg-line-soft text-ink-muted"><Icon name="close" size={18} /></button>
        </div>

        {err && <div role="alert" className="mb-4 text-sm rounded-xl px-3 py-2.5 flex items-center gap-2 bg-warn/10 text-warn"><Icon name="alertTriangle" size={16} /> {err}</div>}

        <div className="rounded-xl bg-canvas-soft border border-line p-3 text-sm mb-3 min-w-0">
          <p className="font-medium text-ink break-words">{productDisplayName(product, lang)}</p>
          {product.sku && <p className="text-xs text-ink-muted mt-0.5 break-all" dir="ltr">{product.sku}</p>}
        </div>

        <p className="text-sm text-ink-soft leading-relaxed">{t("محصول و تمام اطلاعاتش برای همیشه از کاتالوگ پاک می‌شود و قابل بازگشت نیست. درخواست‌های قدیمی مشتری‌ها می‌مانند و نام و کد محصول در آن‌ها حفظ می‌شود. عکس‌های آپلودشده پاک نمی‌شوند.")}</p>

        <label htmlFor="del-product-confirm" className="block text-sm font-semibold text-ink mt-4 mb-1.5">{t("برای تأیید این متن را بنویسید:")} <bdi className="font-mono text-warn break-all" dir="ltr" data-testid="del-product-expected">{want}</bdi>
        </label>
        <input id="del-product-confirm" value={typed} onChange={(e) => setTyped(e.target.value)} dir="ltr" autoComplete="off" autoCapitalize="off" spellCheck={false}
          className="input w-full" aria-invalid={typed.length > 0 && !ok} />

        <div className="flex gap-2 mt-5 sticky bottom-0 -mx-6 -mb-6 px-6 pb-6 pt-3 bg-surface border-t border-line">
          <button type="submit" disabled={!ok || busy} className="btn-primary size-md flex-1 disabled:opacity-50 !bg-warn hover:!bg-warn/90">
            {busy ? <Spinner /> : <Icon name="trash" size={17} />}{busy ? t("در حال حذف…") : t("حذف دائمی")}
          </button>
          <button type="button" onClick={onClose} disabled={busy} className="btn-ghost size-md">{t("انصراف")}</button>
        </div>
      </form>
    </div>
  );
}
