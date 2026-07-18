"use client";
// components/beauty/operator/BulkAddGrid.jsx — manual bulk product entry.
// Draft rows live client-side (localStorage-backed); saving sends them through
// the same validated batch engine as the Excel/CSV import, in small chunks.
// One bad row never blocks the rest — failed rows stay editable.
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Icon from "@/components/shared/Icon";
import { beautyImageUrl as imageUrl } from "@/lib/beauty/catalog";
import { uploadProductImage } from "@/lib/beauty/operator/actions";
import { commitProductRows, finalizeProductBatch, checkSkusExist } from "@/lib/beauty/operator/importActions";
import { COMMIT_CHUNK_SIZE } from "@/lib/operator/importCore";
import { PRODUCT_BADGES } from "@/lib/beauty/operator/constants";
import QuickCategoryModal from "@/components/beauty/operator/QuickCategoryModal";
import { PageHeader, SectionCard, Field, Input, Select, Toggle, Badge, Spinner } from "@/components/operator/ui";

const DRAFT_KEY = "medoria_operator_bulk_draft_v1";
let keySeq = 1;

const DEFAULTS = {
  category_id: "", brand: "", unit: "", price_on_request: false,
  in_stock: true, is_active: true, badge: "", min_order_qty: "1",
};

function blankRow(d) {
  return {
    _key: `r${keySeq++}`, _status: null, _msgs: [], _warns: [], _skuExists: false, _open: false,
    name_fa: "", name_en: "", sku: "", slug: "", description_fa: "", tags: "",
    price: "", image_url: "",
    category_id: d.category_id, brand: d.brand, unit: d.unit,
    price_on_request: d.price_on_request, in_stock: d.in_stock, is_active: d.is_active,
    is_featured: false, badge: d.badge, min_order_qty: d.min_order_qty,
  };
}

function hasContent(r) {
  return Boolean(r.name_fa.trim() || r.name_en.trim() || r.sku.trim());
}

