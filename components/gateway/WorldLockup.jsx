// components/gateway/WorldLockup.jsx — hero-scale official lockups for the
// gateway worlds. Real designed type only (never CSS-drawn): each vertical
// pairs its own "Medoria" wordmark with its designed vertical word. The
// /brand/gateway/*.png files are tight crops of the official assets (empty
// padding trimmed, art untouched) so the pair baseline-aligns predictably at
// any size. Plain <img> with explicit dimensions (no CLS); these are the two
// LCP candidates of the route, so they load with high fetch priority.
const ASSETS = {
  health: {
    medoria: { src: "/brand/gateway/medoria-health.png", ratio: 700 / 129 },
    word: { src: "/brand/gateway/word-health.png", ratio: 1679 / 357 },
    label: "Medoria Health",
  },
  beauty: {
    medoria: { src: "/brand/gateway/medoria-beauty.png", ratio: 583 / 107 },
    word: { src: "/brand/gateway/word-beauty.png", ratio: 735 / 192 },
    label: "Medoria Beauty",
  },
};

export default function WorldLockup({ vertical, height = 40, className = "" }) {
  const a = ASSETS[vertical] || ASSETS.health;
  const wordH = Math.round(height * 0.66);
  // Fluid on small screens (the pair otherwise kisses a 390px viewport's
  // edges): 75% of the design size at a 390px viewport, easing linearly up to
  // the full size at 1024px. width:auto keeps the intrinsic ratio, and the
  // width/height attrs still reserve layout space.
  const fluid = (h) => {
    const min = Math.round(h * 0.75);
    const slope = ((h - min) / (1024 - 390)) * 100; // vw units
    const intercept = min - 3.9 * slope;            // px at a 390px viewport
    return `clamp(${min}px, ${slope.toFixed(2)}vw + ${intercept.toFixed(1)}px, ${h}px)`;
  };
  const hCss = fluid(height);
  const wCss = fluid(wordH);
  return (
    <span
      dir="ltr"
      translate="no"
      aria-label={a.label}
      className={`inline-flex items-end gap-3 select-none ${className}`}
    >
      <img
        src={a.medoria.src}
        alt={a.label}
        width={Math.round(height * a.medoria.ratio)}
        height={height}
        fetchPriority="high"
        style={{ height: hCss, width: "auto" }}
        className="object-contain"
      />
      <img
        src={a.word.src}
        alt=""
        aria-hidden="true"
        width={Math.round(wordH * a.word.ratio)}
        height={wordH}
        fetchPriority="high"
        style={{ height: wCss, width: "auto" }}
        className="object-contain"
      />
    </span>
  );
}
