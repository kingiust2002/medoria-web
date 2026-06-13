// components/gateway/BeautyScene.jsx — warm carmine/rose glass atmosphere (decorative).
// CSS gradient-mesh + inline-SVG frosted rose-glass podiums with warm inner glow,
// a slow champagne sheen, and a soft base reflection. Abstract — no products.
export default function BeautyScene() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* warm carmine / rose / champagne mesh */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(64% 52% at 30% 24%, rgba(184,57,94,0.16), transparent 60%)," +
            "radial-gradient(58% 50% at 74% 40%, rgba(231,197,151,0.22), transparent 64%)",
        }}
      />
      {/* slow champagne sheen */}
      <div
        className="v-shimmer absolute -inset-x-12 top-[22%] h-44 rotate-[-12deg]"
        style={{ background: "linear-gradient(110deg, transparent 32%, rgba(255,255,255,0.5) 50%, transparent 68%)" }}
      />
      <svg
        className="absolute left-1/2 top-[18%] w-[min(82%,520px)] -translate-x-1/2"
        viewBox="0 0 520 400"
        fill="none"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id="bglass" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.5" />
            <stop offset="1" stopColor="#FCE7EC" stopOpacity="0.12" />
          </linearGradient>
          <linearGradient id="bedge" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#E7C597" />
            <stop offset="0.5" stopColor="#FFFFFF" />
            <stop offset="1" stopColor="#E4AFC0" />
          </linearGradient>
          <linearGradient id="blit" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#FFF1D9" />
            <stop offset="1" stopColor="#B8395E" stopOpacity="0" />
          </linearGradient>
        </defs>
        <g strokeWidth="1">
          <rect x="70" y="150" width="120" height="210" rx="16" fill="url(#bglass)" stroke="url(#bedge)" strokeOpacity="0.7" />
          <rect x="208" y="92" width="110" height="268" rx="16" fill="url(#bglass)" stroke="url(#bedge)" strokeOpacity="0.9" />
          <rect x="336" y="172" width="118" height="188" rx="16" fill="url(#bglass)" stroke="url(#bedge)" strokeOpacity="0.7" />
        </g>
        {/* lit bottle cores + highlight */}
        <g>
          <rect x="256" y="122" width="14" height="208" rx="7" fill="url(#blit)" />
          <rect x="120" y="182" width="12" height="168" rx="6" fill="url(#blit)" />
          <line x1="208" y1="93" x2="318" y2="93" stroke="#FFFFFF" strokeOpacity="0.9" />
        </g>
      </svg>
      {/* soft base reflection */}
      <div
        className="absolute inset-x-0 bottom-0 h-1/3"
        style={{ background: "linear-gradient(180deg, transparent, rgba(184,57,94,0.08))" }}
      />
    </div>
  );
}
