"use client";
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Icon from "@/components/shared/Icon";
import { imageUrl } from "@/lib/supabase";
import { setProductActive, duplicateProduct, quickUpdateProduct, bulkUpdateProducts } from "@/lib/operator/actions";
import {
  PageHeader, Input, Select, Badge, EmptyState, Spinner, productDisplayName, priceText, isOnRequest,
} from "@/components/operator/ui";

export default function ProductsTable({ products, categories }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState(null);
  const [msg, setMsg] = useState(null);

  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [stock, setStock] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState("updated");

  const [selected, setSelected] = useState(() => new Set());
  const [editPrice, setEditPrice] = useState(null); // { id, val }
  const [bulkCat, setBulkCat] = useState("");

  const catName = useMemo(() => {
    const m = {};
    for (const c of categories) { m[`id:${c.id}`] = c.name_fa || c.name_en || c.slug; m[`slug:${c.slug}`] = c.name_fa || c.name_en || c.slug; }
    return m;
  }, [categories]);
  const nameOf = (p) => catName[`id:${p.category_id}`] || catName[`slug:${p.category}`] || "—";

  const rows = useMemo(() => {
    let list = [...products];
    const needle = q.trim().toLowerCase();
    if (needle) list = list.filter((p) => [p.name_fa, p.name_en, p.name_ru, p.name_tg, p.sku, p.brand].filter(Boolean).some((v) => String(v).toLowerCase().includes(needle)));
    if (cat) list = list.filter((p) => String(p.category_id) === cat || p.category === cat);
    if (stock === "in") list = list.filter((p) => p.in_stock);
    else if (stock === "out") list = list.filter((p) => !p.in_stock);
    if (status === "active") list = list.filter((p) => p.is_active !== false);
    else if (status === "inactive") list = list.filter((p) => p.is_active === false);
    list.sort((a, b) => {
      switch (sort) {
        case "newest": return new Date(b.created_at || 0) - new Date(a.created_at || 0);
        case "name": return productDisplayName(a).localeCompare(productDisplayName(b), "fa");
        case "category": return nameOf(a).localeCompare(nameOf(b), "fa");
        default: return new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0);
      }
    });
    return list;
  }, [products, q, cat, stock, status, sort]); // eslint-disable-line react-hooks/exhaustive-deps

  function flash(text, ok = false) { setMsg({ text, ok }); setTimeout(() => setMsg(null), 4000); }

  // selection
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggleSel = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSelected((s) => { if (rows.every((r) => s.has(r.id))) return new Set(); return new Set(rows.map((r) => r.id)); });
  const clearSel = () => setSelected(new Set());

  // single quick edits
  function runQuick(p, patch, okText) {
    setBusyId(p.id);
    startTransition(async () => {
      const res = await quickUpdateProduct(p.id, patch);
      setBusyId(null);
      if (res.ok) { if (okText) flash(okText, true); router.refresh(); }
      else flash(res.error);
    });
  }
  function toggleActive(p) {
    setBusyId(p.id);
    startTransition(async () => {
      const res = await setProductActive(p.id, p.is_active === false);
      setBusyId(null);
      if (res.ok) { flash(p.is_active === false ? "فعال شد." : "آرشیو شد.", true); router.refresh(); }
      else flash(res.error);
    });
  }
  function dup(p) {
    setBusyId(p.id);
    startTransition(async () => {
      const res = await duplicateProduct(p.id);
      setBusyId(null);
      if (res.ok) router.push(`/operator/products/${res.id}/edit`);
      else flash(res.error);
    });
  }
  function savePrice(p) {
    const val = editPrice?.val ?? "";
    runQuick(p, { price: val.trim() === "" ? null : val }, "قیمت ذخیره شد.");
    setEditPrice(null);
  }

  // bulk
  function runBulk(patch, okText) {
    const ids = [...selected];
    if (!ids.length) return;
    startTransition(async () => {
      const res = await bulkUpdateProducts(ids, patch);
      if (res.ok) { flash(`${okText} (${res.count} مورد)`, true); clearSel(); setBulkCat(""); router.refresh(); }
      else flash(res.error);
    });
  }
  function bulkCategory(value) {
    setBulkCat(value);
    if (!value) return;
    const c = categories.find((x) => String(x.id) === value);
    runBulk({ category_id: value, category: c?.slug || null }, "دسته تغییر کرد");
  }

  return (
    <>
      <PageHeader title="محصولات" subtitle={`${products.length} محصول`}>
        <Link href="/operator/products/new" className="btn-primary size-md"><Icon name="plus" size={18} /> افزودن محصول</Link>
      </PageHeader>

      {/* Filters */}
      <div className="card-flat p-3 mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none"><Icon name="search" size={16} /></span>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجوی نام، SKU یا برند…" className="pr-9" />
        </div>
        <Select value={cat} onChange={(e) => setCat(e.target.value)} className="w-auto min-w-[130px]">
          <option value="">همه دسته‌ها</option>
          {categories.map((c) => <option key={c.id ?? c.slug} value={String(c.id ?? c.slug)}>{c.name_fa || c.name_en || c.slug}</option>)}
        </Select>
        <Select value={stock} onChange={(e) => setStock(e.target.value)} className="w-auto"><option value="">موجودی: همه</option><option value="in">موجود</option><option value="out">ناموجود</option></Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto"><option value="">وضعیت: همه</option><option value="active">فعال</option><option value="inactive">غیرفعال</option></Select>
        <Select value={sort} onChange={(e) => setSort(e.target.value)} className="w-auto"><option value="updated">آخرین تغییر</option><option value="newest">جدیدترین</option><option value="name">نام</option><option value="category">دسته</option></Select>
      </div>

      {msg && (
        <div className={`mb-4 text-sm rounded-xl px-3 py-2.5 flex items-center gap-2 ${msg.ok ? "bg-ok/10 text-ok" : "bg-warn/10 text-warn"}`}>
          <Icon name={msg.ok ? "check" : "alertTriangle"} size={16} /> {msg.text}
        </div>
      )}

      {/* Bulk bar */}
      {selected.size > 0 && (
        <div className="card mb-4 p-3 flex flex-wrap items-center gap-2 border-brand-violet/30 bg-brand-violet/5 sticky top-2 z-20">
          <span className="text-sm font-semibold text-brand-violet">{selected.size} مورد انتخاب شده</span>
          <span className="flex-1" />
          <button onClick={() => runBulk({ is_active: true }, "فعال شد")} disabled={pending} className="btn-ghost size-sm"><Icon name="eye" size={15} /> فعال‌سازی</button>
          <button onClick={() => runBulk({ is_active: false }, "آرشیو شد")} disabled={pending} className="btn-ghost size-sm"><Icon name="archive" size={15} /> غیرفعال</button>
          <button onClick={() => runBulk({ requestPrice: true }, "استعلام قیمت شد")} disabled={pending} className="btn-ghost size-sm"><Icon name="dollar" size={15} /> استعلام قیمت</button>
          <Select value={bulkCat} onChange={(e) => bulkCategory(e.target.value)} disabled={pending} className="w-auto !h-9 text-xs">
            <option value="">تغییر دسته…</option>
            {categories.map((c) => <option key={c.id ?? c.slug} value={String(c.id ?? "")}>{c.name_fa || c.name_en || c.slug}</option>)}
          </Select>
          <button onClick={clearSel} className="btn-ghost size-sm !text-ink-muted"><Icon name="close" size={15} /> لغو</button>
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState icon="package" title="محصولی یافت نشد" desc="فیلترها را تغییر دهید یا محصول جدید اضافه کنید." />
      ) : (
        <div className="card overflow-hidden">
          {/* select-all header */}
          <label className="flex items-center gap-3 px-3 sm:px-4 py-2.5 border-b border-line bg-canvas-soft/60 cursor-pointer text-xs text-ink-muted">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} className="w-4 h-4 accent-brand-violet" />
            انتخاب همه ({rows.length})
          </label>

          <div className="divide-y divide-line">
            {rows.map((p) => {
              const img = p.image_url ? imageUrl(p.image_url) : null;
              const active = p.is_active !== false;
              const isBusy = busyId === p.id && pending;
              const editing = editPrice?.id === p.id;
              const checked = selected.has(p.id);
              return (
                <div key={p.id} className={`px-3 sm:px-4 py-3 flex items-center gap-3 transition-colors ${checked ? "bg-brand-violet/[0.06]" : "hover:bg-line-soft/50"}`}>
                  <input type="checkbox" checked={checked} onChange={() => toggleSel(p.id)} className="w-4 h-4 accent-brand-violet shrink-0" />
                  <span className="img-ph w-12 h-12 rounded-xl overflow-hidden shrink-0 grid place-items-center text-ink-faint">
                    {img ? <img src={img} alt="" className="w-full h-full object-cover" /> : <Icon name="image" size={18} />}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-ink truncate">{productDisplayName(p)}</p>
                      {p.badge && <span className="tag bg-line-soft text-ink-muted shrink-0">{p.badge}</span>}
                    </div>
                    <p className="text-xs text-ink-muted truncate mt-0.5"><span className="tabular">{p.sku || "—"}</span> · {nameOf(p)}</p>
                  </div>

                  {/* inline price */}
                  {editing ? (
                    <div className="flex items-center gap-1 shrink-0">
                      <input autoFocus type="number" step="0.01" min="0" value={editPrice.val} dir="ltr"
                        onChange={(e) => setEditPrice({ id: p.id, val: e.target.value })}
                        onKeyDown={(e) => { if (e.key === "Enter") savePrice(p); if (e.key === "Escape") setEditPrice(null); }}
                        placeholder="خالی=استعلام" className="input !h-8 w-28 text-xs" />
                      <button onClick={() => savePrice(p)} className="grid place-items-center w-8 h-8 rounded-lg text-ok hover:bg-ok/10"><Icon name="check" size={15} /></button>
                      <button onClick={() => setEditPrice(null)} className="grid place-items-center w-8 h-8 rounded-lg text-ink-faint hover:bg-line-soft"><Icon name="close" size={15} /></button>
                    </div>
                  ) : (
                    <button onClick={() => setEditPrice({ id: p.id, val: isOnRequest(p) ? "" : String(p.price) })}
                      className={`shrink-0 text-xs font-semibold px-2.5 h-8 rounded-lg border border-line hover:border-brand-violet/40 hover:text-brand-violet transition-colors tabular ${isOnRequest(p) ? "text-brand-violet" : "text-ink-soft"}`}
                      title="ویرایش قیمت">
                      {priceText(p)}
                    </button>
                  )}

                  {/* inline toggles */}
                  <button onClick={() => runQuick(p, { in_stock: !p.in_stock })} disabled={isBusy}
                    className={`hidden sm:grid place-items-center w-8 h-8 rounded-lg transition-colors disabled:opacity-50 ${p.in_stock ? "text-ok bg-ok/10" : "text-ink-faint hover:bg-line-soft"}`}
                    title={p.in_stock ? "موجود (کلیک=ناموجود)" : "ناموجود (کلیک=موجود)"}>
                    <Icon name={p.in_stock ? "badgeCheck" : "package"} size={16} />
                  </button>
                  <button onClick={() => runQuick(p, { is_featured: !p.is_featured })} disabled={isBusy}
                    className={`hidden sm:grid place-items-center w-8 h-8 rounded-lg transition-colors disabled:opacity-50 ${p.is_featured ? "text-accent-gold bg-accent-gold/10" : "text-ink-faint hover:bg-line-soft"}`}
                    title={p.is_featured ? "ویژه (کلیک=عادی)" : "عادی (کلیک=ویژه)"}>
                    <Icon name="star" size={16} fill={p.is_featured ? "currentColor" : "none"} />
                  </button>

                  <Badge tone={active ? "ok" : "muted"} className="hidden md:inline-flex">{active ? "فعال" : "غیرفعال"}</Badge>

                  <div className="flex items-center gap-1 shrink-0">
                    <Link href={`/operator/products/${p.id}/edit`} className="grid place-items-center w-9 h-9 rounded-lg text-ink-muted hover:bg-brand-violet/10 hover:text-brand-violet transition-colors" title="ویرایش"><Icon name="edit" size={16} /></Link>
                    <button onClick={() => dup(p)} disabled={isBusy} className="grid place-items-center w-9 h-9 rounded-lg text-ink-muted hover:bg-primary/10 hover:text-primary transition-colors disabled:opacity-50" title="تکثیر"><Icon name="copy" size={16} /></button>
                    <button onClick={() => toggleActive(p)} disabled={isBusy} className={`grid place-items-center w-9 h-9 rounded-lg transition-colors disabled:opacity-50 ${active ? "text-ink-muted hover:bg-warn/10 hover:text-warn" : "text-ink-muted hover:bg-ok/10 hover:text-ok"}`} title={active ? "آرشیو (غیرفعال)" : "فعال‌سازی"}>
                      {isBusy ? <Spinner /> : <Icon name={active ? "archive" : "eye"} size={16} />}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
