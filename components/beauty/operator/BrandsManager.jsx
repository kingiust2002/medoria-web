"use client";
// components/beauty/operator/BrandsManager.jsx — the "Maisons" brand directory
// manager. Mirrors CategoriesManager: list + add/edit modal + delete. The one
// addition is an OFFICIAL LOGO upload (the operator supplies the licensed file;
// nothing here fetches or fabricates a brand mark). Brand ↔ products is the
// text join on the brand name, so the row shows how many products carry it.
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Icon from "@/components/shared/Icon";
import { beautyBrandLogoUrl as logoUrl } from "@/lib/beauty/catalog";
import { createBrand, updateBrand, deleteBrand, uploadBrandLogo } from "@/lib/beauty/operator/actions";
import { slugify } from "@/lib/operator/validation";
import { PageHeader, Field, Input, Toggle, Badge, EmptyState, Spinner } from "@/components/operator/ui";

export default function BrandsManager({ brands }) {
  const router = useRouter();
  const [editing, setEditing] = useState(null);   // null | {} (new) | brand
  const [deleting, setDeleting] = useState(null);
  const [msg, setMsg] = useState(null);
  const flash = (text, ok) => { setMsg({ text, ok }); setTimeout(() => setMsg(null), 4000); };

  return (
    <>
      <PageHeader title="برندها" subtitle={`${brands.length} برند`}>
        <button onClick={() => setEditing({})} className="btn-primary size-md"><Icon name="plus" size={18} /> افزودن برند</button>
      </PageHeader>

      <div className="mb-4 text-[12px] rounded-xl px-3 py-2.5 bg-brand-violet/[0.06] text-ink-muted leading-relaxed flex items-start gap-2">
        <Icon name="shield" size={15} className="mt-0.5 shrink-0 text-brand-violet" />
        <span>فقط لوگوی <b>رسمیِ</b> برند را که خودتان از منبع مجاز دارید آپلود کنید. برندهای بدون لوگو با یک placeholder تمیز نمایش داده می‌شوند.</span>
      </div>

      {msg && (
        <div className={`mb-4 text-sm rounded-xl px-3 py-2.5 flex items-center gap-2 ${msg.ok ? "bg-ok/10 text-ok" : "bg-warn/10 text-warn"}`}>
          <Icon name={msg.ok ? "check" : "alertTriangle"} size={16} /> {msg.text}
        </div>
      )}

      {brands.length === 0 ? (
        <EmptyState icon="award" title="برندی وجود ندارد" desc="اولین برند را اضافه کنید. لوگوی رسمی را می‌توانید در همان فرم آپلود کنید.">
          <button onClick={() => setEditing({})} className="btn-primary size-sm"><Icon name="plus" size={16} /> افزودن برند</button>
        </EmptyState>
      ) : (
        <div className="card divide-y divide-line overflow-hidden">
          {brands.map((b) => {
            const active = b.is_active !== false;
            return (
              <div key={b.id ?? b.slug} className="px-3 sm:px-4 py-3 flex items-center gap-3 hover:bg-line-soft/40 transition-colors">
                <span className="grid place-items-center w-12 h-12 rounded-xl bg-white ring-1 ring-line shrink-0 overflow-hidden">
                  {b.logo_url ? <img src={logoUrl(b.logo_url)} alt="" className="w-full h-full object-contain p-1" /> : <Icon name="award" size={18} className="text-ink-faint" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink truncate inline-flex items-center gap-1.5" dir="ltr">
                    {b.name || b.slug}
                    {b.website && (
                      <a href={b.website} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} title="سایت رسمی" className="text-ink-faint hover:text-brand-violet">
                        <Icon name="globe" size={13} />
                      </a>
                    )}
                  </p>
                  <p className="text-xs text-ink-muted truncate mt-0.5"><span dir="ltr">{b.slug}</span> · {b.product_count ?? 0} محصول · ترتیب {b.sort_order ?? 0}</p>
                </div>
                {b.is_featured && <Badge tone="violet" className="hidden sm:inline-flex">ویژه</Badge>}
                <Badge tone={b.logo_url ? "ok" : "muted"} className="hidden md:inline-flex">{b.logo_url ? "لوگو دارد" : "بدون لوگو"}</Badge>
                <Badge tone={active ? "ok" : "muted"} className="hidden sm:inline-flex">{active ? "فعال" : "غیرفعال"}</Badge>
                {b.product_count > 0 && (
                  <Link href={`/beauty/operator/products?brand=${encodeURIComponent(b.name)}`} className="hidden lg:grid place-items-center w-9 h-9 rounded-lg text-ink-muted hover:bg-brand-violet/10 hover:text-brand-violet transition-colors shrink-0" title="دیدن محصولات این برند">
                    <Icon name="package" size={16} />
                  </Link>
                )}
                <Link href={`/beauty/operator/products/new?brand=${encodeURIComponent(b.name)}`} className="grid place-items-center w-9 h-9 rounded-lg text-ink-muted hover:bg-ok/10 hover:text-ok transition-colors shrink-0" title="افزودن محصول برای این برند">
                  <Icon name="plus" size={16} />
                </Link>
                <button onClick={() => setEditing(b)} className="grid place-items-center w-9 h-9 rounded-lg text-ink-muted hover:bg-brand-violet/10 hover:text-brand-violet transition-colors shrink-0" title="ویرایش"><Icon name="edit" size={16} /></button>
                <button onClick={() => setDeleting(b)} className="grid place-items-center w-9 h-9 rounded-lg text-ink-muted hover:bg-warn/10 hover:text-warn transition-colors shrink-0" title="حذف"><Icon name="trash" size={16} /></button>
              </div>
            );
          })}
        </div>
      )}

      {editing !== null && (
        <BrandModal
          brand={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); flash("برند ذخیره شد.", true); router.refresh(); }}
        />
      )}

      {deleting !== null && (
        <DeleteBrandModal
          brand={deleting}
          onClose={() => setDeleting(null)}
          onDone={() => { setDeleting(null); flash("برند حذف شد.", true); router.refresh(); }}
        />
      )}
    </>
  );
}

