// components/beauty/BeautyBrand.jsx — OFFICIAL Medoria Beauty brand assets.
// Renders the untouched artwork at its intrinsic aspect ratios (mark 500×500,
// wordmark 702×355) — never recolored, stretched or redrawn.
// `BeautyWordLockup` pairs the "Medoria" wordmark with the official "Beauty"
// wordmark (public/images/Beauty.webp — shares the same navy+copper ribbon-
// wave motif as the mark), not a CSS-drawn label, so the lockup is real
// designed type throughout.
//
// The two wordmarks are served as LOSSLESS webp re-encodes of the official
// PNG masters (which stay in the repo alongside them): same dimensions, the
// alpha channel bit-identical, and RGB identical on every visible pixel — so
// the glyphs are still pixel-for-pixel the official artwork, at ~44% of the
// bytes. This matters because ClippedWord below uses a plain <img> (its exact
// pixel geometry is load-bearing, see the metrics comment), which means no
// next/image optimization: whatever file is named here goes over the wire
// as-is, and these two are on every Beauty page via the header lockup.
import { MED, BTY, K_MEDORIA, K_BEAUTY, BEAUTY_WIDTH_PER_H, BEAUTY_GAPS, fluidLockupHeight } from "@/lib/brandFluid";
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
      src="/brand/beauty-wordmark.webp"
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
// fillY = glyph height / image height · leftX = left transparent pad · fillX =
// glyph width / image width · botFrac = bottom glyph edge / image height (used
// to sit both words on a common baseline, like Health's items-baseline lockup).
// One official wordmark PNG, scaled so its VISIBLE glyphs are `k × --bh` tall
// (--bh is set by the lockup) and clipped tight to those glyphs (transparent
// padding removed via overflow). The glyphs are bottom-aligned in the box so
// sibling words share a baseline. Every size is a calc() of --bh so the whole
// lockup can scale with the viewport (see BeautyWordLockup `reserved`).
function ClippedWord({ src, alt, k, m }) {
  const imgH = k / m.fillY;            // image height, in units of --bh
  const imgW = imgH * m.aspect;        // image width
  const boxW = imgW * m.fillX;         // visible glyph box width
  const u = (n) => `calc(var(--bh) * ${n.toFixed(5)})`;
  return (
    <span className="relative inline-block overflow-hidden shrink-0" style={{ height: u(k), width: u(boxW) }}>
      <img
        src={src}
        alt={alt}
        aria-hidden={alt ? undefined : "true"}
        className="absolute max-w-none select-none"
        style={{ height: u(imgH), width: u(imgW), top: u(k - m.botFrac * imgH), left: u(-(m.leftX * imgW)) }}
      />
    </span>
  );
}

// `reserved` makes the lockup fluid (see lib/brandFluid.js): the height shrinks
// with the viewport — never above `height`, never below `minHeight` — so the
// lockup can never push the page wider than the screen.
export function BeautyWordLockup({ height = 30, reserved = 0, reservedMd = 0, minHeight = 11 }) {
  // `height` mirrors Health's <Brand height> semantics (header 30, footer 32,
  // card 22). Health's wordmark visually fills ~0.867 of that; we target the
  // same visible cap so the two houses read at an identical size, and sit
  // "Beauty" a touch smaller on the SAME baseline as "Medoria" (like Health).
  const fluidArgs = { height, minHeight, widthPerH: BEAUTY_WIDTH_PER_H, gaps: BEAUTY_GAPS };
  const vars = reserved
    ? { "--bh-base": fluidLockupHeight({ ...fluidArgs, reserved }), ...(reservedMd ? { "--bh-md": fluidLockupHeight({ ...fluidArgs, reserved: reservedMd }) } : {}) }
    : { "--bh": `${height}px` };
  return (
    <span dir="ltr" translate="no" aria-label="Medoria Beauty" className={`inline-flex items-end gap-2${reserved ? " brand-fluid" : ""}`} style={vars}>
      <ClippedWord src="/brand/beauty-wordmark.webp" alt="Medoria" k={K_MEDORIA} m={MED} />
      <ClippedWord src="/images/Beauty.webp" alt="" k={K_BEAUTY} m={BTY} />
    </span>
  );
}
