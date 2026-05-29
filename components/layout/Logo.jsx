// components/layout/Logo.jsx
// variant: "icon" (just symbol), "text" (just typography), "full" (symbol + text)

export default function Logo({ size = 36, variant = "icon", white = false, showText = true }) {
  // Backwards compatibility: if showText is true and variant is icon, switch to full
  const effectiveVariant = (variant === "icon" && showText) ? "icon-plus-text" : variant;

  if (variant === "full") {
    return (
      <img
        src="/logo-full.png"
        alt="Medoria"
        style={{ height: size, width: "auto", objectFit: "contain" }}
        className={`shrink-0 drop-shadow-sm transition-transform hover:scale-[1.02] ${white ? "brightness-0 invert" : ""}`}
      />
    );
  }

  if (variant === "text") {
    return (
      <img
        src="/logo-text.png"
        alt="Medoria"
        style={{ height: size, width: "auto", objectFit: "contain" }}
        className={`shrink-0 ${white ? "brightness-0 invert" : ""}`}
      />
    );
  }

  if (variant === "icon") {
    return (
      <img
        src="/logo.png"
        alt="Medoria"
        width={size}
        height={size}
        style={{ width: size, height: size, objectFit: "contain" }}
        className="shrink-0 drop-shadow-sm transition-transform hover:scale-105"
      />
    );
  }

  // icon-plus-text (header style)
  return (
    <div className="flex items-center gap-2.5 group">
      <img
        src="/logo.png"
        alt="Medoria"
        width={size}
        height={size}
        style={{ width: size, height: size, objectFit: "contain" }}
        className="shrink-0 drop-shadow-sm transition-transform group-hover:scale-105"
      />
      <span className={`font-display text-[20px] font-extrabold tracking-tight ${white ? "text-white" : "text-ink"}`}>
        Medoria
      </span>
    </div>
  );
}
