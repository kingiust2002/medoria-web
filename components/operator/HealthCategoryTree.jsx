"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/shared/Icon";
import { Field, Input, PageHeader, Select, Spinner, Toggle } from "@/components/operator/ui";
import { slugify } from "@/lib/operator/validation";
import {
  createHealthCategory,
  deleteHealthCategorySafe,
  setHealthCategoryFlags,
  setHealthCategorySubtreeActive,
  updateHealthCategory,
} from "@/lib/operator/categoryTreeActions";

const LEVEL_LABELS = { 1: "دسته اصلی", 2: "زیردسته", 3: "زیرزیردسته" };
const ICON_OPTIONS = ["gloves", "mask", "stethoscope", "bandage", "thermometer", "flask", "syringe", "shieldPlus", "package", "hospital", "building", "layers", "pill"];
const nameOf = (node) => node.name_fa || node.name_en || node.name_tg || node.name_ru || node.slug;
const norm = (value) => String(value || "").trim().toLowerCase();

function flatten(tree) {
  const out = [];
  const walk = (nodes, depth = 0, ancestors = []) => {
    for (const node of nodes || []) {
      out.push({ node, depth, ancestors });
      walk(node.children || [], depth + 1, [...ancestors, node]);
    }
  };
  walk(tree);
  return out;
}

