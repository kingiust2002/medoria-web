"use client";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Icon from "@/components/shared/Icon";
import { beautyImageUrl as imageUrl } from "@/lib/beauty/catalog";
import { createProduct, updateProduct, uploadProductImage, translateProductFields } from "@/lib/beauty/operator/actions";
import { slugify } from "@/lib/operator/validation";
import { PRODUCT_BADGES } from "@/lib/beauty/operator/constants";
import ImageUploader from "@/components/beauty/operator/ImageUploader";
import SpecsEditor from "@/components/operator/SpecsEditor";
import QuickCategoryModal from "@/components/beauty/operator/QuickCategoryModal";
import { BEAUTY_WORLDS } from "@/lib/beauty/operator/constants";
import { SectionCard, Field, Input, Textarea, Select, Toggle, Spinner } from "@/components/operator/ui";

// Category options grouped by world (Sephora-style two-level taxonomy) so a
// long category list stays scannable in the select.
function CategoryOptions({ cats }) {
  const worldless = cats.filter((c) => !c.world);
  return (
    <>
      {BEAUTY_WORLDS.map((w) => {
        const inWorld = cats.filter((c) => c.world === w.value);
        if (!inWorld.length) return null;
        return (
          <optgroup key={w.value} label={w.label}>
            {inWorld.map((c) => <option key={c.id ?? c.slug} value={String(c.id ?? "")}>{c.name_fa || c.name_en || c.slug}</option>)}
          </optgroup>
        );
      })}
      {worldless.length > 0 && (
        <optgroup label="بدون دنیا">
          {worldless.map((c) => <option key={c.id ?? c.slug} value={String(c.id ?? "")}>{c.name_fa || c.name_en || c.slug}</option>)}
        </optgroup>
      )}
    </>
  );
}

// Unsaved NEW-product draft (never edit pages, never secrets) survives reloads.
const DRAFT_KEY = "medoria_beauty_operator_product_draft_v1";

