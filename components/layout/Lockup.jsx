// components/layout/Lockup.jsx
// One Medoria mark, two lockups. The vertical word ("Health" / "Beauty") is
// drawn as text so it adopts each world's palette via the additive --v-* tokens.
// Colours come from --v-ink / --v-accent (light-first, NOT the .dark-swapped
// neutrals), so the lockup stays legible on the forced-light gateway and Beauty
// surfaces regardless of any persisted dark preference. Pass no `vertical` for a
// plain "Medoria" brand mark (gateway header / nexus).
export default function Lockup({ vertical, size = 30, className = "" }) {
  const word = vertical === "beauty" ? "Beauty" : vertical === "health" ? "Health" : null;
  const mark = Math.round(size * 1.06);
  return (
    <span
      dir="ltr"
      translate="no"
      aria-label={word ? `Medoria ${word}` : "Medoria"}
      className={`inline-flex items-center gap-2.5 select-none ${className}`}
    >
      <img
        src="/logo-mark.png"
        alt=""
        aria-hidden="true"
        width={mark}
        height={mark}
        style={{ width: mark, height: mark }}
        className="shrink-0 object-contain"
      />
      <span className="font-display leading-none tracking-tight" style={{ fontSize: size }}>
        <span className="font-extrabold" style={{ color: "rgb(var(--v-ink))" }}>Medoria</span>
        {word && (
          <span className="font-medium" style={{ color: "var(--v-accent)", marginInlineStart: "0.34em" }}>
            {word}
          </span>
        )}
      </span>
    </span>
  );
}
