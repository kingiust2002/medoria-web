"use client";
// components/beauty/operator/BrandsManager.jsx — the "Maisons" brand directory
// manager. Mirrors CategoriesManager: list + add/edit modal + delete. The one
// addition is an OFFICIAL LOGO upload (the operator supplies the licensed file;
// nothing here fetches or fabricates a brand mark). Brand ↔ products is the
// text join on the brand name, so the row shows how many products carry it.
import ImageCropDialog, { CROP_ASPECTS } from "@/components/operator/ImageCropDialog";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/shared/Icon";
import { beautyBrandLogoUrl as logoUrl } from "@/lib/beauty/catalog";
import { createBrand, updateBrand, deleteBrand, uploadBrandLogo } from "@/lib/beauty/operator/actions";
import { slugify } from "@/lib/operator/validation";
import { PageHeader, Field, Input, Toggle, Badge, EmptyState, Spinner } from "@/components/operator/ui";
import BrandProductsModal from "./BrandProductsModal";
import { useT } from "@/components/panel/PanelI18n";
import { useCan } from "@/components/panel/Capabilities";
import Trans from "@/components/panel/Trans";

const LOGO_ASPECTS = CROP_ASPECTS.filter((a) => ["1:1", "4:3", "16:9"].includes(a.key));

export default function BrandsManager({ brands }) {
  const t = useT();
  const router = useRouter();
  const [editing, setEditing] = useState(null);   // null | {} (new) | brand
  const [deleting, setDeleting] = useState(null);
  const [managing, setManaging] = useState(null); // null | brand — product roster modal
  const [msg, setMsg] = useState(null);
  // what this person may offer on screen (the server asks again on every action)
  const canCreate = useCan("brands.create"), canEdit = useCan("brands.edit"), canDelete = useCan("brands.delete");
  const flash = (text, ok) => { setMsg({ text, ok }); setTimeout(() => setMsg(null), 4000); };

  return (
    <>
      <PageHeader title={t("برندها")} subtitle={t("{length} برند", { length: brands.length })}>
        {canCreate && <button onClick={() => setEditing({})} className="btn-primary size-md"><Icon name="plus" size={18} /> {t("افزودن برند")}</button>}
      </PageHeader>

      <div className="mb-4 text-[12px] rounded-xl px-3 py-2.5 bg-brand-violet/[0.06] text-ink-muted leading-relaxed flex items-start gap-2">
        <Icon name="shield" size={15} className="mt-0.5 shrink-0 text-brand-violet" />
        <span><Trans t={t} k="فقط لوگوی {official} برند را که خودتان از منبع مجاز دارید آپلود کنید. برندهای بدون لوگو با یک placeholder تمیز نمایش داده می‌شوند." values={{ official: <b>{t("رسمیِ")}</b> }} /></span>
      </div>

      {msg && (
        <div className={`mb-4 text-sm rounded-xl px-3 py-2.5 flex items-center gap-2 ${msg.ok ? "bg-ok/10 text-ok" : "bg-warn/10 text-warn"}`}>
          <Icon name={msg.ok ? "check" : "alertTriangle"} size={16} /> {msg.text}
        </div>
      )}

      {brands.length === 0 ? (
        <EmptyState icon="award" title={t("برندی وجود ندارد")} desc={t("اولین برند را اضافه کنید. لوگوی رسمی را می‌توانید در همان فرم آپلود کنید.")}>
          {canCreate && <button onClick={() => setEditing({})} className="btn-primary size-sm"><Icon name="plus" size={16} /> {t("افزودن برند")}</button>}
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
                      <a href={b.website} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} title={t("سایت رسمی")} className="text-ink-faint hover:text-brand-violet">
                        <Icon name="globe" size={13} />
                      </a>
                    )}
                  </p>
                  <p className="text-xs text-ink-muted truncate mt-0.5"><span dir="ltr">{b.slug}</span> {t("· {v} محصول · ترتیب {v2}", { v: b.product_count ?? 0, v2: b.sort_order ?? 0 })}</p>
                </div>
                {b.is_featured && <Badge tone="violet" className="hidden sm:inline-flex">{t("ویژه")}</Badge>}
                <Badge tone={b.logo_url ? "ok" : "muted"} className="hidden md:inline-flex">{b.logo_url ? t("لوگو دارد") : t("بدون لوگو")}</Badge>
                <Badge tone={active ? "ok" : "muted"} className="hidden sm:inline-flex">{active ? t("فعال") : t("غیرفعال")}</Badge>
                {canEdit && <button onClick={() => setManaging(b)} className="grid place-items-center w-9 h-9 rounded-lg text-ink-muted hover:bg-ok/10 hover:text-ok transition-colors shrink-0" title={t("مدیریت محصولات این برند")}>
                  <Icon name="package" size={16} />
                </button>}
                {canEdit && <button onClick={() => setEditing(b)} className="grid place-items-center w-9 h-9 rounded-lg text-ink-muted hover:bg-brand-violet/10 hover:text-brand-violet transition-colors shrink-0" title={t("ویرایش")}><Icon name="edit" size={16} /></button>}
                {canDelete && <button onClick={() => setDeleting(b)} className="grid place-items-center w-9 h-9 rounded-lg text-ink-muted hover:bg-warn/10 hover:text-warn transition-colors shrink-0" title={t("حذف")}><Icon name="trash" size={16} /></button>}
              </div>
            );
          })}
        </div>
      )}

      {editing !== null && (
        <BrandModal
          brand={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); flash(t("برند ذخیره شد."), true); router.refresh(); }}
        />
      )}

      {deleting !== null && (
        <DeleteBrandModal
          brand={deleting}
          onClose={() => setDeleting(null)}
          onDone={(pendingMessage) => { setDeleting(null); flash(pendingMessage ? t(pendingMessage) : t("برند حذف شد."), true); router.refresh(); }}
        />
      )}

      {managing !== null && (
        <BrandProductsModal
          brand={managing}
          onClose={() => setManaging(null)}
        />
      )}
    </>
  );
}

