"use client";
// components/operator/VariantsManager.jsx — the variants of ONE product, on its edit page, for both houses (each passes its own server actions
// and its own image uploader). A variant is a product row of its own (migration 44): own SKU, price or "price on request", stock flag, active
// flag, picture and the options that make it different (size, colour, pack…). It follows the same rights and the same approval path as a
// product; the server repeats every check, the buttons here are only a convenience.
import { useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/shared/Icon";
import { SectionCard, Field, Input, Toggle, Spinner } from "@/components/operator/ui";
import DeleteProductModal from "@/components/operator/DeleteProductModal";
import { imageUrl as healthImageUrl } from "@/lib/supabase";
import { beautyImageUrl } from "@/lib/beauty/catalog";
import { useT } from "@/components/panel/PanelI18n";
import { useCan, useMode } from "@/components/panel/Capabilities";
import { VARIANT_LIMITS, optionLabel } from "@/lib/operator/variants";

const emptyForm = () => ({ options: [{ key: "", value: "" }], sku: "", price: "", priceOnRequest: false, unit: "", in_stock: true, is_active: true, image_url: "", sort: "0" });
const fromRow = (v) => ({
  options: Object.entries(v.variant_options || {}).map(([key, value]) => ({ key, value: String(value) })),
  sku: v.sku || "", price: v.price != null ? String(v.price) : "", priceOnRequest: v.price == null, unit: v.unit || "",
  in_stock: v.in_stock !== false, is_active: v.is_active !== false, image_url: v.image_url || "", sort: String(v.variant_sort ?? 0),
});

export default function VariantsManager({ house = "health", approvalsHref, parent, variants, unavailable, save, remove, Uploader }) {
  const t = useT();
  const imageUrl = house === "beauty" ? beautyImageUrl : healthImageUrl;       // a function cannot be passed from a server page: the house picks its storage bucket
  const router = useRouter();
  const canCreate = useCan("products.create"), canEdit = useCan("products.content");
  const modeCreate = useMode("products.create"), modeEdit = useMode("products.content");
  const [editing, setEditing] = useState(null);                 // null | "new" | variant id
  const [f, setF] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [deleting, setDeleting] = useState(null);
  const up = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const setOpt = (i, k, v) => setF((s) => ({ ...s, options: s.options.map((o, j) => (j === i ? { ...o, [k]: v } : o)) }));

  function open(v) {
    setErr(""); setNote("");
    setEditing(v ? v.id : "new");
    setF(v ? fromRow(v) : emptyForm());
  }
  const close = () => { setEditing(null); setErr(""); };

  async function submit(e, row = null, patch = null) {
    e?.preventDefault();
    if (busy) return;
    setBusy(true); setErr(""); setNote("");
    const target = row || (editing !== "new" ? variants.find((v) => v.id === editing) : null);
    const input = { ...(patch ? { ...fromRow(row), ...patch } : f), ...(target ? { __expectedUpdatedAt: target.updated_at } : {}) };
    let res;
    try { res = await save(parent.id, target ? target.id : null, input); } catch { res = null; }
    setBusy(false);
    if (res?.ok && res.pending) { setNote(t(res.message)); close(); return; }                 // filed for approval: nothing changed yet
    if (res?.ok) { close(); router.refresh(); return; }
    setErr(t(res?.error) || t("ذخیرهٔ تنوع ناموفق بود. دوباره تلاش کنید."));
    if (res?.conflict) router.refresh();
  }

  const needsApproval = editing === "new" ? modeCreate === "approval" : modeEdit === "approval";

  return (
    <SectionCard title={t("تنوع‌های محصول")} icon="layers"
      desc={t("هر تنوع (مثلاً اندازه یا رنگ) کد کالا، قیمت، موجودی و تصویر مستقل دارد و به همین محصول وصل است. مشتری روی صفحهٔ همین محصول تنوع را انتخاب می‌کند.")}>
      <div data-testid="variants-manager" className="space-y-3 min-w-0">
        {unavailable && <div role="alert" className="text-sm rounded-xl px-3 py-2.5 flex items-center gap-2 bg-warn/10 text-warn"><Icon name="alertTriangle" size={16} /> {t(unavailable)}</div>}
        {note && (
          <div role="status" className="text-sm rounded-xl px-3 py-2.5 bg-ok/10 text-ok">
            {note} {approvalsHref && <a href={approvalsHref} className="underline font-semibold">{t("درخواست‌های تأیید")}</a>}
          </div>
        )}

        {!unavailable && variants.length === 0 && editing !== "new" && <p className="text-sm text-ink-muted" data-testid="variants-empty">{t("این محصول هنوز تنوعی ندارد.")}</p>}

        {variants.length > 0 && (
          <ul className="space-y-2" data-testid="variants-list">
            {variants.map((v) => (
              <li key={v.id} className="card-flat p-3 flex items-start gap-3 min-w-0" data-variant-sku={v.sku}>
                <div className="img-ph w-12 h-12 rounded-lg overflow-hidden grid place-items-center text-ink-faint shrink-0 border border-line">
                  {v.image_url ? <img src={imageUrl(v.image_url)} alt="" className="w-full h-full object-cover" /> : <Icon name="image" size={18} />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink break-words">{optionLabel(v.variant_options)}</p>
                  <p className="text-xs text-ink-muted mt-0.5 break-all" dir="ltr">{v.sku}</p>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                    <span className="tag bg-line-soft text-ink-muted">{v.price == null ? t("استعلام قیمت") : `${v.price}${v.currency ? ` ${v.currency}` : ""}`}</span>
                    <span className={`tag ${v.in_stock ? "bg-ok/10 text-ok" : "bg-line-soft text-ink-faint"}`}>{v.in_stock ? t("موجود") : t("ناموجود")}</span>
                    <span className={`tag ${v.is_active ? "bg-ok/10 text-ok" : "bg-warn/10 text-warn"}`}>{v.is_active ? t("فعال") : t("آرشیو")}</span>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-1.5 shrink-0">
                  {canEdit && <button type="button" onClick={() => open(v)} disabled={busy} className="btn-ghost size-sm"><Icon name="edit" size={14} /> {t("ویرایش")}</button>}
                  {canEdit && <button type="button" onClick={() => submit(null, v, { is_active: !v.is_active })} disabled={busy} className="btn-ghost size-sm">
                    <Icon name={v.is_active ? "archive" : "eye"} size={14} /> {v.is_active ? t("آرشیو") : t("فعال‌سازی")}</button>}
                  {!v.is_active && remove && <button type="button" onClick={() => setDeleting(v)} disabled={busy} className="btn-ghost size-sm !text-warn hover:!border-warn/40"><Icon name="trash" size={14} /> {t("حذف")}</button>}
                </div>
              </li>
            ))}
          </ul>
        )}

        {editing !== null && (
          <form onSubmit={submit} className="card-flat p-4 space-y-4 min-w-0" data-testid="variant-form">
            <h3 className="font-semibold text-ink text-sm">{editing === "new" ? t("تنوع تازه") : t("ویرایش تنوع")}</h3>
            {err && <div role="alert" className="text-sm rounded-xl px-3 py-2.5 flex items-center gap-2 bg-warn/10 text-warn"><Icon name="alertTriangle" size={16} /> {err}</div>}

            <div>
              <span className="block text-[13px] font-medium text-ink-soft mb-1.5">{t("مشخصه‌های متغیر")}</span>
              <div className="space-y-2">
                {f.options.map((o, i) => (
                  <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 items-center">
                    <Input value={o.key} onChange={(e) => setOpt(i, "key", e.target.value)} placeholder={t("نام (مثلاً اندازه)")} maxLength={VARIANT_LIMITS.key} aria-label={t("نام مشخصه")} />
                    <Input value={o.value} onChange={(e) => setOpt(i, "value", e.target.value)} placeholder={t("مقدار (مثلاً M)")} maxLength={VARIANT_LIMITS.value} aria-label={t("مقدار مشخصه")} />
                    <button type="button" onClick={() => setF((s) => ({ ...s, options: s.options.length > 1 ? s.options.filter((_, j) => j !== i) : [{ key: "", value: "" }] }))}
                      aria-label={t("حذف مشخصه")} className="grid place-items-center w-9 h-9 rounded-lg hover:bg-line-soft text-ink-muted"><Icon name="close" size={16} /></button>
                  </div>
                ))}
              </div>
              {f.options.length < VARIANT_LIMITS.options && (
                <button type="button" onClick={() => setF((s) => ({ ...s, options: [...s.options, { key: "", value: "" }] }))} className="btn-ghost size-sm mt-2"><Icon name="plus" size={14} /> {t("مشخصهٔ دیگر")}</button>
              )}
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <Field label={t("کد کالا (SKU) این تنوع")} required hint={t("باید در کل کاتالوگ یکتا باشد.")}>
                <Input value={f.sku} onChange={(e) => up("sku", e.target.value)} dir="ltr" maxLength={VARIANT_LIMITS.sku} required />
              </Field>
              <Field label={t("واحد")} hint={t("خالی = همان واحد محصول")}>
                <Input value={f.unit} onChange={(e) => up("unit", e.target.value)} maxLength={120} />
              </Field>
              <Field label={t("قیمت")}>
                <Input value={f.price} onChange={(e) => up("price", e.target.value)} inputMode="decimal" dir="ltr" disabled={f.priceOnRequest} />
              </Field>
              <Field label={t("ترتیب نمایش")}>
                <Input value={f.sort} onChange={(e) => up("sort", e.target.value)} inputMode="numeric" dir="ltr" />
              </Field>
            </div>
            <Toggle checked={f.priceOnRequest} onChange={(v) => up("priceOnRequest", v)} label={t("قیمت: استعلام")} />
            <Toggle checked={f.in_stock} onChange={(v) => up("in_stock", v)} label={t("موجود است")} />
            <Toggle checked={f.is_active} onChange={(v) => up("is_active", v)} label={t("فعال (در سایت دیده می‌شود)")} />
            {Uploader && <Field label={t("تصویر این تنوع")} hint={t("خالی = تصویر خود محصول")}><Uploader value={f.image_url} onChange={(v) => up("image_url", v)} /></Field>}

            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={busy} className="btn-primary size-md">{busy ? <Spinner /> : <Icon name="save" size={16} />} {needsApproval ? t("ارسال برای تأیید") : t("ذخیره تنوع")}</button>
              <button type="button" onClick={close} disabled={busy} className="btn-ghost size-md">{t("انصراف")}</button>
            </div>
          </form>
        )}

        {editing === null && canCreate && !unavailable && (
          <button type="button" onClick={() => open(null)} disabled={busy} className="btn-ghost size-md" data-testid="variant-add"><Icon name="plus" size={16} /> {t("افزودن تنوع")}</button>
        )}
      </div>

      {deleting && (
        <DeleteProductModal product={deleting} onClose={() => setDeleting(null)} onDelete={remove}
          onDone={(res) => { setDeleting(null); if (res?.pending) setNote(t(res.message)); router.refresh(); }} />
      )}
    </SectionCard>
  );
}
