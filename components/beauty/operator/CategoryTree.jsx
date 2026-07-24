"use client";
// components/beauty/operator/CategoryTree.jsx
// The Beauty category TREE editor (migration 12). Expand/collapse every branch,
// show/hide a single node or a whole branch, add a child under any node, edit
// names in all four locales, and delete safely. Server actions do the writes;
// after each we router.refresh() so the tree reflects the DB.
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/shared/Icon";
import { PageHeader, Input, Field, Toggle, Spinner } from "@/components/operator/ui";
import {
  setCategoryFlags, setCategorySubtreeActive,
  createCategory, updateCategory, deleteCategorySafe,
} from "@/lib/beauty/operator/actions";

const LEVEL_LABEL = { 1: "دپارتمان", 2: "گروه", 3: "زیرگروه" };
const nameOf = (c) => c.name_fa || c.name_en || c.name_tg || c.name_ru || c.slug;
const norm = (s) => String(s || "").trim().toLowerCase();

// flatten to [{node, depth, rootSlug}] respecting expansion + search
function flatten(roots) {
  const out = [];
  const walk = (nodes, depth, rootSlug) => {
    for (const n of nodes) {
      out.push({ node: n, depth, rootSlug: rootSlug || n.slug });
      if (n.children?.length) walk(n.children, depth + 1, rootSlug || n.slug);
    }
  };
  walk(roots, 0, null);
  return out;
}