function DeleteBrandModal({ brand, onClose, onDone }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function run() {
    setErr(""); setBusy(true);
    const res = await deleteBrand(brand.id);
    setBusy(false);
    if (res.ok) onDone(res.pending ? res.message : undefined); else setErr(t(res.error) || t("حذف ناموفق بود."));
  }
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-navy/40 backdrop-blur-sm" />
      <div onClick={(e) => e.stopPropagation()} dir="rtl" className="relative card p-6 w-full max-w-md animate-fade-in">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-lg text-ink"><Trans t={t} k="حذف برند «{name}»" values={{ name: <span dir="ltr">{brand.name || brand.slug}</span> }} /></h2>
          <button type="button" onClick={onClose} className="grid place-items-center w-9 h-9 rounded-lg hover:bg-line-soft text-ink-muted"><Icon name="close" size={18} /></button>
        </div>
        {err && <div className="mb-4 text-sm rounded-xl px-3 py-2.5 flex items-center gap-2 bg-warn/10 text-warn"><Icon name="alertTriangle" size={16} /> {err}</div>}
        <p className="text-sm text-ink-soft leading-relaxed mb-2">{t("فقط ردیف برند و لوگویش حذف می‌شود؛ محصولات دست‌نخورده می‌مانند. برای پنهان‌کردن به‌جای حذف، از «ویرایش → فعال» استفاده کنید.")}</p>
        <div className="flex gap-2 mt-5">
          <button type="button" onClick={run} disabled={busy} className="btn-primary size-md flex-1 disabled:opacity-60 !bg-warn hover:!bg-warn/90">
            {busy ? <Spinner /> : <Icon name="trash" size={17} />}{busy ? t("در حال حذف…") : t("حذف برند")}
          </button>
          <button type="button" onClick={onClose} className="btn-ghost size-md">{t("انصراف")}</button>
        </div>
      </div>
    </div>
  );
}