export default function HealthCategoryTree({ tree }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(() => new Set());
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [modal, setModal] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [message, setMessage] = useState(null);

  const flat = useMemo(() => flatten(tree), [tree]);
  const leaves = useMemo(() => flat.filter(({ node }) => !node.children?.length).map(({ node }) => node), [flat]);
  const matches = useMemo(() => {
    const needle = norm(query);
    if (!needle) return null;
    const ids = new Set();
    for (const { node, ancestors } of flat) {
      const hit = [node.slug, node.name_fa, node.name_en, node.name_ru, node.name_tg].some((value) => norm(value).includes(needle));
      if (hit) {
        ids.add(node.id);
        ancestors.forEach((ancestor) => ids.add(ancestor.id));
      }
    }
    return ids;
  }, [flat, query]);

  const rows = useMemo(() => {
    const out = [];
    const walk = (nodes, depth = 0) => {
      for (const node of nodes || []) {
        if (matches && !matches.has(node.id)) continue;
        out.push({ node, depth });
        if (node.children?.length && (matches || expanded.has(node.id))) walk(node.children, depth + 1);
      }
    };
    walk(tree);
    return out;
  }, [tree, expanded, matches]);

  const notify = (text, ok = true) => {
    setMessage({ text, ok });
    window.setTimeout(() => setMessage(null), 4500);
  };

  async function run(id, action, successText) {
    setBusyId(id);
    const result = await action();
    setBusyId(null);
    if (result?.ok) {
      notify(successText, true);
      router.refresh();
    } else notify(result?.error || "عملیات ناموفق بود.", false);
  }

  const activeCount = flat.filter(({ node }) => node.is_active !== false).length;

  return (
    <div dir="rtl">
      <PageHeader title="دسته‌بندی‌ها" subtitle={`${flat.length} مورد در حداکثر ۳ سطح · ${activeCount} فعال`}>
        <button type="button" onClick={() => setModal({ mode: "create", parent: null })} className="btn-primary size-md">
          <Icon name="plus" size={17} /> دسته اصلی جدید
        </button>
      </PageHeader>

      {message && (
        <div className={`mb-4 rounded-xl px-3 py-2.5 text-sm flex items-center gap-2 ${message.ok ? "bg-ok/10 text-ok" : "bg-warn/10 text-warn"}`}>
          <Icon name={message.ok ? "check" : "alertTriangle"} size={16} /> {message.text}
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[230px] flex-1">
          <Icon name="search" size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-ink-faint" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="جستجو در نام یا اسلاگ…" className="ps-9" />
        </div>
        <button type="button" className="btn-ghost size-md" onClick={() => setExpanded(new Set(flat.map(({ node }) => node.id)))}>باز کردن همه</button>
        <button type="button" className="btn-ghost size-md" onClick={() => setExpanded(new Set())}>بستن همه</button>
      </div>

      <div className="rounded-2xl border border-line bg-surface overflow-hidden">
        {rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-ink-muted">{query ? "نتیجه‌ای پیدا نشد." : "هنوز دسته‌ای وجود ندارد یا مایگریشن ۲۰ اجرا نشده است."}</div>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map(({ node, depth }) => {
              const hasChildren = Boolean(node.children?.length);
              const isOpen = Boolean(matches) || expanded.has(node.id);
              const inactive = node.is_active === false;
              const count = hasChildren ? node.total_count : node.product_count;
              return (
                <li key={node.id} className={`flex items-center gap-2 px-3 py-2.5 hover:bg-line-soft/40 ${inactive ? "opacity-50" : ""}`}>
                  <span className="shrink-0" style={{ width: depth * 22 }} />
                  {hasChildren ? (
                    <button type="button" className="w-7 h-7 grid place-items-center rounded-lg text-ink-muted hover:bg-line" onClick={() => setExpanded((current) => {
                      const next = new Set(current);
                      next.has(node.id) ? next.delete(node.id) : next.add(node.id);
                      return next;
                    })}>
                      <Icon name="chevronDown" size={15} className={`transition-transform ${isOpen ? "" : "-rotate-90"}`} />
                    </button>
                  ) : <span className="w-7" />}

                  <span className={`w-8 h-8 rounded-lg grid place-items-center shrink-0 ${depth === 0 ? "bg-brand-violet/10 text-brand-violet" : "bg-line-soft text-ink-muted"}`}>
                    <Icon name={node.icon || (depth === 0 ? "layers" : "package")} size={16} />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`${depth === 0 ? "font-bold" : "font-medium"} text-[13.5px] text-ink truncate`}>{nameOf(node)}</span>
                      <span className="text-[10px] text-ink-faint shrink-0">{LEVEL_LABELS[node.level] || "دسته"}</span>
                      {Number(count || 0) > 0 && <span className="text-[10px] rounded-full bg-line-soft text-ink-muted px-1.5 py-0.5 shrink-0">{count} محصول</span>}
                    </div>
                    <div className="text-[11px] text-ink-faint truncate" dir="ltr">{node.name_en || node.slug} · {node.slug}</div>
                  </div>

                  {busyId === node.id ? <Spinner size={16} /> : (
                    <button type="button" role="switch" aria-checked={!inactive} title={inactive ? "فعال‌کردن" : "غیرفعال‌کردن"}
                      onClick={() => run(node.id, () => setHealthCategoryFlags(node.id, { is_active: inactive }), inactive ? "دسته فعال شد." : "دسته غیرفعال شد.")}
                      className={`relative h-5 w-9 rounded-full shrink-0 transition-colors ${inactive ? "bg-line" : "bg-ok"}`}>
                      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${inactive ? "right-[1.125rem]" : "right-0.5"}`} />
                    </button>
                  )}

                  {node.level < 3 && <button type="button" className="w-8 h-8 rounded-lg grid place-items-center text-brand-violet hover:bg-brand-violet/10" title="افزودن زیرمجموعه" onClick={() => setModal({ mode: "create", parent: node })}><Icon name="plus" size={16} /></button>}
                  {hasChildren && <button type="button" className="w-8 h-8 rounded-lg grid place-items-center text-ink-muted hover:bg-line" title={inactive ? "فعال‌کردن کل شاخه" : "غیرفعال‌کردن کل شاخه"}
                    onClick={() => run(node.id, () => setHealthCategorySubtreeActive(node.id, inactive), inactive ? "کل شاخه فعال شد." : "کل شاخه غیرفعال شد.")}><Icon name={inactive ? "eye" : "eyeOff"} size={16} /></button>}
                  <button type="button" className="w-8 h-8 rounded-lg grid place-items-center text-ink-muted hover:bg-line" title="ویرایش" onClick={() => setModal({ mode: "edit", node })}><Icon name="edit" size={16} /></button>
                  <button type="button" className="w-8 h-8 rounded-lg grid place-items-center text-ink-muted hover:bg-warn/10 hover:text-warn" title="حذف" onClick={() => setDeleting(node)}><Icon name="trash" size={16} /></button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {modal && <CategoryModal modal={modal} onClose={() => setModal(null)} onDone={(text) => { setModal(null); notify(text); router.refresh(); }} />}
      {deleting && <DeleteModal node={deleting} leaves={leaves} onClose={() => setDeleting(null)} onDone={(text) => { setDeleting(null); notify(text); router.refresh(); }} />}
    </div>
  );
}

function CategoryModal({ modal, onClose, onDone }) {
  const editing = modal.mode === "edit";
  const source = editing ? modal.node : null;
  const parent = modal.parent || null;
  const level = editing ? Number(source.level || 1) : parent ? Number(parent.level || 1) + 1 : 1;
  const [form, setForm] = useState({
    slug: source?.slug || "", name_fa: source?.name_fa || "", name_en: source?.name_en || "",
    name_ru: source?.name_ru || "", name_tg: source?.name_tg || "",
    icon: source?.icon || parent?.icon || "package",
    sort_order: String(source?.sort_order ?? ((parent?.children?.length || 0) + 1) * 10),
    is_active: source?.is_active !== false, is_featured: Boolean(source?.is_featured),
  });
  const [slugTouched, setSlugTouched] = useState(Boolean(source?.slug));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  async function submit(event) {
    event.preventDefault();
    setError("");
    if (!form.name_fa.trim() && !form.name_en.trim()) return setError("حداقل نام فارسی یا انگلیسی لازم است.");
    if (!editing && !slugify(form.slug)) return setError("اسلاگ لاتین معتبر وارد کنید.");
    setSaving(true);
    const payload = { ...form, parent_id: parent?.id ?? null };
    const result = editing ? await updateHealthCategory(source.id, payload) : await createHealthCategory(payload);
    setSaving(false);
    if (result?.ok) onDone(editing ? "دسته ویرایش شد." : "دسته جدید ساخته شد.");
    else setError(result?.error || "ذخیره ناموفق بود.");
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-navy/45 backdrop-blur-sm" />
      <form onSubmit={submit} onClick={(event) => event.stopPropagation()} className="relative card p-6 w-full max-w-2xl max-h-[92vh] overflow-auto" dir="rtl">
        <div className="flex items-center justify-between mb-5">
          <div><h2 className="text-lg font-bold text-ink">{editing ? "ویرایش دسته" : parent ? `افزودن زیرمجموعه به «${nameOf(parent)}»` : "دسته اصلی جدید"}</h2><p className="text-xs text-ink-muted mt-1">سطح {level}: {LEVEL_LABELS[level]}</p></div>
          <button type="button" onClick={onClose} className="w-9 h-9 rounded-lg grid place-items-center text-ink-muted hover:bg-line-soft"><Icon name="close" size={18} /></button>
        </div>
        {error && <div className="mb-4 rounded-xl px-3 py-2.5 text-sm bg-warn/10 text-warn">{error}</div>}
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="نام فارسی" required><Input value={form.name_fa} onChange={(event) => update("name_fa", event.target.value)} /></Field>
          <Field label="نام انگلیسی" required><Input dir="ltr" value={form.name_en} onChange={(event) => { update("name_en", event.target.value); if (!editing && !slugTouched) update("slug", slugify(event.target.value)); }} /></Field>
          <Field label="نام روسی"><Input value={form.name_ru} onChange={(event) => update("name_ru", event.target.value)} /></Field>
          <Field label="نام تاجیکی"><Input value={form.name_tg} onChange={(event) => update("name_tg", event.target.value)} /></Field>
        </div>
        <div className="grid sm:grid-cols-3 gap-4 mt-4">
          <Field label="اسلاگ" required hint={editing ? "برای حفظ لینک‌ها قابل تغییر نیست" : "حروف لاتین و خط تیره"}><Input dir="ltr" disabled={editing} value={form.slug} onChange={(event) => { setSlugTouched(true); update("slug", event.target.value); }} /></Field>
          <Field label="آیکون"><Select value={form.icon} onChange={(event) => update("icon", event.target.value)}>{ICON_OPTIONS.map((icon) => <option value={icon} key={icon}>{icon}</option>)}</Select></Field>
          <Field label="ترتیب نمایش"><Input type="number" min="0" dir="ltr" value={form.sort_order} onChange={(event) => update("sort_order", event.target.value)} /></Field>
        </div>
        <div className="grid sm:grid-cols-2 gap-3 mt-5">
          <div className="rounded-xl border border-line bg-canvas-soft p-3.5"><Toggle checked={form.is_active} onChange={(value) => update("is_active", value)} label="فعال در سایت" /></div>
          <div className="rounded-xl border border-line bg-canvas-soft p-3.5"><Toggle checked={form.is_featured} onChange={(value) => update("is_featured", value)} label="دسته ویژه" /></div>
        </div>
        <div className="flex gap-2 mt-6">
          <button type="submit" disabled={saving} className="btn-primary size-md flex-1 disabled:opacity-60">{saving ? <Spinner size={17} /> : <Icon name="check" size={17} />}{saving ? "در حال ذخیره…" : "ذخیره"}</button>
          <button type="button" onClick={onClose} className="btn-ghost size-md">انصراف</button>
        </div>
      </form>
    </div>
  );
}

function DeleteModal({ node, leaves, onClose, onDone }) {
  const hasChildren = Boolean(node.children?.length);
  const count = Number(node.product_count || 0);
  const targets = leaves.filter((item) => item.id !== node.id);
  const [targetId, setTargetId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    if (hasChildren) return;
    if (count > 0 && !targetId) return setError("دسته مقصد محصولات را انتخاب کنید.");
    setBusy(true);
    const result = await deleteHealthCategorySafe(node.id, targetId || undefined);
    setBusy(false);
    if (result?.ok) onDone(result.moved ? `دسته حذف شد و ${result.moved} محصول منتقل شد.` : "دسته حذف شد.");
    else setError(result?.error || "حذف ناموفق بود.");
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-navy/45 backdrop-blur-sm" />
      <div onClick={(event) => event.stopPropagation()} className="relative card p-6 w-full max-w-md" dir="rtl">
        <div className="flex items-center justify-between mb-4"><h2 className="text-lg font-bold text-ink">حذف «{nameOf(node)}»</h2><button type="button" onClick={onClose} className="w-9 h-9 rounded-lg grid place-items-center text-ink-muted hover:bg-line-soft"><Icon name="close" size={18} /></button></div>
        {error && <div className="mb-4 rounded-xl px-3 py-2.5 text-sm bg-warn/10 text-warn">{error}</div>}
        {hasChildren ? <p className="text-sm leading-7 text-ink-soft">این دسته زیرمجموعه دارد. ابتدا زیرمجموعه‌ها را جابه‌جا یا حذف کنید.</p> : count > 0 ? <><p className="text-sm leading-7 text-ink-soft mb-4">این دسته {count} محصول دارد. محصولات قبل از حذف منتقل می‌شوند.</p><Field label="دسته مقصد" required><Select value={targetId} onChange={(event) => setTargetId(event.target.value)}><option value="">— انتخاب دسته مقصد —</option>{targets.map((target) => <option value={target.id} key={target.id}>{nameOf(target)}</option>)}</Select></Field></> : <p className="text-sm leading-7 text-ink-soft">این دسته محصول و زیرمجموعه‌ای ندارد و می‌تواند حذف شود.</p>}
        <div className="flex gap-2 mt-6"><button type="button" onClick={remove} disabled={busy || hasChildren || (count > 0 && !targetId)} className="btn-primary size-md flex-1 !bg-warn hover:!bg-warn/90 disabled:opacity-50">{busy ? <Spinner size={17} /> : <Icon name="trash" size={17} />}{busy ? "در حال حذف…" : "حذف"}</button><button type="button" onClick={onClose} className="btn-ghost size-md">انصراف</button></div>
      </div>
    </div>
  );
}
