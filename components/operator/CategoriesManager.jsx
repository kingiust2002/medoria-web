"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/shared/Icon";
import { imageUrl } from "@/lib/supabase";
import { createCategory, updateCategory } from "@/lib/operator/actions";
import { slugify } from "@/lib/operator/validation";
import { PageHeader, Field, Input, Textarea, Select, Toggle, Badge, EmptyState, Spinner } from "@/components/operator/ui";

const ICON_OPTIONS = ["gloves", "mask", "stethoscope", "bandage", "thermometer", "flask", "syringe", "microscope", "pill", "shield", "package", "layers"];

export default function CategoriesManager({ categories }) {
  const router = useRouter();
  const [editing, setEditing] = useState(null); // null | {} (new) | category
  const [msg, setMsg] = useState(null);

  return (
    <>
      <PageHeader title="دسته‌بندی‌ها" subtitle={`${categories.length} دسته`}>
        <button onClick={() => setEditing({})} className="btn-primary size-md"><Icon name="plus" size={18} /> افزودن دسته</button>
      </PageHeader>

      {msg && (
        <div className={`mb-4 text-sm rounded-xl px-3 py-2.5 flex items-center gap-2 ${msg.ok ? "bg-ok/10 text-ok" : "bg-warn/10 text-warn"}`}>
          <Icon name={msg.ok ? "check" : "alertTriangle"} size={16} /> {msg.text}
        </div>
      )}

      {categories.length === 0 ? (
        <EmptyState icon="layers" title="دسته‌ای وجود ندارد" desc="اولین دسته را اضافه کنید.">
          <button onClick={() => setEditing({})} className="btn-primary size-sm"><Icon name="plus" size={16} /> افزودن دسته</button>
        </EmptyState>
      ) : (
        <div className="card divide-y divide-line overflow-hidden">
          {categories.map((c) => {
            const active = c.is_active !== false;
            return (
              <div key={c.id ?? c.slug} className="px-3 sm:px-4 py-3 flex items-center gap-3 hover:bg-line-soft/40 transition-colors">
                <span className="grid place-items-center w-11 h-11 rounded-xl bg-brand-violet/10 text-brand-violet shrink-0 overflow-hidden">
                  {c.image_url ? <img src={imageUrl(c.image_url)} alt="" className="w-full h-full object-cover" /> : <Icon name={c.icon || "layers"} size={18} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink truncate">{c.name_fa || c.name_en || c.slug}</p>
                  <p className="text-xs text-ink-muted truncate mt-0.5"><span dir="ltr">{c.slug}</span> · {c.product_count ?? 0} محصول · ترتیب {c.sort_order ?? 0}</p>
                </div>
                {c.is_featured && <Badge tone="violet" className="hidden sm:inline-flex">ویژه</Badge>}
                <Badge tone={active ? "ok" : "muted"} className="hidden sm:inline-flex">{active ? "فعال" : "غیرفعال"}</Badge>
                <button onClick={() => setEditing(c)} className="grid place-items-center w-9 h-9 rounded-lg text-ink-muted hover:bg-brand-violet/10 hover:text-brand-violet transition-colors shrink-0" title="ویرایش"><Icon name="edit" size={16} /></button>
              </div>
            );
          })}
        </div>
      )}

      {editing !== null && (
        <CategoryModal
          category={editing}
          onClose={() => setEditing(null)}
          onSaved={(ok) => { setEditing(null); setMsg({ text: "دسته ذخیره شد.", ok: true }); setTimeout(() => setMsg(null), 3000); router.refresh(); }}
        />
      )}
    </>
  );
}

function CategoryModal({ category, onClose, onSaved }) {
  const isNew = !category.id;
  const [f, setF] = useState({
    slug: category.slug || "", name_fa: category.name_fa || "", name_en: category.name_en || "",
    description_fa: category.description_fa || "", icon: category.icon || "", image_url: category.image_url || "",
    sort_order: category.sort_order != null ? String(category.sort_order) : "0",
    is_active: category.is_active !== false, is_featured: !!category.is_featured,
  });
  const [slugTouched, setSlugTouched] = useState(!!category.slug);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const up = (k, v) => setF((s) => ({ ...s, [k]: v }));

  async function save(e) {
    e.preventDefault();
    setErr("");
    if (!f.name_fa.trim() && !f.name_en.trim()) { setErr("حداقل نام فارسی یا انگلیسی لازم است."); return; }
    if (isNew && !slugify(f.slug)) { setErr("اسلاگ معتبر (لاتین) وارد کنید."); return; }
    setSaving(true);
    const res = isNew ? await createCategory(f) : await updateCategory(category.id, f);
    setSaving(false);
    if (res.ok) onSaved(true); else setErr(res.error || "ذخیره ناموفق بود.");
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-navy/40 backdrop-blur-sm" />
      <form onSubmit={save} onClick={(e) => e.stopPropagation()} dir="rtl" className="relative card p-6 w-full max-w-lg max-h-[90vh] overflow-auto animate-fade-in">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-bold text-lg text-ink">{isNew ? "افزودن دسته" : "ویرایش دسته"}</h2>
          <button type="button" onClick={onClose} className="grid place-items-center w-9 h-9 rounded-lg hover:bg-line-soft text-ink-muted"><Icon name="close" size={18} /></button>
        </div>
        {err && <div className="mb-4 text-sm rounded-xl px-3 py-2.5 flex items-center gap-2 bg-warn/10 text-warn"><Icon name="alertTriangle" size={16} /> {err}</div>}
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="نام (فارسی)" required><Input value={f.name_fa} onChange={(e) => up("name_fa", e.target.value)} placeholder="دستکش" /></Field>
          <Field label="نام (انگلیسی)"><Input value={f.name_en} onChange={(e) => { up("name_en", e.target.value); if (isNew && !slugTouched) up("slug", slugify(e.target.value)); }} dir="ltr" placeholder="Gloves" /></Field>
        </div>
        <div className="grid sm:grid-cols-2 gap-4 mt-4">
          <Field label="اسلاگ" required hint={isNew ? "حروف لاتین، در آدرس استفاده می‌شود" : "اسلاگ پس از ساخت تغییر نمی‌کند"}>
            <Input value={f.slug} disabled={!isNew} onChange={(e) => { setSlugTouched(true); up("slug", e.target.value); }} dir="ltr" placeholder="gloves" />
          </Field>
          <Field label="ترتیب نمایش"><Input type="number" value={f.sort_order} onChange={(e) => up("sort_order", e.target.value)} dir="ltr" /></Field>
        </div>
        <div className="grid sm:grid-cols-2 gap-4 mt-4">
          <Field label="آیکون"><Select value={f.icon} onChange={(e) => up("icon", e.target.value)}><option value="">— بدون آیکون —</option>{ICON_OPTIONS.map((i) => <option key={i} value={i}>{i}</option>)}</Select></Field>
          <Field label="آدرس تصویر (اختیاری)"><Input value={f.image_url} onChange={(e) => up("image_url", e.target.value)} dir="ltr" placeholder="https://…" /></Field>
        </div>
        <div className="mt-4"><Field label="توضیحات (فارسی)"><Textarea value={f.description_fa} onChange={(e) => up("description_fa", e.target.value)} rows={2} /></Field></div>
        <div className="grid sm:grid-cols-2 gap-3 mt-4">
          <div className="rounded-xl bg-canvas-soft border border-line p-3.5"><Toggle checked={f.is_active} onChange={(v) => up("is_active", v)} label="فعال" /></div>
          <div className="rounded-xl bg-canvas-soft border border-line p-3.5"><Toggle checked={f.is_featured} onChange={(v) => up("is_featured", v)} label="ویژه در صفحه اصلی" /></div>
        </div>
        <div className="flex gap-2 mt-6">
          <button type="submit" disabled={saving} className="btn-primary size-md flex-1 disabled:opacity-60">{saving ? <Spinner /> : <Icon name="save" size={18} />}{saving ? "در حال ذخیره…" : "ذخیره"}</button>
          <button type="button" onClick={onClose} className="btn-ghost size-md">انصراف</button>
        </div>
      </form>
    </div>
  );
}