export default function ProductForm({ mode, product, categories }) {
  const router = useRouter();
  const editing = mode === "edit";
  const galleryRef = useRef(null);

  const [f, setF] = useState({
    name_fa: product?.name_fa || "", name_en: product?.name_en || "",
    name_ru: product?.name_ru || "", name_tg: product?.name_tg || "",
    description_fa: product?.description_fa || "", description_en: product?.description_en || "",
    description_ru: product?.description_ru || "", description_tg: product?.description_tg || "",
    slug: product?.slug || "", sku: product?.sku || "", brand: product?.brand || "",
    category_id: product?.category_id != null ? String(product.category_id) : "",
    price: product?.price != null ? String(product.price) : "",
    unit: product?.unit || "", min_order_qty: product?.min_order_qty != null ? String(product.min_order_qty) : "1",
    in_stock: product ? !!product.in_stock : true,
    badge: product?.badge || "",
    is_featured: !!product?.is_featured,
    is_active: product ? product.is_active !== false : true,
    image_url: product?.image_url || "", brochure_url: product?.brochure_url || "",
    tags: Array.isArray(product?.tags) ? product.tags.join("، ") : "",
    seo_title: product?.seo_title || "", seo_description: product?.seo_description || "",
  });
  const [gallery, setGallery] = useState(Array.isArray(product?.gallery_urls) ? product.gallery_urls : []);
  const [specs, setSpecs] = useState(
    product?.specs && typeof product.specs === "object" && !Array.isArray(product.specs)
      ? Object.entries(product.specs).map(([key, value]) => ({ key, value: String(value ?? "") }))
      : [{ key: "", value: "" }]
  );
  const [priceOnRequest, setPriceOnRequest] = useState(
    product ? product.price == null || product.price === "" || Number(product.price) === 0 : false
  );
  const [slugTouched, setSlugTouched] = useState(!!product?.slug);
  const [saving, setSaving] = useState(false);
  const [galleryBusy, setGalleryBusy] = useState(false);
  const [err, setErr] = useState("");
  const [translating, setTranslating] = useState(false);
  const [transSource, setTransSource] = useState("fa");
  const [expandLangs, setExpandLangs] = useState(false);

  const [cats, setCats] = useState(categories);
  const [catModal, setCatModal] = useState(false);
  const [savedToast, setSavedToast] = useState(null); // { id, name }
  const [draftFound, setDraftFound] = useState(null);
  const [dirty, setDirty] = useState(false);
  const addAnotherRef = useRef(false);
  const skipDirtyRef = useRef(false);

  const up = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const onNameEn = (v) => { up("name_en", v); if (!slugTouched) up("slug", slugify(v)); };

  // ── draft protection (new mode only) ─────────────────────────────────────────
  useEffect(() => {
    if (editing) return;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d && d.f && (d.f.name_fa || d.f.name_en || d.f.sku)) setDraftFound(d);
      }
    } catch { /* corrupted draft — ignore */ }
  }, [editing]);

  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) { mountedRef.current = true; return; }
    if (skipDirtyRef.current) { skipDirtyRef.current = false; return; }
    setDirty(true);
  }, [f, gallery, specs, priceOnRequest]);

  useEffect(() => {
    if (editing || !dirty) return;
    const t = setTimeout(() => {
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ f, gallery, specs, priceOnRequest, at: Date.now() })); } catch { /* storage full */ }
    }, 600);
    return () => clearTimeout(t);
  }, [f, gallery, specs, priceOnRequest, dirty, editing]);

  useEffect(() => {
    if (!dirty) return;
    const h = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  function restoreDraft() {
    const d = draftFound;
    if (!d) return;
    setF((s) => ({ ...s, ...d.f }));
    setGallery(Array.isArray(d.gallery) ? d.gallery : []);
    setSpecs(Array.isArray(d.specs) && d.specs.length ? d.specs : [{ key: "", value: "" }]);
    setPriceOnRequest(!!d.priceOnRequest);
    setSlugTouched(!!d.f?.slug);
    setDraftFound(null);
  }
  function discardDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* no-op */ }
    setDraftFound(null);
  }
  function clearDraftStorage() {
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* no-op */ }
  }

  // Identity fields reset for "save & add another"; sticky defaults (category,
  // brand, unit, price mode, stock/active/badge/min qty) carry to the next one.
  function resetForNext() {
    skipDirtyRef.current = true;
    setF((s) => ({
      ...s,
      name_fa: "", name_en: "", name_ru: "", name_tg: "",
      description_fa: "", description_en: "", description_ru: "", description_tg: "",
      slug: "", sku: "", image_url: "", brochure_url: "",
      tags: "", seo_title: "", seo_description: "",
    }));
    setGallery([]);
    setSpecs([{ key: "", value: "" }]);
    setSlugTouched(false);
    setExpandLangs(false);
    setDirty(false);
    requestAnimationFrame(() => document.getElementById("pf-name-fa")?.focus());
  }

  const selectedCat = cats.find((c) => String(c.id) === String(f.category_id));
  const catLabel = selectedCat ? (selectedCat.name_fa || selectedCat.name_en || selectedCat.slug) : "بدون دسته";
  const previewImg = f.image_url ? imageUrl(f.image_url) : null;
  const priceLabel = priceOnRequest || !f.price ? "استعلام قیمت" : `$${Number(f.price).toFixed(2)}`;

  async function addGalleryFile(file) {
    if (!file) return;
    setGalleryBusy(true);
    const fd = new FormData(); fd.append("file", file);
    const res = await uploadProductImage(fd);
    setGalleryBusy(false);
    if (res.ok) setGallery((g) => [...g, res.path]);
    else setErr(res.error || "آپلود گالری ناموفق بود.");
  }

  async function autoTranslate() {
    setErr("");
    const srcName = f[`name_${transSource}`] || "";
    const srcDesc = f[`description_${transSource}`] || "";
    if (!srcName.trim() && !srcDesc.trim()) { setErr("اول نام یا توضیحات زبانِ مبدأ را پر کن."); return; }
    setTranslating(true);
    const res = await translateProductFields({ source: transSource, name: srcName, description: srcDesc });
    setTranslating(false);
    if (!res.ok) { setErr(res.error || "ترجمه ناموفق بود."); return; }
    setF((s) => {
      const next = { ...s };
      for (const [lang, vals] of Object.entries(res.translations)) {
        if (vals.name) next[`name_${lang}`] = vals.name;
        if (vals.description) next[`description_${lang}`] = vals.description;
      }
      return next;
    });
    setExpandLangs(true);
  }

  async function submit(e) {
    e.preventDefault();
    setErr("");
    if (!f.name_fa.trim() && !f.name_en.trim()) { setErr("حداقل نام فارسی یا انگلیسی محصول را وارد کنید."); return; }
    setSaving(true);
    const payload = {
      ...f,
      category_id: f.category_id || null,
      category: selectedCat?.slug || null,
      priceOnRequest,
      price: priceOnRequest ? "" : f.price,
      tags: f.tags.split(/[،,]/),
      gallery_urls: gallery,
      specs,
    };
    const res = editing ? await updateProduct(product.id, payload) : await createProduct(payload);
    setSaving(false);
    if (res.ok) {
      clearDraftStorage();
      setDirty(false);
      if (!editing && addAnotherRef.current) {
        addAnotherRef.current = false;
        setSavedToast({ id: res.id, name: f.name_fa || f.name_en || res.slug });
        resetForNext();
        router.refresh();
        return;
      }
      router.push("/beauty/operator/products");
    } else {
      addAnotherRef.current = false;
      setErr(res.error || "ذخیره ناموفق بود.");
    }
  }

  const SaveButton = ({ full }) => (
    <button type="submit" disabled={saving} className={`btn-primary size-md ${full ? "w-full" : ""} disabled:opacity-60`}>
      {saving ? <Spinner /> : <Icon name="save" size={18} />}
      {saving ? "در حال ذخیره…" : editing ? "ذخیره تغییرات" : "افزودن محصول"}
    </button>
  );

  // "Save & add another" — create mode only; resets identity fields, keeps
  // sticky defaults, and keeps the operator on this page for the next product.
  const SaveAndNextButton = ({ full }) => (
    editing ? null : (
      <button
        type="submit"
        disabled={saving}
        onClick={() => { addAnotherRef.current = true; }}
        className={`btn-ghost size-md ${full ? "w-full" : ""} disabled:opacity-60`}
      >
        <Icon name="plusCircle" size={18} /> ذخیره و افزودن بعدی
      </button>
    )
  );

  return (
    <form onSubmit={submit}>
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/beauty/operator/products" className="grid place-items-center w-9 h-9 rounded-lg text-ink-muted hover:bg-line-soft shrink-0"><Icon name="chevronRight" size={18} /></Link>
          <h1 className="text-xl sm:text-2xl font-bold font-display text-ink tracking-tight truncate">{editing ? "ویرایش محصول" : "افزودن محصول"}</h1>
        </div>
        <div className="hidden sm:flex items-center gap-2"><SaveAndNextButton /><SaveButton /></div>
      </div>

      {draftFound && (
        <div className="mb-5 text-sm rounded-xl px-3 py-2.5 flex flex-wrap items-center gap-2 bg-primary/10 text-primary">
          <Icon name="archive" size={16} />
          پیش‌نویس ذخیره‌نشده‌ای از قبل وجود دارد{draftFound.f?.name_fa ? ` («${draftFound.f.name_fa}»)` : ""}.
          <button type="button" onClick={restoreDraft} className="font-semibold underline underline-offset-2">بازیابی</button>
          <button type="button" onClick={discardDraft} className="text-ink-muted underline underline-offset-2">حذف پیش‌نویس</button>
        </div>
      )}

      {savedToast && (
        <div className="mb-5 text-sm rounded-xl px-3 py-2.5 flex flex-wrap items-center gap-2 bg-ok/10 text-ok">
          <Icon name="check" size={16} />
          «{savedToast.name}» ذخیره شد.
          {savedToast.id && (
            <Link href={`/beauty/operator/products/${savedToast.id}/edit`} className="font-semibold underline underline-offset-2">ویرایش</Link>
          )}
          <button type="button" onClick={() => setSavedToast(null)} className="mr-auto text-ink-muted"><Icon name="close" size={14} /></button>
        </div>
      )}

      {err && (
        <div className="mb-5 text-sm rounded-xl px-3 py-2.5 flex items-center gap-2 bg-warn/10 text-warn">
          <Icon name="alertTriangle" size={16} /> {err}
        </div>
      )}

      <div className="grid lg:grid-cols-[1fr_330px] gap-6 items-start">
        {/* ── Left: form sections ─────────────────────────────────────────── */}
        <div className="flex flex-col gap-5 min-w-0">
          {/* Basic */}
          <SectionCard title="اطلاعات پایه" desc="نام و مشخصات اصلی محصول" icon="package">
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="نام محصول (فارسی)" required><Input id="pf-name-fa" value={f.name_fa} onChange={(e) => up("name_fa", e.target.value)} placeholder="سرم ویتامین C" /></Field>
              <Field label="نام محصول (انگلیسی)" hint="برای ساخت آدرس صفحه استفاده می‌شود"><Input value={f.name_en} onChange={(e) => onNameEn(e.target.value)} dir="ltr" placeholder="Vitamin C serum" /></Field>
            </div>

            {/* Auto-translate */}
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-brand-violet/5 border border-brand-violet/15 p-2.5">
              <Icon name="globe" size={15} className="text-brand-violet shrink-0" />
              <span className="text-[12px] text-ink-muted">ترجمهٔ خودکار از</span>
              <select value={transSource} onChange={(e) => setTransSource(e.target.value)} className="input !h-8 w-auto text-xs py-0">
                <option value="fa">فارسی</option>
                <option value="en">انگلیسی</option>
                <option value="ru">روسی</option>
                <option value="tg">تاجیکی</option>
              </select>
              <button type="button" onClick={autoTranslate} disabled={translating} className="btn-ghost size-sm">
                {translating ? <Spinner /> : <Icon name="sparkles" size={15} />} ترجمه به سایر زبان‌ها
              </button>
              <span className="text-[11px] text-ink-faint">نام و توضیحات را پر می‌کند</span>
            </div>

            <details open={expandLangs} onToggle={(e) => setExpandLangs(e.currentTarget.open)} className="mt-3 group">
              <summary className="cursor-pointer text-xs font-semibold text-brand-violet inline-flex items-center gap-1">نام‌های روسی و تاجیکی (اختیاری) <Icon name="chevronDown" size={14} className="group-open:rotate-180 transition-transform" /></summary>
              <div className="grid sm:grid-cols-2 gap-4 mt-3">
                <Field label="نام (روسی)"><Input value={f.name_ru} onChange={(e) => up("name_ru", e.target.value)} dir="ltr" /></Field>
                <Field label="نام (تاجیکی)"><Input value={f.name_tg} onChange={(e) => up("name_tg", e.target.value)} dir="ltr" /></Field>
              </div>
            </details>
            <div className="grid sm:grid-cols-3 gap-4 mt-4">
              <Field label="اسلاگ (slug)" hint="در آدرس صفحه"><Input value={f.slug} onChange={(e) => { setSlugTouched(true); up("slug", e.target.value); }} dir="ltr" placeholder="vitamin-c-serum" /></Field>
              <Field label="کد محصول (SKU)"><Input value={f.sku} onChange={(e) => up("sku", e.target.value)} dir="ltr" placeholder="BTY-001" /></Field>
              <Field label="برند"><Input value={f.brand} onChange={(e) => up("brand", e.target.value)} placeholder="Chanel" /></Field>
            </div>
            <div className="mt-4 flex items-end gap-2">
              <div className="flex-1">
                <Field label="دسته‌بندی">
                  <Select value={f.category_id} onChange={(e) => up("category_id", e.target.value)}>
                    <option value="">— انتخاب دسته —</option>
                    <CategoryOptions cats={cats} />
                  </Select>
                </Field>
              </div>
              <button type="button" onClick={() => setCatModal(true)} title="دسته جدید" className="btn-ghost size-md shrink-0">
                <Icon name="plus" size={16} /> دسته جدید
              </button>
            </div>
            <div className="mt-4">
              <Field label="توضیحات (فارسی)"><Textarea value={f.description_fa} onChange={(e) => up("description_fa", e.target.value)} rows={4} placeholder="توضیح کامل محصول…" /></Field>
            </div>
            <details open={expandLangs} onToggle={(e) => setExpandLangs(e.currentTarget.open)} className="mt-3 group">
              <summary className="cursor-pointer text-xs font-semibold text-brand-violet inline-flex items-center gap-1">توضیحات به زبان‌های دیگر (اختیاری) <Icon name="chevronDown" size={14} className="group-open:rotate-180 transition-transform" /></summary>
              <div className="grid gap-4 mt-3">
                <Field label="توضیحات (انگلیسی)"><Textarea value={f.description_en} onChange={(e) => up("description_en", e.target.value)} dir="ltr" rows={3} /></Field>
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field label="توضیحات (روسی)"><Textarea value={f.description_ru} onChange={(e) => up("description_ru", e.target.value)} dir="ltr" rows={3} /></Field>
                  <Field label="توضیحات (تاجیکی)"><Textarea value={f.description_tg} onChange={(e) => up("description_tg", e.target.value)} dir="ltr" rows={3} /></Field>
                </div>
              </div>
            </details>
          </SectionCard>

          {/* Pricing */}
          <SectionCard title="قیمت و موجودی" desc="قیمت ثابت یا استعلام قیمت" icon="dollar">
            <div className="rounded-xl bg-canvas-soft border border-line p-3.5 mb-4">
              <Toggle checked={priceOnRequest} onChange={setPriceOnRequest} label="استعلام قیمت" desc="قیمت نمایش داده نمی‌شود؛ مشتری درخواست قیمت می‌دهد." />
            </div>
            <div className="grid sm:grid-cols-3 gap-4">
              <Field label="قیمت (دلار)" hint={priceOnRequest ? "غیرفعال (حالت استعلام)" : "خالی = استعلام قیمت"}>
                <Input type="number" step="0.01" min="0" value={priceOnRequest ? "" : f.price} disabled={priceOnRequest} onChange={(e) => up("price", e.target.value)} dir="ltr" placeholder="8.50" />
              </Field>
              <Field label="واحد"><Input value={f.unit} onChange={(e) => up("unit", e.target.value)} placeholder="۳۰ میلی‌لیتر" /></Field>
              <Field label="حداقل سفارش"><Input type="number" min="1" value={f.min_order_qty} onChange={(e) => up("min_order_qty", e.target.value)} dir="ltr" /></Field>
            </div>
            <div className="grid sm:grid-cols-2 gap-4 mt-4 items-center">
              <Field label="نشان محصول"><Select value={f.badge} onChange={(e) => up("badge", e.target.value)}>{PRODUCT_BADGES.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}</Select></Field>
              <div className="rounded-xl bg-canvas-soft border border-line p-3.5 mt-6 sm:mt-5"><Toggle checked={f.in_stock} onChange={(v) => up("in_stock", v)} label="موجود است" /></div>
            </div>
          </SectionCard>

          {/* Images */}
          <SectionCard title="تصاویر" desc="تصویر اصلی و گالری محصول" icon="image">
            <Field label="تصویر اصلی"><ImageUploader value={f.image_url} onChange={(v) => up("image_url", v)} /></Field>
            <div className="mt-5">
              <span className="block text-[13px] font-medium text-ink-soft mb-2">گالری (اختیاری)</span>
              <div className="flex flex-wrap gap-2.5">
                {gallery.map((g, i) => (
                  <span key={i} className="img-ph relative w-20 h-20 rounded-lg overflow-hidden border border-line group">
                    <img src={imageUrl(g)} alt="" className="w-full h-full object-cover" />
                    <button type="button" onClick={() => setGallery(gallery.filter((_, idx) => idx !== i))} className="absolute top-1 left-1 grid place-items-center w-6 h-6 rounded-md bg-navy/60 text-white opacity-0 group-hover:opacity-100 transition-opacity"><Icon name="close" size={13} /></button>
                  </span>
                ))}
                <button type="button" onClick={() => galleryRef.current?.click()} disabled={galleryBusy} className="w-20 h-20 rounded-lg border-2 border-dashed border-line grid place-items-center text-ink-faint hover:border-brand-violet/40 hover:text-brand-violet transition-colors">
                  {galleryBusy ? <Spinner size={18} /> : <Icon name="plus" size={20} />}
                </button>
                <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={(e) => addGalleryFile(e.target.files?.[0])} />
              </div>
            </div>
          </SectionCard>

          {/* Specs */}
          <SectionCard title="مشخصات فنی" desc="ویژگی‌ها به‌صورت کلید/مقدار" icon="list">
            <SpecsEditor rows={specs} onChange={setSpecs} />
          </SectionCard>

          {/* SEO & more */}
          <SectionCard title="سئو و موارد بیشتر" desc="اختیاری — برای بهبود نمایش در گوگل" icon="search">
            <div className="grid gap-4">
              <Field label="برچسب‌ها (با ویرگول جدا کنید)"><Input value={f.tags} onChange={(e) => up("tags", e.target.value)} placeholder="دستکش، نیتریل، یکبار مصرف" /></Field>
              <Field label="عنوان سئو"><Input value={f.seo_title} onChange={(e) => up("seo_title", e.target.value)} /></Field>
              <Field label="توضیح سئو"><Textarea value={f.seo_description} onChange={(e) => up("seo_description", e.target.value)} rows={2} /></Field>
              <Field label="لینک بروشور (PDF)"><Input value={f.brochure_url} onChange={(e) => up("brochure_url", e.target.value)} dir="ltr" placeholder="https://…" /></Field>
            </div>
          </SectionCard>

          <div className="sm:hidden flex flex-col gap-2"><SaveButton full /><SaveAndNextButton full /></div>
        </div>

        {/* ── Right: publish + live preview ───────────────────────────────── */}
        <div className="flex flex-col gap-5 lg:sticky lg:top-6">
          <SectionCard title="انتشار" icon="badgeCheck">
            <div className="flex flex-col gap-3">
              <div className="rounded-xl bg-canvas-soft border border-line p-3.5"><Toggle checked={f.is_active} onChange={(v) => up("is_active", v)} label="فعال (نمایش در سایت)" desc="غیرفعال = آرشیو، در سایت دیده نمی‌شود." /></div>
              <div className="rounded-xl bg-canvas-soft border border-line p-3.5"><Toggle checked={f.is_featured} onChange={(v) => up("is_featured", v)} label="ویژه (Featured)" desc="نمایش در بخش محصولات منتخب." /></div>
            </div>
            <div className="mt-4 flex flex-col gap-2">
              <SaveButton full />
              <SaveAndNextButton full />
              <Link href="/beauty/operator/products" className="btn-ghost size-md w-full">انصراف</Link>
            </div>
          </SectionCard>

          <SectionCard title="پیش‌نمایش" icon="eye">
            <div className="card-flat overflow-hidden">
              <div className="img-ph aspect-[4/3] grid place-items-center text-ink-faint relative">
                {previewImg ? <img src={previewImg} alt="" className="w-full h-full object-cover" /> : <Icon name="image" size={30} />}
                {f.badge && <span className="tag absolute top-2.5 right-2.5 bg-primary text-white">{f.badge}</span>}
                {!f.in_stock && <span className="pill absolute bottom-2.5 right-2.5 bg-navy/70 text-white !text-[10px]">ناموجود</span>}
              </div>
              <div className="p-3.5">
                <p className="font-semibold text-ink truncate">{f.name_fa || f.name_en || "نام محصول"}</p>
                <p className="text-xs text-ink-muted truncate mt-0.5">{[f.brand, catLabel].filter(Boolean).join(" · ") || "—"}</p>
                <p className={`mt-2 font-bold ${priceOnRequest || !f.price ? "text-brand-violet text-sm" : "text-ink"}`}>
                  {priceLabel}{!priceOnRequest && f.price && f.unit ? <span className="text-ink-faint font-normal text-xs"> / {f.unit}</span> : null}
                </p>
              </div>
            </div>
            <p className="text-[11px] text-ink-faint mt-3 leading-relaxed text-center">پیش‌نمایش زنده — همراه با تغییر فیلدها به‌روز می‌شود.</p>
          </SectionCard>
        </div>
      </div>

      {catModal && (
        <QuickCategoryModal
          onClose={() => setCatModal(false)}
          onCreated={(cat) => {
            setCats((list) => [...list, cat]);
            up("category_id", String(cat.id ?? ""));
            setCatModal(false);
          }}
        />
      )}
    </form>
  );
}
