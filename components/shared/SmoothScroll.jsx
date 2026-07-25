// components/shared/SmoothScroll.jsx — buttery momentum scrolling (desktop wheel).
// Touch stays native (Lenis default), and it's fully disabled under reduced-motion.
//
// Lenis is imported DYNAMICALLY, inside the effect and after the gates below,
// rather than at the top of the module. This component mounts from
// app/providers.jsx, which lives in the ROOT layout — a static import therefore
// put Lenis in the shared client bundle of every single page on the site,
// including the pages where these gates mean it never runs at all. Loading it on
// demand keeps it out of the initial JS for coarse-pointer (touch) and
// reduced-motion visitors entirely, which covers most of our mobile audience.
"use client";
import { useEffect } from "react";

export default function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Momentum scrolling only augments WHEEL input — touch scrolling is already
    // native and left untouched — so there is nothing to gain from shipping the
    // library to a touch-primary device.
    if (window.matchMedia("(hover: none) and (pointer: coarse)").matches) return;

    let cancelled = false;
    let raf;
    let lenis;

    import("lenis")
      .then(({ default: Lenis }) => {
        if (cancelled) return;
        lenis = new Lenis({
          duration: 1.05,
          easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
          smoothWheel: true,
          wheelMultiplier: 1,
          touchMultiplier: 1.6,
        });
        const loop = (time) => { lenis.raf(time); raf = requestAnimationFrame(loop); };
        raf = requestAnimationFrame(loop);
      })
      .catch(() => { /* momentum scroll is a nicety — never break the page for it */ });

    return () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
      if (lenis) lenis.destroy();
    };
  }, []);
  return null;
}