export default function CategoryTree({ tree }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(() => new Set());
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [menuFor, setMenuFor] = useState(null);
  const [modal, setModal] = useState(null);   // { mode:'add'|'edit', node?, parent?, rootSlug }
  const [del, setDel] = useState(null);        // node being deleted
  const [err, setErr] = useState("");
  const [flash, setFlash] = useState("");

  const all = useMemo(() => flatten(tree), [tree]);
  const stats = useMemo(() => {
    let total = 0, active = 0;
    for (const { node } of all) { total++; if (node.is_active !== false) active++; }
    return { total, active };
  }, [all]);

  const leaves = useMemo(() => all.filter((x) => !x.node.children?.length).map((x) => x.node), [all]);

  // Search: match name in any locale; auto-reveals matching branches.
  const needle = norm(q);
  const matchIds = useMemo(() => {
    if (!needle) return null;
    const ok = new Set();
    const mark = (node, ancestors) => {
      const hit = [node.name_fa, node.name_en, node.name_ru, node.name_tg, node.slug]
        .some((v) => norm(v).includes(needle));
      if (hit) { ok.add(node.id); ancestors.forEach((a) => ok.add(a.id)); }
      node.children?.forEach((c) => mark(c, [...ancestors, node]));
    };
    tree.forEach((r) => mark(r, []));
    return ok;
  }, [needle, tree]);

  const visibleRows = useMemo(() => {
    const rows = [];
    const walk = (nodes, depth, rootSlug) => {
      for (const n of nodes) {
        if (matchIds && !matchIds.has(n.id)) continue;
        rows.push({ node: n, depth, rootSlug: rootSlug || n.slug });
        const isOpen = matchIds ? true : expanded.has(n.id);
        if (n.children?.length && isOpen) walk(n.children, depth + 1, rootSlug || n.slug);
      }
    };
    walk(tree, 0, null);
    return rows;
  }, [tree, expanded, matchIds]);

  function toggleExpand(id) {
    setExpanded((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function expandAll() { setExpanded(new Set(all.map((x) => x.node.id))); }
  function collapseAll() { setExpanded(new Set()); }

  async function run(id, fn, okMsg) {
    setErr(""); setFlash(""); setBusyId(id); setMenuFor(null);
    const res = await fn();
    setBusyId(null);
    if (res?.ok) { if (okMsg) setFlash(okMsg); router.refresh(); }
    else setErr(res?.error || "عملیات ناموفق بود.");
    return res;
  }

  const toggleOne = (node) => run(node.id, () => setCategoryFlags(node.id, { is_active: node.is_active === false }));
  const toggleBranch = (node, on) => run(node.id, () => setCategorySubtreeActive(node.id, on), on ? "کل شاخه روشن شد." : "کل شاخه خاموش شد.");

  return (
    <div dir="rtl">
      <PageHeader title="دسته‌بندی‌ها" desc={`${stats.total} دسته در ۳ سطح · ${stats.active} فعال`} icon="layers" />

      {err && <div className="mb-4 text-sm rounded-xl px-3 py-2.5 flex items-center gap-2 bg-warn/10 text-warn"><Icon name="alertTriangle" size={16} /> {err}</div>}
      {flash && <div className="mb-4 text-sm rounded-xl px-3 py-2.5 flex items-center gap-2 bg-ok/10 text-ok"><Icon name="check" size={16} /> {flash}</div>}

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[220px]">
          <span className="absolute start-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none"><Icon name="search" size={15} /></span>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجو در همه‌ی دسته‌ها…" className="ps-9" />
        </div>
        <button type="button" onClick={expandAll} className="btn-ghost size-md"><Icon name="plus" size={15} /> باز کردن همه</button>
        <button type="button" onClick={collapseAll} className="btn-ghost size-md"><Icon name="close" size={15} /> بستن همه</button>
        <button type="button" onClick={() => setModal({ mode: "add", parent: null, rootSlug: null })} className="btn-primary size-md"><Icon name="plus" size={16} /> دپارتمان جدید</button>
      </div>

      <div className="rounded-2xl border border-line overflow-hidden bg-surface">
        {visibleRows.length === 0 ? (
          <p className="text-[13px] text-ink-faint p-6 text-center">
            {needle ? "چیزی پیدا نشد." : "هنوز دسته‌ای نیست. «دپارتمان جدید» را بزنید — یا اگر مایگریشن ۱۲ را اجرا کرده‌اید، صفحه را تازه کنید."}
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {visibleRows.map(({ node, depth, rootSlug }) => {
              const hasKids = !!node.children?.length;
              const isOpen = matchIds ? true : expanded.has(node.id);
              const off = node.is_active === false;
              const busy = busyId === node.id;
              const count = hasKids ? node.total_count : node.product_count;
              return (
                <li key={node.id} className={`relative flex items-center gap-2 px-3 py-2 transition-colors ${off ? "opacity-45" : ""} hover:bg-line-soft/40`}>
                  <span style={{ width: depth * 22 }} className="shrink-0" />
                  {hasKids ? (
                    <button type="button" onClick={() => toggleExpand(node.id)} className="grid place-items-center w-6 h-6 rounded text-ink-muted hover:bg-line shrink-0" title={isOpen ? "بستن" : "باز کردن"}>
                      <Icon name="chevronDown" size={15} className={`transition-transform ${isOpen ? "" : "-rotate-90"}`} />
                    </button>
                  ) : <span className="w-6 shrink-0" />}

                  <span className={`grid place-items-center w-7 h-7 rounded-lg shrink-0 ${depth === 0 ? "bg-brand-violet/10 text-brand-violet" : "bg-line-soft text-ink-muted"}`}>
                    <Icon name={node.icon || (depth === 0 ? "layers" : "tag")} size={14} />
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className={`text-[13.5px] truncate ${depth === 0 ? "font-bold text-ink" : "font-medium text-ink-soft"}`}>{nameOf(node)}</span>
                      <span className="text-[10px] text-ink-faint shrink-0">{LEVEL_LABEL[node.level] || ""}</span>
                      {count > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-line-soft text-ink-muted shrink-0">{count} کالا</span>}
                    </span>
                    <span className="block text-[11px] text-ink-faint truncate" dir="ltr">{node.name_en || node.slug}</span>
                  </span>

                  {busy ? <Spinner size={16} /> : (
                    <button type="button" role="switch" aria-checked={!off} onClick={() => toggleOne(node)} title={off ? "روشن کن" : "خاموش کن"}
                      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${off ? "bg-line" : "bg-ok"}`}>
                      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${off ? "right-[1.125rem]" : "right-0.5"}`} />
                    </button>
                  )}

                  <div className="relative shrink-0">
                    <button type="button" onClick={() => setMenuFor(menuFor === node.id ? null : node.id)} className="grid place-items-center w-7 h-7 rounded-lg text-ink-muted hover:bg-line" title="بیشتر">
                      <Icon name="list" size={16} />
                    </button>
                    {menuFor === node.id && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setMenuFor(null)} />
                        <div className="absolute z-20 end-0 mt-1 w-48 rounded-xl border border-line bg-surface shadow-lg py-1 text-[13px]">
                          {node.level < 3 && (
                            <button type="button" onClick={() => { setMenuFor(null); setModal({ mode: "add", parent: node, rootSlug }); }} className="w-full text-right px-3 py-2 hover:bg-line-soft flex items-center gap-2"><Icon name="plusCircle" size={15} className="text-brand-violet" /> افزودن زیرمجموعه</button>
                          )}
                          <button type="button" onClick={() => { setMenuFor(null); setModal({ mode: "edit", node, rootSlug }); }} className="w-full text-right px-3 py-2 hover:bg-line-soft flex items-center gap-2"><Icon name="edit" size={15} /> ویرایش</button>
                          {hasKids && (off
                            ? <button type="button" onClick={() => toggleBranch(node, true)} className="w-full text-right px-3 py-2 hover:bg-line-soft flex items-center gap-2"><Icon name="eye" size={15} className="text-ok" /> روشن‌کردن کل شاخه</button>
                            : <button type="button" onClick={() => toggleBranch(node, false)} className="w-full text-right px-3 py-2 hover:bg-line-soft flex items-center gap-2"><Icon name="eyeOff" size={15} /> خاموش‌کردن کل شاخه</button>
                          )}
                          <button type="button" onClick={() => { setMenuFor(null); setDel(node); }} className="w-full text-right px-3 py-2 hover:bg-warn/10 text-warn flex items-center gap-2"><Icon name="trash" size={15} /> حذف</button>
                        </div>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {modal && (
        <CategoryModal
          modal={modal}
          onClose={() => setModal(null)}
          onDone={(msg) => { setModal(null); setFlash(msg); router.refresh(); }}
          onError={setErr}
        />
      )}
      {del && (
        <DeleteModal node={del} leaves={leaves} onClose={() => setDel(null)}
          onDone={(msg) => { setDel(null); setFlash(msg); router.refresh(); }} onError={setErr} />
      )}
    </div>
  );
}

// ── add / edit modal ─────────────────────────────────────────────────────────
function CategoryModal({ modal, onClose, onDone, onError }) {
  const editing = modal.mode === "edit";
  const src = editing ? modal.node : null;
  const parent = modal.parent || null;
  const level = editing ? src.level : (parent ? (parent.level || 1) + 1 : 1);
  const [f, setF] = useState({
    slug: src?.slug || "",
    name_fa: src?.name_fa || "", name_en: src?.name_en || "",
    name_ru: src?.name_ru || "", name_tg: src?.name_tg || "",
    icon: src?.icon || "",
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function save() {
    setBusy(true);
    const payload = {
      ...f,
      world: modal.rootSlug || (level === 1 ? f.slug : null),
      parent_id: editing ? undefined : (parent ? parent.id : null),
      level,
    };
    const res = editing ? await updateCategory(src.id, payload) : await createCategory(payload);
    setBusy(false);
    if (res?.ok) onDone(editing ? "دسته ویرایش شد." : "دسته افزوده شد.");
    else onError(res?.error || "ذخیره ناموفق بود.");
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-navy/40 backdrop-blur-sm" />
      <div dir="rtl" onClick={(e) => e.stopPropagation()} className="relative card w-full max-w-lg max-h-[88vh] overflow-auto animate-fade-in">
        <div className="flex items-center justify-between p-5 border-b border-line">
          <h2 className="font-bold text-lg text-ink">
            {editing ? "ویرایش دسته" : parent ? `زیرمجموعهٔ «${nameOf(parent)}»` : "دپارتمان جدید"}
            <span className="text-[11px] text-ink-faint font-normal ms-2">{LEVEL_LABEL[level]}</span>
          </h2>
          <button type="button" onClick={onClose} className="grid place-items-center w-9 h-9 rounded-lg hover:bg-line-soft text-ink-muted"><Icon name="close" size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          {!editing && (
            <Field label="اسلاگ (لاتین، یکتا)"><Input value={f.slug} onChange={set("slug")} placeholder="face-serum" dir="ltr" /></Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="نام فارسی"><Input value={f.name_fa} onChange={set("name_fa")} placeholder="سرم پوست" /></Field>
            <Field label="نام تاجیکی"><Input value={f.name_tg} onChange={set("name_tg")} placeholder="Серуми пӯст" /></Field>
            <Field label="نام روسی"><Input value={f.name_ru} onChange={set("name_ru")} placeholder="Сыворотка" /></Field>
            <Field label="نام انگلیسی"><Input value={f.name_en} onChange={set("name_en")} placeholder="Facial Serum" dir="ltr" /></Field>
          </div>
          <Field label="آیکن (نام Lucide، اختیاری)"><Input value={f.icon} onChange={set("icon")} placeholder="droplet" dir="ltr" /></Field>
        </div>
        <div className="flex items-center justify-end gap-2 p-5 border-t border-line">
          <button type="button" onClick={onClose} className="btn-ghost size-md">انصراف</button>
          <button type="button" onClick={save} disabled={busy} className="btn-primary size-md disabled:opacity-60">{busy ? <Spinner /> : <Icon name="save" size={16} />} ذخیره</button>
        </div>
      </div>
    </div>
  );
}

// ── delete modal (with product move) ─────────────────────────────────────────
function DeleteModal({ node, leaves, onClose, onDone, onError }) {
  const [moveTo, setMoveTo] = useState("");
  const [needsMove, setNeedsMove] = useState(false);
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const options = leaves.filter((l) => l.id !== node.id);

  async function confirm() {
    setBusy(true);
    const res = await deleteCategorySafe(node.id, moveTo || undefined);
    setBusy(false);
    if (res?.ok) onDone("دسته حذف شد.");
    else if (res?.needsMove) { setNeedsMove(true); setCount(res.count || 0); }
    else onError(res?.error || "حذف ناموفق بود.");
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-navy/40 backdrop-blur-sm" />
      <div dir="rtl" onClick={(e) => e.stopPropagation()} className="relative card w-full max-w-md animate-fade-in">
        <div className="p-5 border-b border-line"><h2 className="font-bold text-lg text-ink">حذف «{nameOf(node)}»؟</h2></div>
        <div className="p-5 space-y-3 text-[13px] text-ink-soft">
          {node.children?.length > 0 && (
            <p className="rounded-xl px-3 py-2.5 bg-warn/10 text-warn flex items-center gap-2"><Icon name="alertTriangle" size={16} /> این دسته زیرمجموعه دارد؛ همه‌ی زیرمجموعه‌ها هم حذف می‌شوند.</p>
          )}
          {needsMove ? (
            <Field label={`این دسته ${count} محصول دارد — محصول‌ها به کجا منتقل شوند؟`}>
              <select value={moveTo} onChange={(e) => setMoveTo(e.target.value)} className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-[13px]">
                <option value="">— انتخاب دستهٔ مقصد —</option>
                {options.map((o) => <option key={o.id} value={o.id}>{nameOf(o)}</option>)}
              </select>
            </Field>
          ) : <p>محصولات حذف نمی‌شوند؛ فقط از این دسته جدا/منتقل می‌شوند.</p>}
        </div>
        <div className="flex items-center justify-end gap-2 p-5 border-t border-line">
          <button type="button" onClick={onClose} className="btn-ghost size-md">انصراف</button>
          <button type="button" onClick={confirm} disabled={busy || (needsMove && !moveTo)} className="btn-primary size-md bg-warn hover:bg-warn disabled:opacity-60">{busy ? <Spinner /> : <Icon name="trash" size={16} />} حذف</button>
        </div>
      </div>
    </div>
  );
}
