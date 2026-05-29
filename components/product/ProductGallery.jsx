// components/product/ProductGallery.jsx
"use client";
import { useState, useEffect } from "react";
import { imageUrl } from "@/lib/supabase";
import { CATEGORIES } from "@/lib/i18n";
import Icon from "@/components/shared/Icon";

export default function ProductGallery({ product }) {
  // Build the full image list: main + gallery
  const all = [];
  if (product.image_url) all.push(product.image_url);
  if (Array.isArray(product.gallery_urls)) {
    product.gallery_urls.forEach((u) => { if (u && !all.includes(u)) all.push(u); });
  }

  const [active, setActive] = useState(0);
  const [zoom, setZoom] = useState(false);

  // Keyboard navigation
  useEffect(() => {
    const fn = (e) => {
      if (e.key === "Escape") setZoom(false);
      if (zoom && e.key === "ArrowRight") setActive((a) => (a + 1) % all.length);
      if (zoom && e.key === "ArrowLeft")  setActive((a) => (a - 1 + all.length) % all.length);
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [zoom, all.length]);

  if (all.length === 0) {
    const catIcon = CATEGORIES.find((c) => c.slug === product.category)?.icon || "package";
    return (
      <div className="card overflow-hidden aspect-square bg-gradient-to-br from-tint-blue via-white to-tint-cyan">
        <div className="w-full h-full flex flex-col items-center justify-center gap-3">
          <div className="text-primary/30"><Icon name={catIcon} size={96} strokeWidth={1} /></div>
          <span className="text-xs text-ink-faint uppercase tracking-widest">{product.sku || "Medoria"}</span>
        </div>
      </div>
    );
  }

  const activeSrc = imageUrl(all[active]);

  return (
    <>
      <div className="space-y-3">
        {/* Main image */}
        <div
          onClick={() => setZoom(true)}
          className="card overflow-hidden aspect-square bg-gradient-to-br from-tint-blue to-tint-cyan cursor-zoom-in group relative"
        >
          <img src={activeSrc} alt="" className="w-full h-full object-cover transition-transform group-hover:scale-105" />
          <span className="absolute top-3 right-3 w-9 h-9 rounded-full bg-white/90 backdrop-blur text-ink-muted text-lg flex items-center justify-center shadow-soft opacity-0 group-hover:opacity-100 transition-opacity">
            ⤢
          </span>

          {/* Prev/Next on hover (if multiple) */}
          {all.length > 1 && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); setActive((a) => (a - 1 + all.length) % all.length); }}
                className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/90 backdrop-blur text-ink shadow-soft flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:scale-110"
                aria-label="Previous"
              >‹</button>
              <button
                onClick={(e) => { e.stopPropagation(); setActive((a) => (a + 1) % all.length); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/90 backdrop-blur text-ink shadow-soft flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:scale-110"
                aria-label="Next"
              >›</button>
            </>
          )}

          {/* Counter */}
          {all.length > 1 && (
            <span className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-navy/80 text-white text-[10px] font-mono px-2.5 py-1 rounded-full">
              {active + 1} / {all.length}
            </span>
          )}
        </div>

        {/* Thumbnails */}
        {all.length > 1 && (
          <div className="grid grid-cols-5 gap-2">
            {all.slice(0, 5).map((url, i) => (
              <button
                key={i}
                onClick={() => setActive(i)}
                className={[
                  "aspect-square rounded-xl overflow-hidden border-2 transition-all",
                  i === active
                    ? "border-primary shadow-soft"
                    : "border-line hover:border-primary/40 opacity-70 hover:opacity-100",
                ].join(" ")}
              >
                <img src={imageUrl(url)} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {zoom && (
        <div
          onClick={() => setZoom(false)}
          className="fixed inset-0 z-[200] bg-navy/95 backdrop-blur-sm flex items-center justify-center p-4 md:p-12"
        >
          <button
            onClick={() => setZoom(false)}
            className="absolute top-4 right-4 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 text-white text-2xl flex items-center justify-center transition-colors"
          >×</button>

          {all.length > 1 && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); setActive((a) => (a - 1 + all.length) % all.length); }}
                className="absolute left-4 md:left-8 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 text-white text-2xl flex items-center justify-center transition-colors"
              >‹</button>
              <button
                onClick={(e) => { e.stopPropagation(); setActive((a) => (a + 1) % all.length); }}
                className="absolute right-4 md:right-8 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 text-white text-2xl flex items-center justify-center transition-colors"
              >›</button>
            </>
          )}

          <img
            src={activeSrc}
            alt=""
            onClick={(e) => e.stopPropagation()}
            className="max-w-full max-h-full object-contain rounded-2xl"
          />

          {all.length > 1 && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-white/10 text-white text-sm font-mono px-3 py-1.5 rounded-full">
              {active + 1} / {all.length}
            </div>
          )}
        </div>
      )}
    </>
  );
}