export default function BulkAddGrid({ categories }) {
  const router = useRouter();
  const [cats, setCats] = useState(categories);
  const [defaults, setDefaults] = useState(DEFAULTS);
  const [rows, setRows] = useState(() => [blankRow(DEFAULTS), blankRow(DEFAULTS), blankRow(DEFAULTS)]);
  const [draftFound, setDraftFound] = useState(null);
  const [catModal, setCatModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(null); // { done, total }
  const [summary, setSummary] = useState(null);
  const imgInputRef = useRef(null);
  const imgRowRef = useRef(null);
  const skuTimer = useRef(null);

  const catSlugById = useMemo(() => {
    const m = new Map();
    for (const c of cats) m.set(String(c.id), c.slug);
    return m;
  }, [cats]);

  const unsaved = rows.filter((r) => r._status !== "saved" && hasContent(r));

  // ── drafts ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (Array.isArray(d?.rows) && d.rows.some(hasContent)) setDraftFound(d);
      }
    } catch { /* ignore corrupted draft */ }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const keep = rows.filter((r) => r._status !== "saved");
        if (keep.some(hasContent)) localStorage.setItem(DRAFT_KEY, JSON.stringify({ defaults, rows: keep }));
        else localStorage.removeItem(DRAFT_KEY);
      } catch { /* storage full */ }
    }, 700);
    return () => clearTimeout(t);
  }, [rows, defaults]);

  useEffect(() => {
    if (!unsaved.length) return;
    const h = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [unsaved.length]);

  function restoreDraft() {
    const d = draftFound;
    if (!d) return;
    setDefaults({ ...DEFAULTS, ...d.defaults });
    setRows(d.rows.map((r) => ({ ...blankRow(d.defaults || DEFAULTS), ...r, _key: `r${keySeq++}`, _status: null, _msgs: [], _warns: [] })));
    setDraftFound(null);
  }
  function discardDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* no-op */ }
    setDraftFound(null);
  }

  // ── row ops ─────────────────────────────────────────────────────────────────
  const setRow = (key, patch) => setRows((list) => list.map((r) => (r._key === key ? { ...r, ...patch } : r)));
  const addRow = () => setRows((list) => [...list, blankRow(defaults)]);
  const duplicateRow = (key) => setRows((list) => {
    const i = list.findIndex((r) => r._key === key);
    if (i < 0) return list;
    const copy = { ...list[i], _key: `r${keySeq++}`, _status: null, _msgs: [], _warns: [], sku: "", slug: "" };
    return [...list.slice(0, i + 1), copy, ...list.slice(i + 1)];
  });
  const copyFromPrev = (key) => setRows((list) => {
    const i = list.findIndex((r) => r._key === key);
    if (i <= 0) return list;
    const prev = list[i - 1];
    return list.map((r, idx) => idx === i
      ? { ...prev, _key: r._key, _status: null, _msgs: [], _warns: [], name_fa: "", name_en: "", sku: "", slug: "", image_url: r.image_url }
      : r);
  });
  const removeRow = (key) => setRows((list) => (list.length > 1 ? list.filter((r) => r._key !== key) : [blankRow(defaults)]));
  const clearSaved = () => setRows((list) => {
    const left = list.filter((r) => r._status !== "saved");
    return left.length ? left : [blankRow(defaults)];
  });
  function clearAll() {
    if (!window.confirm("همه ردیف‌ها (و پیش‌نویس ذخیره‌شده) پاک شوند؟")) return;
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* no-op */ }
    setRows([blankRow(defaults), blankRow(defaults), blankRow(defaults)]);
    setSummary(null);
  }

  // duplicate SKUs inside the grid (client-side warning)
  const gridDupSkus = useMemo(() => {
    const seen = new Map();
    const dups = new Set();
    for (const r of rows) {
      const k = r.sku.trim().toLowerCase();
      if (!k || r._status === "saved") continue;
      if (seen.has(k)) { dups.add(k); }
      seen.set(k, r._key);
    }
    return dups;
  }, [rows]);

  // existing-SKU warning (server check, debounced; warning only)
  function scheduleSkuCheck() {
    clearTimeout(skuTimer.current);
    skuTimer.current = setTimeout(async () => {
      const skus = [...new Set(rows.map((r) => r.sku.trim()).filter(Boolean))];
      if (!skus.length) return;
      const res = await checkSkusExist(skus);
      if (!res?.ok) return;
      const existing = new Set(res.existing);
      setRows((list) => list.map((r) => ({ ...r, _skuExists: existing.has(r.sku.trim().toLowerCase()) && r._status !== "saved" })));
    }, 500);
  }

  // ── image upload per row ────────────────────────────────────────────────────
  function pickImage(key) {
    imgRowRef.current = key;
    imgInputRef.current?.click();
  }
  async function onImageFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    const key = imgRowRef.current;
    if (!file || !key) return;
    setRow(key, { _busy: true });
    const fd = new FormData();
    fd.append("file", file);
    const res = await uploadProductImage(fd);
    setRow(key, { _busy: false, ...(res.ok ? { image_url: res.path } : { _warns: [res.error || "آپلود ناموفق بود."] }) });
  }

  // ── save all ────────────────────────────────────────────────────────────────
  async function saveAll() {
    const send = rows.filter((r) => r._status !== "saved" && hasContent(r));
    if (!send.length) return;
    setSaving(true);
    setSummary(null);
    setProgress({ done: 0, total: send.length });

    const rawOf = (r) => ({
      name_fa: r.name_fa, name_en: r.name_en, sku: r.sku, slug: r.slug,
      description_fa: r.description_fa, tags: r.tags,
      category_slug: catSlugById.get(String(r.category_id)) || "",
      brand: r.brand, unit: r.unit, badge: r.badge,
      price: r.price_on_request ? "" : r.price,
      price_on_request: r.price_on_request,
      min_order_qty: r.min_order_qty,
      in_stock: r.in_stock, is_active: r.is_active, is_featured: r.is_featured,
      image_url: r.image_url,
    });

    const counts = { total: 0, create: 0, update: 0, skip: 0, error: 0 };
    let connectionError = "";
    for (let i = 0; i < send.length; i += COMMIT_CHUNK_SIZE) {
      const chunk = send.slice(i, i + COMMIT_CHUNK_SIZE);
      let res;
      try {
        res = await commitProductRows(chunk.map(rawOf), { mode: "add", startRow: 1 });
      } catch {
        res = null;
      }
      if (!res?.ok) {
        connectionError = res?.error || "ارتباط با سرور برقرار نشد. ردیف‌های باقی‌مانده ذخیره نشدند.";
        break;
      }
      for (const out of res.results) {
        const row = chunk[out.rowNum - 1];
        if (!row) continue;
        counts.total += 1;
        counts[out.status] = (counts[out.status] || 0) + 1;
        if (out.status === "create") {
          setRow(row._key, { _status: "saved", _id: out.id, _msgs: [], _warns: out.warnings || [], _skuExists: false });
        } else {
          setRow(row._key, { _status: out.status === "error" ? "error" : "skip", _msgs: out.messages || [], _warns: out.warnings || [] });
        }
      }
      setProgress({ done: Math.min(i + chunk.length, send.length), total: send.length });
    }

    try {
      await finalizeProductBatch({ source: "bulk", mode: "add", ...counts });
    } catch { /* history/revalidate best-effort */ }
    setSaving(false);
    setProgress(null);
    setSummary({ ...counts, connectionError });
    router.refresh();
  }

  const inputCx = "!h-9 text-[12.5px]";

  return (
    <>
      <PageHeader title="افزودن گروهی محصولات" subtitle="چند محصول را پشت‌سرهم وارد کنید — جزئیات کامل (گالری/مشخصات/ترجمه) را بعداً از ویرایش محصول تکمیل کنید.">
        <Link href="/beauty/operator/products" className="btn-ghost size-md"><Icon name="chevronRight" size={16} /> محصولات</Link>
        <Link href="/beauty/operator/products/import" className="btn-ghost size-md"><Icon name="upload" size={16} /> ورود از Excel/CSV</Link>
      </PageHeader>

      {draftFound && (
        <div className="mb-4 text-sm rounded-xl px-3 py-2.5 flex flex-wrap items-center gap-2 bg-primary/10 text-primary">
          <Icon name="archive" size={16} />
          پیش‌نویس ذخیره‌نشده با {draftFound.rows.filter(hasContent).length} ردیف پیدا شد.
          <button type="button" onClick={restoreDraft} className="font-semibold underline underline-offset-2">بازیابی</button>
          <button type="button" onClick={discardDraft} className="text-ink-muted underline underline-offset-2">حذف پیش‌نویس</button>
        </div>
      )}

      {summary && (
        <div className={`mb-4 text-sm rounded-xl px-3 py-2.5 flex flex-wrap items-center gap-3 ${summary.error || summary.connectionError ? "bg-warn/10 text-warn" : "bg-ok/10 text-ok"}`}>
          <Icon name={summary.error || summary.connectionError ? "alertTriangle" : "check"} size={16} />
          <span>{summary.create} ساخته شد · {summary.skip} رد شد · {summary.error} خطا</span>
          {summary.connectionError && <span>{summary.connectionError}</span>}
          {summary.create > 0 && <Link href="/beauty/operator/products" className="font-semibold underline underline-offset-2">دیدن محصولات</Link>}
        </div>
      )}

      {/* defaults bar */}
      <SectionCard title="پیش‌فرض ردیف‌های جدید" desc="این مقدارها روی ردیف‌های تازه اعمال می‌شوند (ردیف‌های موجود تغییر نمی‌کنند)" icon="settings" className="mb-5">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
          <Field label="دسته">
            <div className="flex gap-1.5">
              <Select className={inputCx} value={defaults.category_id} onChange={(e) => setDefaults((d) => ({ ...d, category_id: e.target.value }))}>
                <option value="">— بدون دسته —</option>
                {cats.map((c) => <option key={c.id ?? c.slug} value={String(c.id ?? "")}>{c.name_fa || c.name_en || c.slug}</option>)}
              </Select>
              <button type="button" onClick={() => setCatModal(true)} title="دسته جدید" className="btn-ghost size-sm !h-9 shrink-0"><Icon name="plus" size={15} /></button>
            </div>
          </Field>
          <Field label="برند"><Input className={inputCx} value={defaults.brand} onChange={(e) => setDefaults((d) => ({ ...d, brand: e.target.value }))} /></Field>
          <Field label="واحد"><Input className={inputCx} value={defaults.unit} onChange={(e) => setDefaults((d) => ({ ...d, unit: e.target.value }))} placeholder="بسته ۱۰۰ عددی" /></Field>
          <Field label="حداقل سفارش"><Input className={inputCx} type="number" min="1" dir="ltr" value={defaults.min_order_qty} onChange={(e) => setDefaults((d) => ({ ...d, min_order_qty: e.target.value }))} /></Field>
          <Field label="نشان"><Select className={inputCx} value={defaults.badge} onChange={(e) => setDefaults((d) => ({ ...d, badge: e.target.value }))}>{PRODUCT_BADGES.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}</Select></Field>
          <div className="rounded-xl bg-canvas-soft border border-line px-3 py-2"><Toggle checked={defaults.price_on_request} onChange={(v) => setDefaults((d) => ({ ...d, price_on_request: v }))} label="استعلام قیمت" /></div>
          <div className="rounded-xl bg-canvas-soft border border-line px-3 py-2"><Toggle checked={defaults.in_stock} onChange={(v) => setDefaults((d) => ({ ...d, in_stock: v }))} label="موجود" /></div>
          <div className="rounded-xl bg-canvas-soft border border-line px-3 py-2"><Toggle checked={defaults.is_active} onChange={(v) => setDefaults((d) => ({ ...d, is_active: v }))} label="فعال در سایت" /></div>
        </div>
      </SectionCard>

      {/* grid */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]" dir="rtl">
            <thead>
              <tr className="text-ink-muted bg-canvas-soft border-b border-line">
                <th className="px-2 py-2.5 font-medium text-right w-8">#</th>
                <th className="px-2 py-2.5 font-medium text-right min-w-[150px]">نام فارسی <span className="text-brand-pink">*</span></th>
                <th className="px-2 py-2.5 font-medium text-right min-w-[140px]">نام انگلیسی</th>
                <th className="px-2 py-2.5 font-medium text-right min-w-[100px]">SKU</th>
                <th className="px-2 py-2.5 font-medium text-right min-w-[120px]">دسته</th>
                <th className="px-2 py-2.5 font-medium text-right min-w-[90px]">برند</th>
                <th className="px-2 py-2.5 font-medium text-right min-w-[110px]">قیمت $</th>
                <th className="px-2 py-2.5 font-medium text-right min-w-[90px]">واحد</th>
                <th className="px-2 py-2.5 font-medium text-center w-14">موجود</th>
                <th className="px-2 py-2.5 font-medium text-center w-14">فعال</th>
                <th className="px-2 py-2.5 font-medium text-center w-14">ویژه</th>
                <th className="px-2 py-2.5 font-medium text-right w-20">تصویر</th>
                <th className="px-2 py-2.5 font-medium text-center w-28">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r, idx) => {
                const saved = r._status === "saved";
                const error = r._status === "error";
                const dupInGrid = r.sku.trim() && gridDupSkus.has(r.sku.trim().toLowerCase());
                const nameMissing = hasContent(r) && !r.name_fa.trim() && !r.name_en.trim();
                return (
                  <BulkRow
                    key={r._key} r={r} idx={idx} cats={cats} saved={saved} error={error}
                    dupInGrid={dupInGrid} nameMissing={nameMissing} inputCx={inputCx}
                    setRow={setRow} duplicateRow={duplicateRow} copyFromPrev={copyFromPrev}
                    removeRow={removeRow} pickImage={pickImage} scheduleSkuCheck={scheduleSkuCheck}
                  />
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center gap-2 px-3 py-3 border-t border-line bg-canvas-soft">
          <button type="button" onClick={addRow} className="btn-ghost size-sm"><Icon name="plus" size={15} /> ردیف جدید</button>
          <button type="button" onClick={clearSaved} className="btn-ghost size-sm"><Icon name="archive" size={15} /> پاک‌کردن ذخیره‌شده‌ها</button>
          <button type="button" onClick={clearAll} className="btn-ghost size-sm !text-warn hover:!border-warn/40"><Icon name="trash" size={15} /> پاک‌کردن همه</button>
          <div className="mr-auto flex items-center gap-3">
            {progress && <span className="text-xs text-ink-muted tabular">{progress.done}/{progress.total}</span>}
            <button type="button" onClick={saveAll} disabled={saving || !unsaved.length} className="btn-primary size-md disabled:opacity-60">
              {saving ? <Spinner /> : <Icon name="save" size={18} />}
              {saving ? "در حال ذخیره…" : `ذخیره ${unsaved.length || ""} ردیف`}
            </button>
          </div>
        </div>
      </div>

      <p className="text-[11px] text-ink-faint mt-3 leading-relaxed">
        ردیف‌ها به‌صورت خودکار پیش‌نویس می‌شوند و بعد از رفرش برمی‌گردند. SKU تکراری فقط هشدار است؛ جلوی ذخیرهٔ ردیف‌های دیگر را نمی‌گیرد.
      </p>

      <input ref={imgInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="hidden" onChange={onImageFile} />

      {catModal && (
        <QuickCategoryModal
          onClose={() => setCatModal(false)}
          onCreated={(cat) => {
            setCats((list) => [...list, cat]);
            setDefaults((d) => ({ ...d, category_id: String(cat.id ?? "") }));
            setCatModal(false);
          }}
        />
      )}
    </>
  );
}

function BulkRow({ r, idx, cats, saved, error, dupInGrid, nameMissing, inputCx, setRow, duplicateRow, copyFromPrev, removeRow, pickImage, scheduleSkuCheck }) {
  const dis = saved;
  const cellCx = `${inputCx} ${dis ? "opacity-60 pointer-events-none" : ""}`;
  return (
    <>
      <tr className={saved ? "bg-ok/5" : error ? "bg-warn/5" : ""}>
        <td className="px-2 py-1.5 text-ink-faint tabular">
          {saved ? <Icon name="check" size={15} className="text-ok" /> : error ? <Icon name="alertTriangle" size={15} className="text-warn" /> : idx + 1}
        </td>
        <td className="px-1.5 py-1.5"><Input className={cellCx} value={r.name_fa} onChange={(e) => setRow(r._key, { name_fa: e.target.value, _status: saved ? "saved" : null })} placeholder="دستکش نیتریل" /></td>
        <td className="px-1.5 py-1.5"><Input className={cellCx} dir="ltr" value={r.name_en} onChange={(e) => setRow(r._key, { name_en: e.target.value })} placeholder="Nitrile gloves" /></td>
        <td className="px-1.5 py-1.5">
          <Input className={`${cellCx} ${dupInGrid || r._skuExists ? "!border-warn" : ""}`} dir="ltr" value={r.sku} onChange={(e) => setRow(r._key, { sku: e.target.value })} onBlur={scheduleSkuCheck} placeholder="GLV-001" />
        </td>
        <td className="px-1.5 py-1.5">
          <Select className={cellCx} value={String(r.category_id || "")} onChange={(e) => setRow(r._key, { category_id: e.target.value })}>
            <option value="">— بدون دسته —</option>
            {cats.map((c) => <option key={c.id ?? c.slug} value={String(c.id ?? "")}>{c.name_fa || c.name_en || c.slug}</option>)}
          </Select>
        </td>
        <td className="px-1.5 py-1.5"><Input className={cellCx} value={r.brand} onChange={(e) => setRow(r._key, { brand: e.target.value })} /></td>
        <td className="px-1.5 py-1.5">
          <div className="flex items-center gap-1.5">
            <Input className={`${cellCx} !w-20`} dir="ltr" type="number" step="0.01" min="0" disabled={r.price_on_request} value={r.price_on_request ? "" : r.price} onChange={(e) => setRow(r._key, { price: e.target.value })} placeholder={r.price_on_request ? "استعلام" : "8.50"} />
            <button type="button" title="استعلام قیمت" onClick={() => !dis && setRow(r._key, { price_on_request: !r.price_on_request })} className={`pill !text-[10px] shrink-0 ${r.price_on_request ? "bg-brand-violet/15 text-brand-violet" : "bg-line-soft text-ink-faint"}`}>استعلام</button>
          </div>
        </td>
        <td className="px-1.5 py-1.5"><Input className={cellCx} value={r.unit} onChange={(e) => setRow(r._key, { unit: e.target.value })} /></td>
        <td className="px-1.5 py-1.5 text-center"><input type="checkbox" className="accent-brand-violet w-4 h-4" disabled={dis} checked={r.in_stock} onChange={(e) => setRow(r._key, { in_stock: e.target.checked })} /></td>
        <td className="px-1.5 py-1.5 text-center"><input type="checkbox" className="accent-brand-violet w-4 h-4" disabled={dis} checked={r.is_active} onChange={(e) => setRow(r._key, { is_active: e.target.checked })} /></td>
        <td className="px-1.5 py-1.5 text-center"><input type="checkbox" className="accent-brand-violet w-4 h-4" disabled={dis} checked={r.is_featured} onChange={(e) => setRow(r._key, { is_featured: e.target.checked })} /></td>
        <td className="px-1.5 py-1.5">
          <div className="flex items-center gap-1.5">
            <span className="img-ph w-9 h-9 rounded-lg overflow-hidden grid place-items-center text-ink-faint border border-line shrink-0">
              {r._busy ? <Spinner size={14} /> : r.image_url ? <img src={imageUrl(r.image_url)} alt="" className="w-full h-full object-cover" /> : <Icon name="image" size={14} />}
            </span>
            {!dis && (
              <button type="button" onClick={() => pickImage(r._key)} className="grid place-items-center w-7 h-7 rounded-md text-ink-muted hover:bg-line-soft" title="آپلود تصویر">
                <Icon name="upload" size={14} />
              </button>
            )}
          </div>
        </td>
        <td className="px-1.5 py-1.5">
          <div className="flex items-center justify-center gap-0.5">
            {saved && r._id ? (
              <Link href={`/beauty/operator/products/${r._id}/edit`} className="grid place-items-center w-7 h-7 rounded-md text-ink-muted hover:bg-line-soft" title="ویرایش کامل"><Icon name="edit" size={14} /></Link>
            ) : (
              <>
                <button type="button" onClick={() => setRow(r._key, { _open: !r._open })} className="grid place-items-center w-7 h-7 rounded-md text-ink-muted hover:bg-line-soft" title="فیلدهای بیشتر"><Icon name="chevronDown" size={14} className={r._open ? "rotate-180 transition-transform" : "transition-transform"} /></button>
                <button type="button" onClick={() => copyFromPrev(r._key)} disabled={idx === 0} className="grid place-items-center w-7 h-7 rounded-md text-ink-muted hover:bg-line-soft disabled:opacity-30" title="کپی از ردیف قبلی"><Icon name="copy" size={14} /></button>
                <button type="button" onClick={() => duplicateRow(r._key)} className="grid place-items-center w-7 h-7 rounded-md text-ink-muted hover:bg-line-soft" title="تکثیر ردیف"><Icon name="plusCircle" size={14} /></button>
              </>
            )}
            <button type="button" onClick={() => removeRow(r._key)} className="grid place-items-center w-7 h-7 rounded-md text-ink-muted hover:bg-warn/10 hover:text-warn" title="حذف ردیف"><Icon name="trash" size={14} /></button>
          </div>
        </td>
      </tr>
      {(r._open || error || r._msgs.length > 0 || r._warns.length > 0 || dupInGrid || r._skuExists || nameMissing) && !saved && (
        <tr className={error ? "bg-warn/5" : ""}>
          <td />
          <td colSpan={12} className="px-2 pb-2.5">
            {r._open && (
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2.5 mb-2 pt-1">
                <Field label="حداقل سفارش"><Input className={inputCx} type="number" min="1" dir="ltr" value={r.min_order_qty} onChange={(e) => setRow(r._key, { min_order_qty: e.target.value })} /></Field>
                <Field label="نشان"><Select className={inputCx} value={r.badge} onChange={(e) => setRow(r._key, { badge: e.target.value })}>{PRODUCT_BADGES.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}</Select></Field>
                <Field label="اسلاگ (خالی = خودکار)"><Input className={inputCx} dir="ltr" value={r.slug} onChange={(e) => setRow(r._key, { slug: e.target.value })} /></Field>
                <Field label="برچسب‌ها (با | جدا کنید)"><Input className={inputCx} value={r.tags} onChange={(e) => setRow(r._key, { tags: e.target.value })} /></Field>
                <div className="sm:col-span-2 lg:col-span-3"><Field label="آدرس تصویر (یا از دکمه آپلود)"><Input className={inputCx} dir="ltr" value={r.image_url} onChange={(e) => setRow(r._key, { image_url: e.target.value })} placeholder="https://…" /></Field></div>
                <div className="sm:col-span-2 lg:col-span-4"><Field label="توضیح کوتاه (فارسی)"><Input className={inputCx} value={r.description_fa} onChange={(e) => setRow(r._key, { description_fa: e.target.value })} /></Field></div>
              </div>
            )}
            <div className="flex flex-wrap gap-1.5">
              {nameMissing && <Badge tone="warn">نام فارسی یا انگلیسی لازم است</Badge>}
              {dupInGrid && <Badge tone="warn">SKU در همین جدول تکراری است</Badge>}
              {r._skuExists && <Badge tone="warn">این SKU قبلاً در کاتالوگ ثبت شده</Badge>}
              {r._msgs.map((m, i) => <Badge key={`m${i}`} tone={error ? "warn" : "info"}>{m}</Badge>)}
              {r._warns.map((m, i) => <Badge key={`w${i}`} tone="info">{m}</Badge>)}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
