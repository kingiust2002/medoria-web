"use client";
// components/beauty/operator/BrandProductsModal.jsx — the correct workflow:
// manage a brand's roster FROM THE BRAND, over the EXISTING catalog. Two
// panes: products already carrying this brand's name (with a one-click
// unlink), and a search over every other product in the catalog to attach
// (multi-select → one bulk write). Brand ↔ product is the existing text
// join (beauty_products.brand == beauty_brands.name); this modal is the
// only place that relationship is meant to be edited by hand — the
// standalone "create a brand-new product" flow still exists (linked at the
// bottom) for the rare case the product isn't in the catalog yet at all.
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Icon from "@/components/shared/Icon";
import { beautyImageUrl as imageUrl } from "@/lib/beauty/catalog";
import { quickUpdateProduct, bulkUpdateProducts } from "@/lib/beauty/operator/actions";
import { Input, Spinner, productDisplayName } from "@/components/operator/ui";

const norm = (s) => String(s || "").trim().toLowerCase();

export default function BrandProductsModal({ brand, products, onClose }) {
  const router = useRouter();
  const brandKey = norm(brand.name);

  const [q, setQ] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [unlinking, setUnlinking] = useState(null);
  const [err, setErr] = useState("");
  const [flash, setFlash] = useState("");

  const current = useMemo(
    () => products.filter((p) => norm(p.brand) === brandKey),
    [products, brandKey]
  );

  const candidates = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = products.filter((p) => norm(p.brand) !== brandKey);
    if (needle) {
      list = list.filter((p) =>
        [p.name_fa, p.name_en, p.sku, p.brand].filter(Boolean).some((v) => String(v).toLowerCase().includes(needle))
      );
    }
    return list.slice(0, 60); // enough to scan; search narrows further
  }, [products, brandKey, q]);

  function toggle(id) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function attachSelected() {
    if (!selected.size) return;
    setErr(""); setBusy(true);
    const res = await bulkUpdateProducts([...selected], { brand: brand.name });
    setBusy(false);
    if (res.ok) {
      setFlash(`${res.count} محصول به «${brand.name}» افزوده شد.`);
      setSelected(new Set());
      router.refresh();
    } else {
      setErr(res.error || "افزودن ناموفق بود.");
    }
  }

  async function unlink(product) {
    setErr(""); setUnlinking(product.id);
    const res = await quickUpdateProduct(product.id, { brand: null });
    setUnlinking(null);
    if (res.ok) { setFlash(`«${productDisplayName(product)}» از این برند جدا شد.`); router.refresh(); }
    else setErr(res.error || "جداکردن ناموفق بود.");
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-navy/40 backdrop-blur-sm" />
      <div onClick={(e) => e.stopPropagation()} dir="rtl" className="relative card w-full max-w-2xl max-h-[88vh] flex flex-col animate-fade-in">
        <div className="flex items-center justify-between gap-3 p-5 border-b border-line shrink-0">
          <div className="min-w-0">
            <h2 className="font-bold text-lg text-ink truncate">محصولات برند «<span dir="ltr">{brand.name}</span>»</h2>
            <p className="text-xs text-ink-muted mt-0.5">{current.length} محصول در حال حاضر متصل است</p>
          </div>
          <button type="button" onClick={onClose} className="grid place-items-center w-9 h-9 rounded-lg hover:bg-line-soft text-ink-muted shrink-0"><Icon name="close" size={18} /></button>
        </div>

        <div className="flex-1 overflow-auto p-5">
          {err && <div className="mb-4 text-sm rounded-xl px-3 py-2.5 flex items-center gap-2 bg-warn/10 text-warn"><Icon name="alertTriangle" size={16} /> {err}</div>}
          {flash && <div className="mb-4 text-sm rounded-xl px-3 py-2.5 flex items-center gap-2 bg-ok/10 text-ok"><Icon name="check" size={16} /> {flash}</div>}

          {/* Current roster */}
          <div className="mb-6">
            <h3 className="text-[12px] font-semibold text-ink-muted mb-2">محصولات این برند</h3>
            {current.length === 0 ? (
              <p className="text-[13px] text-ink-faint rounded-xl border border-dashed border-line p-4 text-center">هنوز محصولی به این برند وصل نیست. از پایین یکی اضافه کن.</p>
            ) : (
              <div className="rounded-xl border border-line divide-y divide-line overflow-hidden">
                {current.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 px-3 py-2.5">
                    <span className="w-9 h-9 rounded-lg overflow-hidden bg-line-soft shrink-0 grid place-items-center">
                      {p.image_url ? <img src={imageUrl(p.image_url)} alt="" className="w-full h-full object-cover" /> : <Icon name="package" size={14} className="text-ink-faint" />}
                    </span>
                    <span className="min-w-0 flex-1 text-[13px] text-ink truncate">{productDisplayName(p)}</span>
                    <button
                      type="button"
                      onClick={() => unlink(p)}
                      disabled={unlinking === p.id}
                      className="shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold text-ink-muted hover:text-warn transition-colors disabled:opacity-50"
                      title="جدا کردن از این برند"
                    >
                      {unlinking === p.id ? <Spinner size={13} /> : <Icon name="close" size={13} />} جدا کردن
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Attach existing products */}
          <div>
            <h3 className="text-[12px] font-semibold text-ink-muted mb-2">افزودن محصول موجود به این برند</h3>
            <div className="relative mb-3">
              <span className="absolute start-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none"><Icon name="search" size={15} /></span>
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجو در نام، SKU یا برند فعلی…" className="ps-9" />
            </div>
            {candidates.length === 0 ? (
              <p className="text-[13px] text-ink-faint rounded-xl border border-dashed border-line p-4 text-center">محصولی مطابق پیدا نشد.</p>
            ) : (
              <div className="rounded-xl border border-line divide-y divide-line overflow-hidden max-h-64 overflow-y-auto">
                {candidates.map((p) => {
                  const checked = selected.has(p.id);
                  return (
                    <label key={p.id} className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${checked ? "bg-brand-violet/[0.06]" : "hover:bg-line-soft/50"}`}>
                      <input type="checkbox" checked={checked} onChange={() => toggle(p.id)} className="w-4 h-4 accent-brand-violet shrink-0" />
                      <span className="w-9 h-9 rounded-lg overflow-hidden bg-line-soft shrink-0 grid place-items-center">
                        {p.image_url ? <img src={imageUrl(p.image_url)} alt="" className="w-full h-full object-cover" /> : <Icon name="package" size={14} className="text-ink-faint" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] text-ink truncate">{productDisplayName(p)}</span>
                        <span className="block text-[11px] text-ink-faint truncate">{p.brand ? <>فعلاً: <span dir="ltr">{p.brand}</span></> : "بدون برند"}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 p-5 border-t border-line shrink-0">
          <Link href={`/beauty/operator/products/new?brand=${encodeURIComponent(brand.name)}`} className="text-[12px] font-semibold text-brand-violet hover:opacity-80">
            + محصول کاملاً تازه برای این برند بساز
          </Link>
          <button type="button" onClick={attachSelected} disabled={busy || !selected.size} className="btn-primary size-md disabled:opacity-60">
            {busy ? <Spinner /> : <Icon name="plus" size={16} />}
            {busy ? "در حال افزودن…" : `افزودن ${selected.size || ""} به برند`.trim()}
          </button>
        </div>
      </div>
    </div>
  );
}
