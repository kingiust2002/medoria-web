// components/shared/CountUp.jsx — count a number up when it scrolls into view.
// Works for Latin AND Persian/Arabic digits (e.g. "+۵۰۰", "1000+", "۲۴"); values
// that aren't a plain number (e.g. "B2B", "24/7") render unchanged. Reduced-motion safe.
"use client";
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";

const FA = "۰۱۲۳۴۵۶۷۸۹";
const AR = "٠١٢٣٤٥٦٧٨٩";
const toLatin = (s) =>
  s.replace(/[۰-۹٠-٩]/g, (d) => {
    const i = FA.indexOf(d);
    if (i > -1) return String(i);
    const j = AR.indexOf(d);
    return j > -1 ? String(j) : d;
  });
const toFa = (s) => s.replace(/[0-9]/g, (d) => FA[+d]);

export default function CountUp({ value, duration = 1500, className = "" }) {
  const reduce = useReducedMotion();
  const ref = useRef(null);
  const fired = useRef(false);
  const [shown, setShown] = useState(String(value));

  useEffect(() => {
    const raw = String(value);
    const isFa = /[۰-۹٠-٩]/.test(raw);
    // Only animate a clean number with optional +/- prefix and +/% suffix.
    const m = toLatin(raw).match(/^([+\-]?)(\d[\d,]*)([+%]?)$/);
    const target = m ? parseInt(m[2].replace(/,/g, ""), 10) : NaN;
    if (reduce || !m || !Number.isFinite(target)) { setShown(raw); return; }
    const [, prefix, , suffix] = m;
    const fmt = (n) => {
      const body = `${prefix}${n.toLocaleString("en-US")}${suffix}`;
      return isFa ? toFa(body) : body;
    };

    const el = ref.current;
    if (!el) { setShown(raw); return; }
    setShown(fmt(0));
    const io = new IntersectionObserver((entries) => {
      if (!entries[0].isIntersecting || fired.current) return;
      fired.current = true;
      io.disconnect();
      const start = performance.now();
      const tick = (now) => {
        const t = Math.min(1, (now - start) / duration);
        setShown(fmt(Math.round(target * (1 - Math.pow(1 - t, 3)))));
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, [value, reduce, duration]);

  return <span ref={ref} className={className}>{shown}</span>;
}
