// components/gateway/Seam.jsx — the living light axis where the two worlds
// meet (desktop only, decorative). A 1px dual-gradient line (glacial blue up
// top, warm copper below) with a slow traveling light pulse, crowned by a
// frosted monogram disc whose conic ring rotates almost imperceptibly.
// Hovering a world crossfades the seam toward that world's hue via the
// .gw-seam-health / .gw-seam-beauty opacities (see globals.css).
export default function Seam() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-y-0 left-1/2 z-20 hidden w-px -translate-x-1/2 lg:block"
    >
      {/* base hairline */}
      <span
        className="absolute inset-0 gw-seam-line"
        style={{ background: "linear-gradient(180deg, transparent, rgba(15,23,42,0.10) 18%, rgba(15,23,42,0.10) 82%, transparent)" }}
      />
      {/* glacial half */}
      <span
        className="absolute inset-0 gw-seam-line gw-seam-health"
        style={{ background: "linear-gradient(180deg, transparent 4%, rgba(47,111,230,0.55) 30%, transparent 58%)" }}
      />
      {/* copper half */}
      <span
        className="absolute inset-0 gw-seam-line gw-seam-beauty"
        style={{ background: "linear-gradient(180deg, transparent 42%, rgba(200,125,78,0.55) 70%, transparent 96%)" }}
      />
      {/* traveling light */}
      <span className="gw-seam-pulse absolute inset-0 overflow-hidden" />

      {/* frosted monogram nexus */}
      <div className="gw-nexus absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div
          className="relative grid h-[5.5rem] w-[5.5rem] place-items-center rounded-full"
          style={{
            background: "rgba(255,255,255,0.78)",
            backdropFilter: "blur(18px)",
            WebkitBackdropFilter: "blur(18px)",
            boxShadow: "0 24px 70px -28px rgba(15,23,42,0.5), inset 0 1px 0 rgba(255,255,255,0.9)",
          }}
        >
          <span className="gw-ring-spin absolute -inset-[2px] rounded-full" style={{ padding: "2px" }}>
            <span
              className="absolute inset-0 rounded-full"
              style={{
                background: "conic-gradient(from 0deg, #2F6FE6, #6FBFEB, #F3DCBE, #C87D4E, #1C2951, #2F6FE6)",
                WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
                WebkitMaskComposite: "xor",
                maskComposite: "exclude",
                padding: "2px",
                opacity: 0.9,
              }}
            />
          </span>
          <img src="/logo-mark.png" alt="" width={40} height={40} className="object-contain" style={{ width: 40, height: 40 }} />
        </div>
      </div>
    </div>
  );
}
