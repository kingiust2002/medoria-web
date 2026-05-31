// components/layout/Brand.jsx
// Canonical Medoria lockup = gradient mark + real wordmark logotype.
// ALWAYS dir="ltr" so the lockup never mirrors/flips in RTL (fa/ar) — the brand
// orientation is identical in every locale, exactly like the English version.
// Theme-safe: navy logotype on light, white logotype on dark (wave preserved).
//   onDark  → force the white logotype (for always-dark surfaces: footer, etc.)

export default function Brand({ height = 28, symbol = true, onDark = false, className = "" }) {
  const sym = Math.round(height * 1.18);
  const Mark = symbol ? (
    <img
      src="/logo-mark.png"
      alt=""
      aria-hidden="true"
      width={sym}
      height={sym}
      style={{ width: sym, height: sym }}
      className="shrink-0 object-contain transition-transform duration-300 group-hover:scale-105 group-hover:rotate-[6deg]"
    />
  ) : null;

  return (
    <span
      dir="ltr"
      translate="no"
      aria-label="Medoria"
      className={`inline-flex items-center gap-2.5 select-none group ${className}`}
    >
      {Mark}
      {onDark ? (
        <img src="/brand/wordmark-white.png" alt="Medoria" style={{ height }} className="w-auto object-contain" />
      ) : (
        <>
          <img src="/brand/wordmark-navy.png"  alt="Medoria" style={{ height }} className="w-auto object-contain dark:hidden" />
          <img src="/brand/wordmark-white.png" alt="" aria-hidden="true" style={{ height }} className="hidden dark:block w-auto object-contain" />
        </>
      )}
    </span>
  );
}
