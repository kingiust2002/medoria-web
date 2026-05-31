// components/layout/Logo.jsx
// Brand lockup = transparent mark (/logo-mark.png) + "Medoria" wordmark as text.
//
// NOTE: the shipped /logo.png, /logo-full.png and /logo-text.png are actually
// black-background JPEGs (no alpha), which rendered as black/white boxes on the
// page. /logo-mark.png is the background-removed transparent version generated
// from /logo.png. The wordmark is drawn as text so it stays crisp and adapts to
// light/dark backgrounds (the JPEG wordmark was dark-on-black and unusable).

export default function Logo({ size = 36, variant = "icon", white = false, showText = true }) {
  const onlyText = variant === "text";
  const wantText = onlyText || variant === "full" || (variant === "icon" && showText);

  return (
    <span className="inline-flex items-center gap-2.5 group select-none">
      {!onlyText && (
        <span className="relative shrink-0" style={{ width: size, height: size }}>
          {/* soft brand glow behind the mark */}
          <span
            className="absolute inset-0 rounded-full blur-md opacity-0 group-hover:opacity-60 transition-opacity"
            style={{ background: "radial-gradient(circle, rgba(139,47,247,0.55), transparent 70%)" }}
            aria-hidden="true"
          />
          <img
            src="/logo-mark.png"
            alt={wantText ? "" : "Medoria"}
            width={size}
            height={size}
            style={{ width: size, height: size }}
            className="relative object-contain transition-transform duration-300 group-hover:scale-105 group-hover:rotate-[6deg]"
          />
        </span>
      )}
      {wantText && (
        <span
          className={`font-display font-extrabold tracking-tight leading-none ${white ? "text-white" : "text-ink"}`}
          style={{ fontSize: Math.round(size * 0.56) }}
        >
          Medoria
        </span>
      )}
    </span>
  );
}