function BrandModal({ brand, onClose, onSaved }) {
  const t = useT();
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
  const [pendingLogo, setPendingLogo] = useState(null);
  const [err, setErr] = useState("");
  const fileRef = useRef(null);
  const up = (k, v) => setF((s) => ({ ...s, [k]: v }));

  // the chosen file first goes through the crop dialog (the original can be sent as it is — an official logo should not be altered)
  function onPickLogo(e) {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    setErr("");
    setPendingLogo(file);
  }
  async function sendLogo(file) {
    setPendingLogo(null);
    setErr(""); setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await uploadBrandLogo(fd);
    setUploading(false);
    if (res.ok) up("logo_url", res.url); else setErr(t(res.error) || t("آپلود لوگو ناموفق بود."));
  }

  async function save(e) {
    e.preventDefault();
    setErr("");
    if (!f.name.trim()) { setErr(t("نام برند لازم است.")); return; }
    if (isNew && !slugify(f.slug || f.name)) { setErr(t("اسلاگ معتبر (لاتین) وارد کنید.")); return; }
    setSaving(true);
    const res = isNew ? await createBrand(f) : await updateBrand(brand.id, f);
    setSaving(false);
    if (res.ok) onSaved(true); else setErr(t(res.error) || t("ذخیره ناموفق بود."));
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-navy/40 backdrop-blur-sm" />
      <form onSubmit={save} onClick={(e) => e.stopPropagation()} dir="rtl" className="relative card p-6 w-full max-w-lg max-h-[90vh] overflow-auto animate-fade-in">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-bold text-lg text-ink">{isNew ? t("افزودن برند") : t("ویرایش برند")}</h2>
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
                {uploading ? <Spinner /> : <Icon name="upload" size={15} />}{uploading ? t("در حال آپلود…") : t("آپلود لوگوی رسمی")}
              </label>
              {f.logo_url && <button type="button" onClick={() => up("logo_url", "")} className="btn-ghost size-sm !text-warn">{t("حذف لوگو")}</button>}
            </div>
            <p className="text-[11px] text-ink-faint mt-1.5 leading-relaxed">{t("PNG شفاف ترجیح دارد. حداکثر ۵ مگابایت. فقط لوگوی مجاز خودتان.")}</p>
            {pendingLogo && <ImageCropDialog file={pendingLogo} aspects={LOGO_ASPECTS} defaultAspect="1:1" title={t("برش لوگو")} onCancel={() => setPendingLogo(null)} onDone={sendLogo} />}
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <Field label={t("نام برند")} required hint={t("همان‌طور که روی محصولات ثبت شده (لاتین)")}>
            <Input value={f.name} onChange={(e) => { up("name", e.target.value); if (isNew && !slugTouched) up("slug", slugify(e.target.value)); }} dir="ltr" placeholder="La Prairie" />
          </Field>
          <Field label={t("اسلاگ")} required hint={isNew ? t("در آدرس استفاده می‌شود") : t("پس از ساخت ثابت است")}>
            <Input value={f.slug} disabled={!isNew} onChange={(e) => { setSlugTouched(true); up("slug", e.target.value); }} dir="ltr" placeholder="la-prairie" />
          </Field>
        </div>
        <div className="grid sm:grid-cols-2 gap-4 mt-4">
          <Field label={t("آدرس سایت رسمی (اختیاری)")}><Input value={f.website} onChange={(e) => up("website", e.target.value)} dir="ltr" placeholder="https://…" /></Field>
          <Field label={t("ترتیب نمایش")}><Input type="number" value={f.sort_order} onChange={(e) => up("sort_order", e.target.value)} dir="ltr" /></Field>
        </div>
        <div className="grid sm:grid-cols-2 gap-4 mt-4">
          <Field label={t("یک‌خط معرفی (فارسی، اختیاری)")}><Input value={f.tagline_fa} onChange={(e) => up("tagline_fa", e.target.value)} placeholder={t("مراقبت پوست حرفه‌ای")} /></Field>
          <Field label={t("یک‌خط معرفی (انگلیسی، اختیاری)")}><Input value={f.tagline_en} onChange={(e) => up("tagline_en", e.target.value)} dir="ltr" placeholder="Professional skincare" /></Field>
        </div>
        <div className="grid sm:grid-cols-2 gap-3 mt-4">
          <div className="rounded-xl bg-canvas-soft border border-line p-3.5"><Toggle checked={f.is_active} onChange={(v) => up("is_active", v)} label={t("فعال")} /></div>
          <div className="rounded-xl bg-canvas-soft border border-line p-3.5"><Toggle checked={f.is_featured} onChange={(v) => up("is_featured", v)} label={t("ویژه")} /></div>
        </div>
        <div className="flex gap-2 mt-6">
          <button type="submit" disabled={saving || uploading} className="btn-primary size-md flex-1 disabled:opacity-60">{saving ? <Spinner /> : <Icon name="save" size={18} />}{saving ? t("در حال ذخیره…") : t("ذخیره")}</button>
          <button type="button" onClick={onClose} className="btn-ghost size-md">{t("انصراف")}</button>
        </div>
      </form>
    </div>
  );
}
