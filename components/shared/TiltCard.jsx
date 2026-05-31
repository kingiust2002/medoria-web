// components/shared/TiltCard.jsx
// Premium hover depth: subtle 3D tilt toward the cursor + a soft spotlight that
// follows the pointer. Pure Framer + CSS vars (no new deps). Touch devices have
// no hover so it stays flat; fully disabled under prefers-reduced-motion.
"use client";
import { useRef, useState } from "react";
import { motion, useMotionValue, useSpring, useTransform, useReducedMotion } from "framer-motion";

export default function TiltCard({ children, className = "", max = 7, glow = true, glowColor = "rgba(139,47,247,0.16)" }) {
  const reduce = useReducedMotion();
  const ref = useRef(null);
  const [hover, setHover] = useState(false);
  const mx = useMotionValue(0.5), my = useMotionValue(0.5);
  const sx = useSpring(mx, { stiffness: 140, damping: 18 });
  const sy = useSpring(my, { stiffness: 140, damping: 18 });
  const rotX = useTransform(sy, [0, 1], [max, -max]);
  const rotY = useTransform(sx, [0, 1], [-max, max]);

  const onMove = (e) => {
    if (reduce || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    mx.set(px); my.set(py);
    ref.current.style.setProperty("--mx", `${px * 100}%`);
    ref.current.style.setProperty("--my", `${py * 100}%`);
  };
  const reset = () => { mx.set(0.5); my.set(0.5); setHover(false); };

  return (
    <motion.div
      ref={ref}
      onMouseMove={onMove}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={reset}
      style={reduce ? undefined : { rotateX: rotX, rotateY: rotY, transformPerspective: 900 }}
      className={`relative [transform-style:preserve-3d] ${className}`}
    >
      {children}
      {glow && !reduce && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-[inherit] transition-opacity duration-300 z-10"
          style={{
            opacity: hover ? 1 : 0,
            background: `radial-gradient(240px circle at var(--mx,50%) var(--my,50%), ${glowColor}, transparent 60%)`,
          }}
        />
      )}
    </motion.div>
  );
}
