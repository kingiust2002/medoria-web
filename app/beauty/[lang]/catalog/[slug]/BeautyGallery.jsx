"use client";
// BeautyGallery — main image + thumbnail switcher for the Beauty product page.
// Tiny client island; with zero or one image it renders a static frame.
import { useState } from "react";
import Icon from "@/components/shared/Icon";

export default function BeautyGallery({ images = [], alt = "", badge = null }) {
  const [idx, setIdx] = useState(0);
  const current = images[Math.min(idx, images.length - 1)] || null;

  return (
    <div>
      <div className="img-ph relative aspect-square rounded-3xl overflow-hidden border border-line bg-surface">
        {current ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={current} alt={alt} className="w-full h-full object-cover" />
        ) : (
          <span className="absolute inset-0 grid place-items-center text-ink-faint">
            <Icon name="sparkles" size={44} strokeWidth={1.1} />
          </span>
        )}
        {badge && (
          <span className="tag absolute top-4 start-4 text-white"
            style={{ background: "linear-gradient(120deg,var(--v-navy),var(--v-copper))" }}>
            {badge}
          </span>
        )}
      </div>

      {images.length > 1 && (
        <div className="flex gap-2.5 mt-3 overflow-x-auto pb-1">
          {images.map((src, i) => (
            <button key={i} type="button" onClick={() => setIdx(i)}
              aria-label={`${alt} ${i + 1}`}
              className={`img-ph relative w-16 h-16 rounded-xl overflow-hidden border shrink-0 transition-all ${
                i === idx ? "border-[color:var(--v-copper)] ring-2 ring-[color:var(--v-copper)]/30" : "border-line opacity-70 hover:opacity-100"
              }`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
