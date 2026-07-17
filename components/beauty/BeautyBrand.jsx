// components/beauty/BeautyBrand.jsx — OFFICIAL Medoria Beauty brand assets.
// Renders the untouched PNGs with their intrinsic aspect ratios (mark
// 500×500, wordmark 702×355) — never recolored, stretched or redrawn.
// `BeautyWordLockup` pairs the "Medoria" wordmark with the official "Beauty"
// wordmark (public/images/Beauty.png — shares the same navy+copper ribbon-
// wave motif as the mark), not a CSS-drawn label, so the lockup is real
// designed type throughout.
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

// Measured glyph coverage of the official PNGs (opaque-pixel bounds). The
// "Medoria" beauty wordmark is authored with heavy transparent padding — its
// text fills only ~28% of the image height — so at a given height it renders
// ~3x smaller than Health's dense wordmark (~87% fill). We tightly CLIP the
// transparent margins (no redraw, no recolor, no stretch — the glyphs are
// pixel-for-pixel the official artwork) so the lockup matches Health's size.
const MED = { aspect: 702 / 355, fillY: 0.2845, centerY: 0.4761, leftX: 0.1083, fillX: 0.8219 };
const BTY = { aspect: 866 / 288, fillY: 0.6493, centerY: 0.5174, leftX: 0.0912, fillX: 0.8418 };

// One official wordmark PNG, scaled so its VISIBLE glyphs are `cap` px tall and
// clipped tight to those glyphs (transparent padding removed via overflow).
function ClippedWord({ src, alt, cap, m, pad = 1.06 }) {
  const imgH = cap / m.fillY;
  const imgW = imgH * m.aspect;
  const boxH = cap * pad;
  const boxW = imgW * m.fillX;
  return (
    <span className="relative inline-block overflow-hidden align-middle shrink-0" style={{ height: boxH, width: boxW }}>
      <img
        src={src}
        alt={alt}
        aria-hidden={alt ? undefined : "true"}
        className="absolute max-w-none select-none"
        style={{ height: imgH, width: imgW, top: boxH / 2 - m.centerY * imgH, left: -(m.leftX * imgW) }}
      />
    </span>
  );
}

export function BeautyWordLockup({ height = 30 }) {
  // `height` mirrors Health's <Brand height> semantics (header 30, footer 32,
  // card 22). Health's wordmark visually fills ~0.867 of that; we target the
  // same visible cap so the two houses read at an identical size.
  const capMedoria = Math.round(height * 0.867);
  const capBeauty = Math.round(capMedoria * 0.72); // "Beauty" a touch smaller
  return (
    <span dir="ltr" translate="no" aria-label="Medoria Beauty" className="inline-flex items-center gap-2">
      <ClippedWord src="/brand/beauty-wordmark.png" alt="Medoria" cap={capMedoria} m={MED} />
      <ClippedWord src="/images/Beauty.png" alt="" cap={capBeauty} m={BTY} />
    </span>
  );
}
