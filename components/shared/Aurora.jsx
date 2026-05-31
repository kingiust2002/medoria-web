// components/shared/Aurora.jsx
// Animated brand-coloured aurora blobs — a soft, premium background glow.
// Purely decorative; never intercepts pointer events.

export default function Aurora({ className = "", variant = "light" }) {
  const tones =
    variant === "dark"
      ? {
          pink:   "rgba(236,30,149,0.45)",
          violet: "rgba(139,47,247,0.40)",
          blue:   "rgba(37,99,235,0.40)",
          cyan:   "rgba(6,182,212,0.38)",
        }
      : {
          pink:   "rgba(236,30,149,0.16)",
          violet: "rgba(139,47,247,0.14)",
          blue:   "rgba(37,99,235,0.12)",
          cyan:   "rgba(6,182,212,0.14)",
        };

  return (
    <div className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`} aria-hidden="true">
      <div
        className="blob w-[42vw] h-[42vw] -top-[10%] -start-[8%] animate-aurora"
        style={{ background: `radial-gradient(circle, ${tones.pink} 0%, transparent 70%)` }}
      />
      <div
        className="blob w-[40vw] h-[40vw] top-[6%] -end-[10%] animate-aurora"
        style={{ background: `radial-gradient(circle, ${tones.cyan} 0%, transparent 70%)`, animationDelay: "3s" }}
      />
      <div
        className="blob w-[46vw] h-[46vw] -bottom-[18%] start-[18%] animate-aurora"
        style={{ background: `radial-gradient(circle, ${tones.violet} 0%, transparent 70%)`, animationDelay: "6s" }}
      />
      <div
        className="blob w-[34vw] h-[34vw] bottom-[2%] end-[12%] animate-aurora"
        style={{ background: `radial-gradient(circle, ${tones.blue} 0%, transparent 70%)`, animationDelay: "9s" }}
      />
    </div>
  );
}
