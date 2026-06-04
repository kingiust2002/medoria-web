// components/shared/Globe.jsx — lightweight CSS/SVG globe (no WebGL, no deps).
// Renders everywhere, screenshot-friendly, and far lighter than a WebGL globe.
// A wireframe sphere + slow orbit rings + a pulsing Dushanbe marker.

const NODES = [
  ["28%", "44%"], ["70%", "36%"], ["62%", "62%"], ["40%", "30%"], ["75%", "55%"], ["34%", "66%"],
];

export default function Globe() {
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[440px]">
      {/* atmosphere glow */}
      <div className="absolute inset-[6%] rounded-full blur-2xl"
           style={{ background: "radial-gradient(circle, rgba(56,130,246,0.5), transparent 70%)" }} />

      {/* rotating orbit rings */}
      <div className="absolute inset-[-3%] animate-spin-slow">
        <div className="absolute left-1/2 top-1/2 h-[42%] w-[114%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border border-cyan-400/20" />
      </div>
      <div className="absolute inset-[-3%] animate-spin-slow" style={{ animationDirection: "reverse", animationDuration: "26s" }}>
        <div className="absolute left-1/2 top-1/2 h-[112%] w-[44%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border border-brand-pink/15" />
      </div>

      {/* sphere */}
      <div className="absolute inset-[10%] rounded-full overflow-hidden border border-white/10"
           style={{
             background: "radial-gradient(circle at 32% 26%, #28336e 0%, #141b40 46%, #0a0f26 100%)",
             boxShadow: "inset -20px -26px 60px rgba(0,0,0,0.65), inset 16px 18px 48px rgba(90,140,250,0.22), 0 24px 60px -20px rgba(40,90,200,0.5)",
           }}>
        {/* graticule */}
        <svg viewBox="0 0 200 200" className="absolute inset-0 h-full w-full text-cyan-300/25">
          <g fill="none" stroke="currentColor" strokeWidth="0.6">
            <circle cx="100" cy="100" r="96" />
            <ellipse cx="100" cy="100" rx="96" ry="13" />
            <ellipse cx="100" cy="68" rx="90" ry="9" />
            <ellipse cx="100" cy="132" rx="90" ry="9" />
            <ellipse cx="100" cy="40" rx="75" ry="5" />
            <ellipse cx="100" cy="160" rx="75" ry="5" />
            <line x1="100" y1="4" x2="100" y2="196" />
            <ellipse cx="100" cy="100" rx="62" ry="96" />
            <ellipse cx="100" cy="100" rx="28" ry="96" />
          </g>
        </svg>

        {/* network nodes */}
        {NODES.map(([left, top], i) => (
          <span key={i} className="absolute h-1 w-1 rounded-full bg-cyan-300/70 shadow-[0_0_6px_rgba(103,232,249,0.8)]" style={{ left, top }} />
        ))}

        {/* specular highlight */}
        <div className="absolute inset-0 rounded-full" style={{ background: "radial-gradient(circle at 30% 24%, rgba(255,255,255,0.18), transparent 38%)" }} />
      </div>

      {/* Dushanbe marker */}
      <span className="absolute" style={{ left: "57%", top: "41%" }}>
        <span className="relative flex h-3 w-3">
          <span className="absolute inline-flex h-full w-full rounded-full bg-brand-pink opacity-70 animate-ping" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-brand-pink shadow-[0_0_12px_rgba(240,40,158,0.95)]" />
        </span>
      </span>
      <span className="absolute -translate-y-1/2 text-[10px] font-semibold text-white/90 bg-white/10 backdrop-blur px-2 py-0.5 rounded-full border border-white/15 whitespace-nowrap"
            style={{ left: "61%", top: "41%" }}>
        Dushanbe
      </span>
    </div>
  );
}
