// components/beauty/BeautyMark.jsx — SVG recreation of the Medoria Beauty mark:
// a four-lobe ribbon cross alternating deep navy and copper, drawn from the
// supplied logo. Used as the brand motif (hero, watermarks, header). When the
// production PNG lands at /public/brand/beauty-mark.png, swap prominent uses
// for next/image; this vector stays for tints/watermarks.
export default function BeautyMark({ size = 96, className = "", opacity = 1 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      aria-hidden="true"
      className={className}
      style={{ opacity }}
    >
      <defs>
        <linearGradient id="bm-copper" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#E8B48A" />
          <stop offset="0.5" stopColor="#C87D4E" />
          <stop offset="1" stopColor="#8F5326" />
        </linearGradient>
        <linearGradient id="bm-navy" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3A4C86" />
          <stop offset="0.5" stopColor="#1C2951" />
          <stop offset="1" stopColor="#101A38" />
        </linearGradient>
      </defs>
      {/* four ribbon lobes — alternating materials, rotated around the center */}
      <g>
        <path
          d="M50 46 C42 38 42 24 50 16 C58 8 72 8 78 16 C84 24 82 36 74 42 C68 46 58 48 50 46 Z"
          fill="url(#bm-copper)"
          transform="rotate(0 50 50)"
        />
        <path
          d="M50 46 C42 38 42 24 50 16 C58 8 72 8 78 16 C84 24 82 36 74 42 C68 46 58 48 50 46 Z"
          fill="url(#bm-navy)"
          transform="rotate(90 50 50)"
        />
        <path
          d="M50 46 C42 38 42 24 50 16 C58 8 72 8 78 16 C84 24 82 36 74 42 C68 46 58 48 50 46 Z"
          fill="url(#bm-copper)"
          transform="rotate(180 50 50)"
        />
        <path
          d="M50 46 C42 38 42 24 50 16 C58 8 72 8 78 16 C84 24 82 36 74 42 C68 46 58 48 50 46 Z"
          fill="url(#bm-navy)"
          transform="rotate(270 50 50)"
        />
      </g>
    </svg>
  );
}