function DeleteBrandModal({ brand, onClose, onDone }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function run() {
    setErr(""); setBusy(true);
    const res = await deleteBrand(brand.id);
    setBusy(false);
    if (res.ok) onDone(); else setErr(res.error || "حذف ناموفق بود.");
  }
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-navy/40 backdrop-blur-sm" />
      <div onClick={(e) => e.stopPropagation()} dir="rtl" className="relative card p-6 w-full max-w-md animate-fade-in">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-lg text-ink">حذف برند «<span dir="ltr">{brand.name || brand.slug}</span>»</h2>
          <button type="button" onClick={onClose} className="grid place-items-center w-9 h-9 rounded-lg hover:bg-line-soft text-ink-muted"><Icon name="close" size={18} /></button>
        </div>
        {err && <div className="mb-4 text-sm rounded-xl px-3 py-2.5 flex items-center gap-2 bg-warn/10 text-warn"><Icon name="alertTriangle" size={16} /> {err}</div>}
        <p className="text-sm text-ink-soft leading-relaxed mb-2">فقط ردیف برند و لوگویش حذف می‌شود؛ محصولات دست‌نخورده می‌مانند. برای پنهان‌کردن به‌جای حذف، از «ویرایش → فعال» استفاده کنید.</p>
        <div className="flex gap-2 mt-5">
          <button type="button" onClick={run} disabled={busy} className="btn-primary size-md flex-1 disabled:opacity-60 !bg-warn hover:!bg-warn/90">
            {busy ? <Spinner /> : <Icon name="trash" size={17} />}{busy ? "در حال حذف…" : "حذف برند"}
          </button>
          <button type="button" onClick={onClose} className="btn-ghost size-md">انصراف</button>
        </div>
      </div>
    </div>
  );
}

