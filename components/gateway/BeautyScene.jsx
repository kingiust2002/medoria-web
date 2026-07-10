// components/gateway/BeautyScene.jsx — warm copper/rose glass atmosphere (decorative).
// CSS gradient-mesh + inline-SVG frosted rose-glass podiums with warm inner glow,
// a slow champagne sheen, a giant italic ghost word and a soft base reflection.
// Layers carry --gw-depth for the stage's pointer parallax (static without JS).
// Abstract — no products. aria-hidden.
export default function BeautyScene() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* warm carmine / rose / champagne mesh */}
      <div
        className="gw-depth absolute inset-0"
        style={{
          "--gw-depth": 0.12,
          background:
            "radial-gradient(64% 52% at 30% 24%, rgba(200,125,78,0.16), transparent 60%)," +
            "radial-gradient(58% 50% at 74% 40%, rgba(231,197,151,0.22), transparent 64%)",
        }}
      />
      {/* giant editorial ghost word — deepest parallax layer */}
      <div className="gw-depth absolute inset-x-0 top-[9%] flex justify-center" style={{ "--gw-depth": 0.9 }}>
        <span className="gw-ghost italic" style={{ fontFamily: "var(--font-beauty), Georgia, serif", fontWeight: 600 }}>
          Beauty
        </span>
      </div>
      {/* slow champagne sheen */}
      <div
        className="v-shimmer absolute -inset-x-12 top-[22%] h-44 rotate-[-12deg]"
        style={{ background: "linear-gradient(110deg, transparent 32%, rgba(255,255,255,0.5) 50%, transparent 68%)" }}
      />
      <div className="gw-depth absolute inset-0" style={{ "--gw-depth": 0.5 }}>
        <svg
          className="gw-breathe absolute left-1/2 top-[18%] w-[min(82%,520px)] -translate-x-1/2"
          viewBox="0 0 520 400"
          fill="none"
          preserveAspectRatio="xMidYMid meet"
          style={{ animationDelay: "-8s" }}
        >
          <defs>
            <linearGradient id="bglass" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.5" />
              <stop offset="1" stopColor="#F7E7D7" stopOpacity="0.12" />
            </linearGradient>
            <linearGradient id="bedge" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#E7C597" />
              <stop offset="0.5" stopColor="#FFFFFF" />
              <stop offset="1" stopColor="#D6A980" />
            </linearGradient>
            <linearGradient id="blit" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#F9E8CF" />
              <stop offset="1" stopColor="#9C5B2D" stopOpacity="0" />
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
      </div>
      {/* soft base reflection */}
      <div
        className="absolute inset-x-0 bottom-0 h-1/3"
        style={{ background: "linear-gradient(180deg, transparent, rgba(156,91,45,0.08))" }}
      />
    </div>
  );
}
