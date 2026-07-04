// components/beauty/BeautyBrand.jsx — OFFICIAL Medoria Beauty brand assets.
// Renders the untouched PNGs from /public/brand with their intrinsic aspect
// ratios (mark 500×500, wordmark 702×355) — never recolored, stretched or
// redrawn. `BeautyWordLockup` pairs the official wordmark with a plain
// letter-spaced "BEAUTY" line descriptor (UI label, not a logo reconstruction).
import Image from "next/image";

export function BeautyMarkImg({ size = 40, priority = false, className = "", opacity }) {
  return (
    <Image
      src="/brand/beauty-mark.png"
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      priority={priority}
      className={`select-none object-contain ${className}`}
      style={opacity != null ? { opacity } : undefined}
      sizes={`${Math.ceil(size)}px`}
    />
  );
}

export function BeautyWordmarkImg({ height = 24, priority = false, className = "" }) {
  const width = Math.round(height * (702 / 355));
  return (
    <Image
      src="/brand/beauty-wordmark.png"
      alt="Medoria"
      width={width}
      height={height}
      priority={priority}
      className={`select-none object-contain ${className}`}
      sizes={`${width}px`}
    />
  );
}

export function BeautyWordLockup({ height = 22, label = "BEAUTY" }) {
  return (
    <span dir="ltr" translate="no" aria-label="Medoria Beauty" className="inline-flex items-baseline gap-2">
      <BeautyWordmarkImg height={height} />
      <span
        aria-hidden="true"
        className="text-[0.62em] font-bold uppercase leading-none"
        style={{ color: "var(--v-accent)", letterSpacing: "0.34em", fontSize: Math.round(height * 0.52) }}
      >
        {label}
      </span>
    </span>
  );
}
