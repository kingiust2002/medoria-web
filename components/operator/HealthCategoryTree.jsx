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
import { useT, usePanelLang } from "@/components/panel/PanelI18n";
import { useCan } from "@/components/panel/Capabilities";
import { tr } from "@/lib/panel/i18n";
import { localName } from "@/lib/panel/i18n";

const LEVEL_LABELS = { 1: tr("دسته اصلی"), 2: tr("زیردسته"), 3: tr("زیرزیردسته") };
const ICON_OPTIONS = ["gloves", "mask", "stethoscope", "bandage", "thermometer", "flask", "syringe", "shieldPlus", "package", "hospital", "building", "layers", "pill"];
const nameOf = (node, lang = "fa") => localName(node, lang);
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
  const t = useT();
  const { lang } = usePanelLang();
  const router = useRouter();
  // what this person may offer on screen (the server asks again on every action)
  const canCreate = useCan("categories.create"), canEdit = useCan("categories.edit"), canArchive = useCan("categories.archive"), canDelete = useCan("categories.delete");
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
    } else notify(t(result?.error) || t("عملیات ناموفق بود."), false);
  }

  const activeCount = flat.filter(({ node }) => node.is_active !== false).length;

  return (
    <div dir="rtl">
      <PageHeader title={t("دسته‌بندی‌ها")} subtitle={t("{length} مورد در حداکثر ۳ سطح · {activeCount} فعال", { length: flat.length, activeCount })}>
        {canCreate && <button type="button" onClick={() => setModal({ mode: "create", parent: null })} className="btn-primary size-md">
          <Icon name="plus" size={17} /> {t("دسته اصلی جدید")}</button>}
      </PageHeader>

      {message && (
        <div className={`mb-4 rounded-xl px-3 py-2.5 text-sm flex items-center gap-2 ${message.ok ? "bg-ok/10 text-ok" : "bg-warn/10 text-warn"}`}>
          <Icon name={message.ok ? "check" : "alertTriangle"} size={16} /> {message.text}
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[230px] flex-1">
          <Icon name="search" size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-ink-faint" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("جستجو در نام یا اسلاگ…")} className="ps-9" />
        </div>
        <button type="button" className="btn-ghost size-md" onClick={() => setExpanded(new Set(flat.map(({ node }) => node.id)))}>{t("باز کردن همه")}</button>
        <button type="button" className="btn-ghost size-md" onClick={() => setExpanded(new Set())}>{t("بستن همه")}</button>
      </div>

      <div className="rounded-2xl border border-line bg-surface overflow-hidden">
        {rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-ink-muted">{query ? t("نتیجه‌ای پیدا نشد.") : t("هنوز دسته‌ای وجود ندارد یا مایگریشن ۲۰ اجرا نشده است.")}</div>
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
                      <span className={`${depth === 0 ? "font-bold" : "font-medium"} text-[13.5px] text-ink truncate`}>{nameOf(node, lang)}</span>
                      <span className="text-[10px] text-ink-faint shrink-0">{LEVEL_LABELS[node.level] ? t(LEVEL_LABELS[node.level]) : t("دسته")}</span>
                      {Number(count || 0) > 0 && <span className="text-[10px] rounded-full bg-line-soft text-ink-muted px-1.5 py-0.5 shrink-0">{t("{count} محصول", { count })}</span>}
                    </div>
                    <div className="text-[11px] text-ink-faint truncate" dir="ltr">{node.name_en || node.slug} · {node.slug}</div>
                  </div>

                  {busyId === node.id ? <Spinner size={16} /> : (
                    <button type="button" role="switch" aria-checked={!inactive} disabled={!canArchive} title={inactive ? t("فعال‌کردن") : t("غیرفعال‌کردن")}
                      onClick={() => run(node.id, () => setHealthCategoryFlags(node.id, { is_active: inactive }), inactive ? t("دسته فعال شد.") : t("دسته غیرفعال شد."))}
                      className={`relative h-5 w-9 rounded-full shrink-0 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${inactive ? "bg-line" : "bg-ok"}`}>
                      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${inactive ? "start-[1.125rem]" : "start-0.5"}`} />
                    </button>
                  )}

                  {canCreate && node.level < 3 && <button type="button" className="w-8 h-8 rounded-lg grid place-items-center text-brand-violet hover:bg-brand-violet/10" title={t("افزودن زیرمجموعه")} onClick={() => setModal({ mode: "create", parent: node })}><Icon name="plus" size={16} /></button>}
                  {canArchive && hasChildren && <button type="button" className="w-8 h-8 rounded-lg grid place-items-center text-ink-muted hover:bg-line" title={inactive ? t("فعال‌کردن کل شاخه") : t("غیرفعال‌کردن کل شاخه")}
                    onClick={() => run(node.id, () => setHealthCategorySubtreeActive(node.id, inactive), inactive ? t("کل شاخه فعال شد.") : t("کل شاخه غیرفعال شد."))}><Icon name={inactive ? "eye" : "eyeOff"} size={16} /></button>}
                  {canEdit && <button type="button" className="w-8 h-8 rounded-lg grid place-items-center text-ink-muted hover:bg-line" title={t("ویرایش")} onClick={() => setModal({ mode: "edit", node })}><Icon name="edit" size={16} /></button>}
                  {canDelete && <button type="button" className="w-8 h-8 rounded-lg grid place-items-center text-ink-muted hover:bg-warn/10 hover:text-warn" title={t("حذف")} onClick={() => setDeleting(node)}><Icon name="trash" size={16} /></button>}
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
  const t = useT();
  const { lang } = usePanelLang();
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
    if (!form.name_fa.trim() && !form.name_en.trim()) return setError(t("حداقل نام فارسی یا انگلیسی لازم است."));
    if (!editing && !slugify(form.slug)) return setError(t("اسلاگ لاتین معتبر وارد کنید."));
    setSaving(true);
    const payload = { ...form, parent_id: parent?.id ?? null };
    const result = editing ? await updateHealthCategory(source.id, payload) : await createHealthCategory(payload);
    setSaving(false);
    if (result?.ok) onDone(editing ? t("دسته ویرایش شد.") : t("دسته جدید ساخته شد."));
    else setError(t(result?.error) || t("ذخیره ناموفق بود."));
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-navy/45 backdrop-blur-sm" />
      <form onSubmit={submit} onClick={(event) => event.stopPropagation()} className="relative card p-6 w-full max-w-2xl max-h-[92vh] overflow-auto" dir="rtl">
        <div className="flex items-center justify-between mb-5">
          <div><h2 className="text-lg font-bold text-ink">{editing ? t("ویرایش دسته") : parent ? t("افزودن زیرمجموعه به «{nameOf}»", { nameOf: nameOf(parent, lang) }) : t("دسته اصلی جدید")}</h2><p className="text-xs text-ink-muted mt-1">{t("سطح {level}: {v}", { level, v: LEVEL_LABELS[level] })}</p></div>
          <button type="button" onClick={onClose} className="w-9 h-9 rounded-lg grid place-items-center text-ink-muted hover:bg-line-soft"><Icon name="close" size={18} /></button>
        </div>
        {error && <div className="mb-4 rounded-xl px-3 py-2.5 text-sm bg-warn/10 text-warn">{error}</div>}
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label={t("نام فارسی")} required><Input value={form.name_fa} onChange={(event) => update("name_fa", event.target.value)} /></Field>
          <Field label={t("نام انگلیسی")} required><Input dir="ltr" value={form.name_en} onChange={(event) => { update("name_en", event.target.value); if (!editing && !slugTouched) update("slug", slugify(event.target.value)); }} /></Field>
          <Field label={t("نام روسی")}><Input value={form.name_ru} onChange={(event) => update("name_ru", event.target.value)} /></Field>
          <Field label={t("نام تاجیکی")}><Input value={form.name_tg} onChange={(event) => update("name_tg", event.target.value)} /></Field>
        </div>
        <div className="grid sm:grid-cols-3 gap-4 mt-4">
          <Field label={t("اسلاگ")} required hint={editing ? t("برای حفظ لینک‌ها قابل تغییر نیست") : t("حروف لاتین و خط تیره")}><Input dir="ltr" disabled={editing} value={form.slug} onChange={(event) => { setSlugTouched(true); update("slug", event.target.value); }} /></Field>
          <Field label={t("آیکون")}><Select value={form.icon} onChange={(event) => update("icon", event.target.value)}>{ICON_OPTIONS.map((icon) => <option value={icon} key={icon}>{icon}</option>)}</Select></Field>
          <Field label={t("ترتیب نمایش")}><Input type="number" min="0" dir="ltr" value={form.sort_order} onChange={(event) => update("sort_order", event.target.value)} /></Field>
        </div>
        <div className="grid sm:grid-cols-2 gap-3 mt-5">
          <div className="rounded-xl border border-line bg-canvas-soft p-3.5"><Toggle checked={form.is_active} onChange={(value) => update("is_active", value)} label={t("فعال در سایت")} /></div>
          <div className="rounded-xl border border-line bg-canvas-soft p-3.5"><Toggle checked={form.is_featured} onChange={(value) => update("is_featured", value)} label={t("دسته ویژه")} /></div>
        </div>
        <div className="flex gap-2 mt-6">
          <button type="submit" disabled={saving} className="btn-primary size-md flex-1 disabled:opacity-60">{saving ? <Spinner size={17} /> : <Icon name="check" size={17} />}{saving ? t("در حال ذخیره…") : t("ذخیره")}</button>
          <button type="button" onClick={onClose} className="btn-ghost size-md">{t("انصراف")}</button>
        </div>
      </form>
    </div>
  );
}

function DeleteModal({ node, leaves, onClose, onDone }) {
  const t = useT();
  const { lang } = usePanelLang();
  const hasChildren = Boolean(node.children?.length);
  const count = Number(node.product_count || 0);
  const targets = leaves.filter((item) => item.id !== node.id);
  const [targetId, setTargetId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    if (hasChildren) return;
    if (count > 0 && !targetId) return setError(t("دسته مقصد محصولات را انتخاب کنید."));
    setBusy(true);
    const result = await deleteHealthCategorySafe(node.id, targetId || undefined);
    setBusy(false);
    if (result?.ok && result.pending) onDone(t(result.message));            // sent for approval: the category is still there
    else if (result?.ok) onDone(result.moved ? t("دسته حذف شد و {moved} محصول منتقل شد.", { moved: result.moved }) : t("دسته حذف شد."));
    else setError(t(result?.error) || t("حذف ناموفق بود."));
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-navy/45 backdrop-blur-sm" />
      <div onClick={(event) => event.stopPropagation()} className="relative card p-6 w-full max-w-md" dir="rtl">
        <div className="flex items-center justify-between mb-4"><h2 className="text-lg font-bold text-ink">{t("حذف «{nameOf}»", { nameOf: nameOf(node, lang) })}</h2><button type="button" onClick={onClose} className="w-9 h-9 rounded-lg grid place-items-center text-ink-muted hover:bg-line-soft"><Icon name="close" size={18} /></button></div>
        {error && <div className="mb-4 rounded-xl px-3 py-2.5 text-sm bg-warn/10 text-warn">{error}</div>}
        {hasChildren ? <p className="text-sm leading-7 text-ink-soft">{t("این دسته زیرمجموعه دارد. ابتدا زیرمجموعه‌ها را جابه‌جا یا حذف کنید.")}</p> : count > 0 ? <><p className="text-sm leading-7 text-ink-soft mb-4">{t("این دسته {count} محصول دارد. محصولات قبل از حذف منتقل می‌شوند.", { count })}</p><Field label={t("دسته مقصد")} required><Select value={targetId} onChange={(event) => setTargetId(event.target.value)}><option value="">{t("— انتخاب دسته مقصد —")}</option>{targets.map((target) => <option value={target.id} key={target.id}>{nameOf(target, lang)}</option>)}</Select></Field></> : <p className="text-sm leading-7 text-ink-soft">{t("این دسته محصول و زیرمجموعه‌ای ندارد و می‌تواند حذف شود.")}</p>}
        <div className="flex gap-2 mt-6"><button type="button" onClick={remove} disabled={busy || hasChildren || (count > 0 && !targetId)} className="btn-primary size-md flex-1 !bg-warn hover:!bg-warn/90 disabled:opacity-50">{busy ? <Spinner size={17} /> : <Icon name="trash" size={17} />}{busy ? t("در حال حذف…") : t("حذف")}</button><button type="button" onClick={onClose} className="btn-ghost size-md">{t("انصراف")}</button></div>
      </div>
    </div>
  );
}
