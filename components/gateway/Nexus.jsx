// components/gateway/Nexus.jsx — frosted Medoria nexus on the split axis (desktop).
// A glass disc with the "M" monogram and a blue->rose gradient ring symbolising
// the two worlds meeting. Decorative; the accessible brand + choices live in the
// header and the two worlds, so this is aria-hidden and lg-only.
export default function Nexus() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute left-1/2 top-1/2 z-20 hidden -translate-x-1/2 -translate-y-1/2 lg:block"
    >
      <div
        className="relative grid h-20 w-20 place-items-center rounded-full"
        style={{
          background: "rgba(255,255,255,0.72)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          boxShadow: "0 22px 60px -26px rgba(15,23,42,0.45)",
        }}
      >
        <span
          className="absolute inset-0 rounded-full"
          style={{
            padding: "2px",
            background: "linear-gradient(135deg,#2F6FE6,#E4AFC0,#B8395E)",
            WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
            WebkitMaskComposite: "xor",
            maskComposite: "exclude",
          }}
        />
        <span className="font-display text-2xl font-extrabold" style={{ color: "#102235" }}>M</span>
      </div>
    </div>
  );
}
