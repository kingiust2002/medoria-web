// components/gateway/HealthScene.jsx — "glacial glass architecture" (decorative).
// Inline SVG + CSS only: layered frosted-glass modules with surgical-silver lit
// edges, a vertical light shaft, a faint precision grid, a giant editorial
// ghost word and a soft floor reflection. Layers carry --gw-depth so the panel
// root's --gwx/--gwy pointer vars (set by GatewayStage's rAF) drift them at
// different depths; without JS the vars are unset and everything is static.
// Abstract — no products. aria-hidden.
export default function HealthScene() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* glacial ambient glow */}
      <div
        className="gw-depth absolute inset-0"
        style={{ "--gw-depth": 0.12, background: "radial-gradient(78% 58% at 50% 26%, rgba(47,111,230,0.10), transparent 70%)" }}
      />
      {/* giant editorial ghost word — deepest parallax layer */}
      <div className="gw-depth absolute inset-x-0 top-[7%] flex justify-center" style={{ "--gw-depth": 0.9 }}>
        <span className="gw-ghost font-display font-extrabold tracking-tight">HEALTH</span>
      </div>
      {/* vertical light shaft */}
      <div
        className="gw-depth absolute left-1/2 top-0 h-2/3 w-40 -translate-x-1/2 blur-2xl"
        style={{ "--gw-depth": 0.28, background: "linear-gradient(180deg, rgba(255,255,255,0.9), transparent)" }}
      />
      <div className="gw-depth absolute inset-0" style={{ "--gw-depth": 0.5 }}>
        <svg
          className="gw-breathe absolute left-1/2 top-[14%] w-[min(86%,560px)] -translate-x-1/2"
          viewBox="0 0 560 420"
          fill="none"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <linearGradient id="hglass" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.55" />
              <stop offset="1" stopColor="#DCEBFF" stopOpacity="0.06" />
            </linearGradient>
            <linearGradient id="hedge" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#C4CCD6" />
              <stop offset="0.5" stopColor="#FFFFFF" />
              <stop offset="1" stopColor="#8FBCEB" />
            </linearGradient>
            <linearGradient id="hlit" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#EAF4FF" />
              <stop offset="1" stopColor="#2F6FE6" stopOpacity="0" />
            </linearGradient>
          </defs>
          {/* faint precision grid (behind) */}
          <g stroke="#2F6FE6" strokeOpacity="0.06">
            <line x1="0" y1="112" x2="560" y2="112" />
            <line x1="0" y1="164" x2="560" y2="164" />
            <line x1="0" y1="216" x2="560" y2="216" />
            <line x1="0" y1="268" x2="560" y2="268" />
            <line x1="0" y1="320" x2="560" y2="320" />
            <line x1="0" y1="372" x2="560" y2="372" />
          </g>
          {/* frosted-glass modules — varying heights */}
          <g strokeWidth="1">
            <rect x="40" y="170" width="92" height="230" rx="12" fill="url(#hglass)" stroke="url(#hedge)" strokeOpacity="0.7" />
            <rect x="150" y="90" width="104" height="310" rx="12" fill="url(#hglass)" stroke="url(#hedge)" strokeOpacity="0.85" />
            <rect x="272" y="140" width="96" height="260" rx="12" fill="url(#hglass)" stroke="url(#hedge)" strokeOpacity="0.7" />
            <rect x="384" y="60" width="120" height="340" rx="12" fill="url(#hglass)" stroke="url(#hedge)" strokeOpacity="0.9" />
          </g>
          {/* lit accent edges + top highlights */}
          <g>
            <rect x="196" y="96" width="3" height="298" rx="1.5" fill="url(#hlit)" />
            <rect x="430" y="66" width="3" height="328" rx="1.5" fill="url(#hlit)" />
            <line x1="150" y1="91" x2="254" y2="91" stroke="#FFFFFF" strokeOpacity="0.85" />
            <line x1="384" y1="61" x2="504" y2="61" stroke="#FFFFFF" strokeOpacity="0.95" />
          </g>
        </svg>
      </div>
      {/* floor reflection */}
      <div
        className="absolute inset-x-0 bottom-0 h-1/3"
        style={{ background: "linear-gradient(180deg, transparent, rgba(143,188,235,0.10))" }}
      />
    </div>
  );
}
