// components/layout/Brand.jsx
// Canonical Medoria Health lockup = gradient mark + "Medoria" wordmark +
// official "Health" wordmark (public/images/Health.png — shares the same
// ribbon-wave motif as "Medoria", in the site's pink→violet→blue→cyan
// spectrum). Used in the header, footer, and homepage hero card, so this is
// the site-wide identity — it always reads "Medoria Health" now that a
// dedicated Health wordmark exists, matching Medoria Beauty's lockup pattern.
// ALWAYS dir="ltr" so the lockup never mirrors/flips in RTL (fa/ar) — the brand
// orientation is identical in every locale, exactly like the English version.
// Theme-safe: navy logotype on light, white logotype on dark (wave preserved).
// Health.png carries its own built-in colour gradient (like the mark), so it
// is NOT swapped for dark — only the flat "Medoria" wordmark is.
//   onDark  → force the white "Medoria" logotype (for always-dark surfaces: footer, etc.)

import { HEALTH_RATIO, HEALTH_WIDTH_PER_H, HEALTH_GAPS, fluidLockupHeight } from "@/lib/brandFluid";

// `reserved` makes the lockup fluid: the pixels the rest of its row needs
// (sibling controls + container padding). The height then shrinks with the
// viewport (never above `height`, never below `minHeight`) so the lockup can
// never push the page wider than the screen. Without `reserved` the size is fixed.
export default function Brand({ height = 28, symbol = true, onDark = false, className = "", reserved = 0, reservedMd = 0, minHeight = 12 }) {
  // --bh = the lockup height; every size below is a calc() of it (see lib/brandFluid.js).
  const fluidArgs = { height, minHeight, widthPerH: HEALTH_WIDTH_PER_H, gaps: HEALTH_GAPS };
  const vars = reserved
    ? { "--bh-base": fluidLockupHeight({ ...fluidArgs, reserved }), ...(reservedMd ? { "--bh-md": fluidLockupHeight({ ...fluidArgs, reserved: reservedMd }) } : {}) }
    : { "--bh": `${height}px` };
  const H = "var(--bh)";
  const sym = `calc(${H} * 1.18)`;
  // "Health" is set a touch smaller than "Medoria" so the two wordmarks read
  // as one balanced lockup rather than "Health" overpowering it.
  const healthHeight = `calc(${H} * 0.6)`;
  const Mark = symbol ? (
    <img
      src="/logo-mark.png"
      alt=""
      aria-hidden="true"
      width={Math.round(height * 1.18)}
      height={Math.round(height * 1.18)}
      style={{ width: sym, height: sym }}
      className="shrink-0 object-contain transition-transform duration-300 group-hover:scale-105 group-hover:rotate-[6deg]"
    />
  ) : null;

  return (
    <span
      dir="ltr"
      translate="no"
      aria-label="Medoria Health"
      className={`inline-flex items-center gap-2.5 select-none group ${reserved ? "brand-fluid " : ""}${className}`}
      style={vars}
    >
      {Mark}
      <span className="inline-flex items-baseline gap-2">
        {onDark ? (
          <img src="/brand/wordmark-white.png" alt="Medoria" style={{ height: H }} className="w-auto object-contain" />
        ) : (
          <>
            <img src="/brand/wordmark-navy.png"  alt="Medoria" style={{ height: H }} className="w-auto object-contain dark:hidden" />
            <img src="/brand/wordmark-white.png" alt="" aria-hidden="true" style={{ height: H }} className="hidden dark:block w-auto object-contain" />
          </>
        )}
        <img
          src="/images/Health.png"
          alt=""
          aria-hidden="true"
          height={Math.round(height * 0.6)}
          width={Math.round((height * 0.6) / HEALTH_RATIO)}
          style={{ height: healthHeight }}
          className="w-auto object-contain"
        />
      </span>
    </span>
  );
}
