// components/beauty/BeautyBrand.jsx — OFFICIAL Medoria Beauty brand assets.
// Renders the untouched PNGs with their intrinsic aspect ratios (mark
// 500×500, wordmark 702×355) — never recolored, stretched or redrawn.
// `BeautyWordLockup` pairs the "Medoria" wordmark with the official "Beauty"
// wordmark (public/images/Beauty.png — shares the same navy+copper ribbon-
// wave motif as the mark), not a CSS-drawn label, so the lockup is real
// designed type throughout.
import Image from "next/image";

const BEAUTY_WORD_RATIO = 288 / 866; // Beauty.png intrinsic aspect ratio

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

export function BeautyWordLockup({ height = 22 }) {
  // "Beauty" is set a touch smaller than "Medoria" so the two wordmarks read
  // as one balanced lockup rather than "Beauty" overpowering it.
  const beautyHeight = Math.round(height * 0.6);
  return (
    <span dir="ltr" translate="no" aria-label="Medoria Beauty" className="inline-flex items-baseline gap-2">
      <BeautyWordmarkImg height={height} />
      <Image
        src="/images/Beauty.png"
        alt=""
        aria-hidden="true"
        width={Math.round(beautyHeight / BEAUTY_WORD_RATIO)}
        height={beautyHeight}
        className="select-none object-contain"
        style={{ height: beautyHeight, width: "auto" }}
      />
    </span>
  );
}
