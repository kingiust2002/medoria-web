// components/shared/ScrollProgress.jsx — thin gradient reading-progress bar.
"use client";
import { useEffect, useState } from "react";

export default function ScrollProgress() {
  const [p, setP] = useState(0);
  useEffect(() => {
    const el = document.documentElement;
    const update = () => {
      const max = el.scrollHeight - el.clientHeight;
      setP(max > 4 ? Math.min(100, (el.scrollTop / max) * 100) : 0);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <div className="fixed top-0 inset-x-0 z-[80] h-[3px] pointer-events-none" aria-hidden="true">
      <div
        className="h-full bg-brand-gradient shadow-[0_0_10px_rgba(166,52,232,0.6)] transition-[width] duration-150 ease-out"
        style={{ width: `${p}%` }}
      />
    </div>
  );
}