function BrandModal({ brand, onClose, onSaved }) {
  const isNew = !brand.id;
  const [f, setF] = useState({
    slug: brand.slug || "", name: brand.name || "",
    tagline_fa: brand.tagline_fa || "", tagline_en: brand.tagline_en || "",
    logo_url: brand.logo_url || "", website: brand.website || "",
    sort_order: brand.sort_order != null ? String(brand.sort_order) : "0",
    is_active: brand.is_active !== false, is_featured: !!brand.is_featured,
  });
  const [slugTouched, setSlugTouched] = useState(!!brand.slug);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef(null);
  const up = (k, v) => setF((s) => ({ ...s, [k]: v }));

  async function onPickLogo(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr(""); setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await uploadBrandLogo(fd);
    setUploading(false);
    if (res.ok) up("logo_url", res.url); else setErr(res.error || "آپلود لوگو ناموفق بود.");
    if (fileRef.current) fileRef.current.value = "";
  }

  async function save(e) {
    e.preventDefault();
    setErr("");
    if (!f.name.trim()) { setErr("نام برند لازم است."); return; }
    if (isNew && !slugify(f.slug || f.name)) { setErr("اسلاگ معتبر (لاتین) وارد کنید."); return; }
    setSaving(true);
    const res = isNew ? await createBrand(f) : await updateBrand(brand.id, f);
    setSaving(false);
    if (res.ok) onSaved(true); else setErr(res.error || "ذخیره ناموفق بود.");
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-navy/40 backdrop-blur-sm" />
      <form onSubmit={save} onClick={(e) => e.stopPropagation()} dir="rtl" className="relative card p-6 w-full max-w-lg max-h-[90vh] overflow-auto animate-fade-in">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-bold text-lg text-ink">{isNew ? "افزودن برند" : "ویرایش برند"}</h2>
          <button type="button" onClick={onClose} className="grid place-items-center w-9 h-9 rounded-lg hover:bg-line-soft text-ink-muted"><Icon name="close" size={18} /></button>
        </div>
        {err && <div className="mb-4 text-sm rounded-xl px-3 py-2.5 flex items-center gap-2 bg-warn/10 text-warn"><Icon name="alertTriangle" size={16} /> {err}</div>}

        {/* Logo */}
        <div className="flex items-center gap-4 mb-5">
          <span className="grid place-items-center w-20 h-20 rounded-2xl bg-white ring-1 ring-line shrink-0 overflow-hidden">
            {f.logo_url ? <img src={logoUrl(f.logo_url)} alt="" className="w-full h-full object-contain p-1.5" /> : <Icon name="award" size={26} className="text-ink-faint" />}
          </span>
          <div className="flex-1">
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/avif" onChange={onPickLogo} className="hidden" id="brand-logo-input" />
            <div className="flex flex-wrap gap-2">
              <label htmlFor="brand-logo-input" className="btn-ghost size-sm cursor-pointer">
                {uploading ? <Spinner /> : <Icon name="upload" size={15} />}{uploading ? "در حال آپلود…" : "آپلود لوگوی رسمی"}
              </label>
              {f.logo_url && <button type="button" onClick={() => up("logo_url", "")} className="btn-ghost size-sm !text-warn">حذف لوگو</button>}
            </div>
            <p className="text-[11px] text-ink-faint mt-1.5 leading-relaxed">PNG شفاف ترجیح دارد. حداکثر ۵ مگابایت. فقط لوگوی مجاز خودتان.</p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="نام برند" required hint="همان‌طور که روی محصولات ثبت شده (لاتین)">
            <Input value={f.name} onChange={(e) => { up("name", e.target.value); if (isNew && !slugTouched) up("slug", slugify(e.target.value)); }} dir="ltr" placeholder="La Prairie" />
          </Field>
          <Field label="اسلاگ" required hint={isNew ? "در آدرس استفاده می‌شود" : "پس از ساخت ثابت است"}>
            <Input value={f.slug} disabled={!isNew} onChange={(e) => { setSlugTouched(true); up("slug", e.target.value); }} dir="ltr" placeholder="la-prairie" />
          </Field>
        </div>
        <div className="grid sm:grid-cols-2 gap-4 mt-4">
          <Field label="آدرس سایت رسمی (اختیاری)"><Input value={f.website} onChange={(e) => up("website", e.target.value)} dir="ltr" placeholder="https://…" /></Field>
          <Field label="ترتیب نمایش"><Input type="number" value={f.sort_order} onChange={(e) => up("sort_order", e.target.value)} dir="ltr" /></Field>
        </div>
        <div className="grid sm:grid-cols-2 gap-4 mt-4">
          <Field label="یک‌خط معرفی (فارسی، اختیاری)"><Input value={f.tagline_fa} onChange={(e) => up("tagline_fa", e.target.value)} placeholder="مراقبت پوست حرفه‌ای" /></Field>
          <Field label="یک‌خط معرفی (انگلیسی، اختیاری)"><Input value={f.tagline_en} onChange={(e) => up("tagline_en", e.target.value)} dir="ltr" placeholder="Professional skincare" /></Field>
        </div>
        <div className="grid sm:grid-cols-2 gap-3 mt-4">
          <div className="rounded-xl bg-canvas-soft border border-line p-3.5"><Toggle checked={f.is_active} onChange={(v) => up("is_active", v)} label="فعال" /></div>
          <div className="rounded-xl bg-canvas-soft border border-line p-3.5"><Toggle checked={f.is_featured} onChange={(v) => up("is_featured", v)} label="ویژه" /></div>
        </div>
        <div className="flex gap-2 mt-6">
          <button type="submit" disabled={saving || uploading} className="btn-primary size-md flex-1 disabled:opacity-60">{saving ? <Spinner /> : <Icon name="save" size={18} />}{saving ? "در حال ذخیره…" : "ذخیره"}</button>
          <button type="button" onClick={onClose} className="btn-ghost size-md">انصراف</button>
        </div>
      </form>
    </div>
  );
}
