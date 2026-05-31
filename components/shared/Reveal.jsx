// components/shared/Reveal.jsx — scroll-reveal + stagger primitives (Framer Motion).
// Direction-agnostic (only opacity + Y), so RTL/LTR are unaffected.
// Fully respects prefers-reduced-motion (renders final state, no animation).
"use client";
import { motion, useReducedMotion } from "framer-motion";

const EASE = [0.2, 0.8, 0.2, 1];

export function Reveal({ children, delay = 0, y = 22, once = true, className = "" }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y }}
      whileInView={reduce ? {} : { opacity: 1, y: 0 }}
      viewport={{ once, margin: "-80px" }}
      transition={{ duration: 0.6, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  );
}

export function Stagger({ children, className = "", gap = 0.08, once = true }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once, margin: "-60px" }}
      variants={{ hidden: {}, show: { transition: { staggerChildren: reduce ? 0 : gap } } }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className = "", y = 20 }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      variants={{
        hidden: reduce ? {} : { opacity: 0, y },
        show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
      }}
    >
      {children}
    </motion.div>
  );
}

export default Reveal;
