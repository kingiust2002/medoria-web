"use client";
// components/operator/QuickCategoryModal.jsx — minimal "new category" dialog
// usable inline from the product form / bulk grid without leaving the page.
// Full editing (icon, image, descriptions) stays in /operator/categories.
import { useState } from "react";
import Icon from "@/components/shared/Icon";
import { createCategory } from "@/lib/operator/actions";
import { slugify } from "@/lib/operator/validation";
import { Field, Input, Spinner } from "@/components/operator/ui";

export default function QuickCategoryModal({ onClose, onCreated }) {
  const [f, setF] = useState({ name_fa: "", name_en: "", slug: "" });
  const [slugTouched, setSlugTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const up = (k, v) => setF((s) => ({ ...s, [k]: v }));

  async function save(e) {
    e.preventDefault();
    e.stopPropagation();
    setErr("");
    if (!f.name_fa.trim() && !f.name_en.trim()) { setErr("حداقل نام فارسی یا انگلیسی لازم است."); return; }
    const slug = slugify(f.slug || f.name_en);
    if (!slug) { setErr("اسلاگ معتبر (حروف لاتین) وارد کنید."); return; }
    setSaving(true);
    const res = await createCategory({ ...f, slug });
    setSaving(false);
    if (!res.ok) { setErr(res.error || "ذخیره ناموفق بود."); return; }
    onCreated({ id: res.id, slug: res.slug || slug, name_fa: f.name_fa || null, name_en: f.name_en || null });
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-navy/40 backdrop-blur-sm" />
      <div onClick={(e) => e.stopPropagation()} dir="rtl" className="relative card p-6 w-full max-w-md animate-fade-in">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-bold text-lg text-ink">دسته جدید</h2>
          <button type="button" onClick={onClose} className="grid place-items-center w-9 h-9 rounded-lg hover:bg-line-soft text-ink-muted"><Icon name="close" size={18} /></button>
        </div>
        {err && <div className="mb-4 text-sm rounded-xl px-3 py-2.5 flex items-center gap-2 bg-warn/10 text-warn"><Icon name="alertTriangle" size={16} /> {err}</div>}
        <div className="grid gap-4">
          <Field label="نام (فارسی)" required><Input value={f.name_fa} onChange={(e) => up("name_fa", e.target.value)} placeholder="سرنگ" /></Field>
          <Field label="نام (انگلیسی)"><Input value={f.name_en} onChange={(e) => { up("name_en", e.target.value); if (!slugTouched) up("slug", slugify(e.target.value)); }} dir="ltr" placeholder="Syringes" /></Field>
          <Field label="اسلاگ" required hint="حروف لاتین — در آدرس صفحه دسته">
            <Input value={f.slug} onChange={(e) => { setSlugTouched(true); up("slug", e.target.value); }} dir="ltr" placeholder="syringes" />
          </Field>
        </div>
        <div className="flex gap-2 mt-6">
          <button type="button" onClick={save} disabled={saving} className="btn-primary size-md flex-1 disabled:opacity-60">
            {saving ? <Spinner /> : <Icon name="plus" size={18} />}{saving ? "در حال ذخیره…" : "ساخت دسته"}
          </button>
          <button type="button" onClick={onClose} className="btn-ghost size-md">انصراف</button>
        </div>
        <p className="text-[11px] text-ink-faint mt-3 leading-relaxed">آیکون، تصویر و توضیحات را بعداً از صفحه «دسته‌بندی‌ها» تکمیل کنید.</p>
      </div>
    </div>
  );
}
