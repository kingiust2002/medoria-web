// components/shared/SpotlightCard.jsx — a soft glow that follows the cursor.
// Wrap any rounded card; pass the same rounding in className (e.g. "rounded-2xl").
"use client";
import { useRef } from "react";

export default function SpotlightCard({ children, className = "", glow = "rgba(139,47,247,0.18)" }) {
  const ref = useRef(null);
  const onMove = (e) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - r.left}px`);
    el.style.setProperty("--my", `${e.clientY - r.top}px`);
  };
  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      className={`group/spot relative ${className}`}
      style={{ "--mx": "50%", "--my": "50%" }}
    >
      {children}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-300 group-hover/spot:opacity-100"
        style={{ background: `radial-gradient(240px circle at var(--mx) var(--my), ${glow}, transparent 70%)` }}
      />
    </div>
  );
}
