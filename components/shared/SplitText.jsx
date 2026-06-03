// components/shared/SplitText.jsx — reveal a heading word-by-word (rise + fade).
// Reduced-motion safe (renders plain text). Keeps an aria-label for screen readers.
"use client";
import { motion, useReducedMotion } from "framer-motion";

const EASE = [0.2, 0.8, 0.2, 1];

export default function SplitText({ text, className = "", delay = 0, stagger = 0.06 }) {
  const reduce = useReducedMotion();
  const str = String(text ?? "");
  if (reduce) return <span className={className}>{str}</span>;
  const words = str.split(" ");
  return (
    <span className={className} aria-label={str}>
      {words.map((w, i) => (
        <span key={i} className="inline-block overflow-hidden align-bottom" aria-hidden="true">
          <motion.span
            className="inline-block"
            initial={{ y: "110%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.6, ease: EASE, delay: delay + i * stagger }}
          >
            {w}
            {i < words.length - 1 ? " " : ""}
          </motion.span>
        </span>
      ))}
    </span>
  );
}
