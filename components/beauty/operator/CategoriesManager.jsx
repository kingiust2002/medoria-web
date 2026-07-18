"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/shared/Icon";
import { beautyImageUrl as imageUrl } from "@/lib/beauty/catalog";
import { createCategory, updateCategory, deleteCategorySafe } from "@/lib/beauty/operator/actions";
import { slugify } from "@/lib/operator/validation";
import { BEAUTY_WORLDS, WORLD_FA } from "@/lib/beauty/operator/constants";
import { PageHeader, Field, Input, Textarea, Select, Toggle, Badge, EmptyState, Spinner } from "@/components/operator/ui";

const ICON_OPTIONS = ["sparkles", "star", "heart", "droplet", "sun", "eye", "wind", "flask", "edit", "settings", "award", "tag", "package", "layers"];

export default function CategoriesManager({ categories }) {
  const router = useRouter();
  const [editing, setEditing] = useState(null);   // null | {} (new) | category
  const [deleting, setDeleting] = useState(null); // null | category
  const [msg, setMsg] = useState(null);

  const flash = (text, ok) => { setMsg({ text, ok }); setTimeout(() => setMsg(null), 4000); };

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
                <Badge tone={c.world ? "info" : "neutral"} className="hidden md:inline-flex">{c.world ? WORLD_FA[c.world] || c.world : "بدون دنیا"}</Badge>
                {c.is_featured && <Badge tone="violet" className="hidden sm:inline-flex">ویژه</Badge>}
                <Badge tone={active ? "ok" : "muted"} className="hidden sm:inline-flex">{active ? "فعال" : "غیرفعال"}</Badge>
                <button onClick={() => setEditing(c)} className="grid place-items-center w-9 h-9 rounded-lg text-ink-muted hover:bg-brand-violet/10 hover:text-brand-violet transition-colors shrink-0" title="ویرایش"><Icon name="edit" size={16} /></button>
                <button onClick={() => setDeleting(c)} className="grid place-items-center w-9 h-9 rounded-lg text-ink-muted hover:bg-warn/10 hover:text-warn transition-colors shrink-0" title="حذف / ادغام"><Icon name="trash" size={16} /></button>
              </div>
            );
          })}
        </div>
      )}

      {editing !== null && (
        <CategoryModal
          category={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); flash("دسته ذخیره شد.", true); router.refresh(); }}
        />
      )}

      {deleting !== null && (
        <DeleteCategoryModal
          category={deleting}
          categories={categories}
          onClose={() => setDeleting(null)}
          onDone={(moved) => {
            setDeleting(null);
            flash(moved > 0 ? `دسته حذف شد و ${moved} محصول منتقل شد.` : "دسته حذف شد.", true);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

// Safe delete: a category with products cannot be removed until its products
// are moved to another category (both category_id and the legacy slug field
// are updated server-side). Products are never deleted.
function DeleteCategoryModal({ category, categories, onClose, onDone }) {
  const count = category.product_count ?? 0;
  const others = categories.filter((c) => c.id !== category.id);
  const [moveTo, setMoveTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function run() {
    setErr("");
    if (count > 0 && !moveTo) { setErr("اول دسته مقصد برای انتقال محصولات را انتخاب کنید."); return; }
    setBusy(true);
    const res = await deleteCategorySafe(category.id, count > 0 ? moveTo : undefined);
    setBusy(false);
    if (res.ok) onDone(res.moved || 0);
    else setErr(res.error || "حذف ناموفق بود.");
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-navy/40 backdrop-blur-sm" />
      <div onClick={(e) => e.stopPropagation()} dir="rtl" className="relative card p-6 w-full max-w-md animate-fade-in">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-lg text-ink">حذف دسته «{category.name_fa || category.name_en || category.slug}»</h2>
          <button type="button" onClick={onClose} className="grid place-items-center w-9 h-9 rounded-lg hover:bg-line-soft text-ink-muted"><Icon name="close" size={18} /></button>
        </div>
        {err && <div className="mb-4 text-sm rounded-xl px-3 py-2.5 flex items-center gap-2 bg-warn/10 text-warn"><Icon name="alertTriangle" size={16} /> {err}</div>}
        {count > 0 ? (
          <>
            <p className="text-sm text-ink-soft leading-relaxed mb-4">
              این دسته <b>{count} محصول</b> دارد. برای حذف، اول محصول‌ها به دسته دیگری منتقل می‌شوند — هیچ محصولی حذف نمی‌شود.
            </p>
            <Field label="انتقال محصولات به" required>
              <Select value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
                <option value="">— انتخاب دسته مقصد —</option>
                {others.map((c) => <option key={c.id} value={String(c.id)}>{c.name_fa || c.name_en || c.slug}</option>)}
              </Select>
            </Field>
            <p className="text-[11px] text-ink-faint mt-2 leading-relaxed">اگر فقط می‌خواهید دسته از سایت پنهان شود، به‌جای حذف از «ویرایش → فعال» استفاده کنید.</p>
          </>
        ) : (
          <p className="text-sm text-ink-soft leading-relaxed mb-2">این دسته محصولی ندارد و می‌تواند حذف شود.</p>
        )}
        <div className="flex gap-2 mt-5">
          <button type="button" onClick={run} disabled={busy || (count > 0 && !moveTo)} className="btn-primary size-md flex-1 disabled:opacity-60 !bg-warn hover:!bg-warn/90">
            {busy ? <Spinner /> : <Icon name="trash" size={17} />}
            {busy ? "در حال انجام…" : count > 0 ? "انتقال و حذف" : "حذف دسته"}
          </button>
          <button type="button" onClick={onClose} className="btn-ghost size-md">انصراف</button>
        </div>
      </div>
    </div>
  );
}

function CategoryModal({ category, onClose, onSaved }) {
  const isNew = !category.id;
  const [f, setF] = useState({
    slug: category.slug || "", world: category.world || "",
    name_fa: category.name_fa || "", name_en: category.name_en || "",
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
          <Field label="نام (فارسی)" required><Input value={f.name_fa} onChange={(e) => up("name_fa", e.target.value)} placeholder="سرم صورت" /></Field>
          <Field label="نام (انگلیسی)"><Input value={f.name_en} onChange={(e) => { up("name_en", e.target.value); if (isNew && !slugTouched) up("slug", slugify(e.target.value)); }} dir="ltr" placeholder="Serums" /></Field>
        </div>
        <div className="grid sm:grid-cols-2 gap-4 mt-4">
          <Field label="اسلاگ" required hint={isNew ? "حروف لاتین، در آدرس استفاده می‌شود" : "اسلاگ پس از ساخت تغییر نمی‌کند"}>
            <Input value={f.slug} disabled={!isNew} onChange={(e) => { setSlugTouched(true); up("slug", e.target.value); }} dir="ltr" placeholder="lip-makeup" />
          </Field>
          <Field label="ترتیب نمایش"><Input type="number" value={f.sort_order} onChange={(e) => up("sort_order", e.target.value)} dir="ltr" /></Field>
        </div>
        <div className="mt-4">
          <Field label="دنیا" hint="دسته زیر کدام دنیای Beauty نمایش داده شود (فیلتر کاتالوگ و صفحه دنیاها)">
            <Select value={f.world} onChange={(e) => up("world", e.target.value)}>
              <option value="">— بدون دنیا —</option>
              {BEAUTY_WORLDS.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}
            </Select>
          </Field>
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
