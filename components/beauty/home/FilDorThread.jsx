"use client";
// components/beauty/home/FilDorThread.jsx — «Fil d'Or», the season signature:
// a single copper thread (SVG) drawn by scroll that stitches the Beauty home
// together — hero → worlds → vitrine → partnership → the final knot at the CTA.
// It renders the literal business story: the supply thread from world brands
// to the salon's shelf.
//
// Decorative only, so it holds the strictest gates:
//   · client-effect only — SSR/JS-off HTML contains just an empty overlay div;
//   · lg+ viewports only (the thread lives in the desktop margin gutter);
//   · prefers-reduced-motion → fully drawn, static, all nodes lit;
//   · pointer-events:none + aria-hidden — never interactive, never read;
//   · no libraries — one rAF-throttled scroll listener, detached on unmount.
import { useEffect, useRef } from "react";

const GUTTER = 34;      // px between a station anchor and the thread line
const SWING = 44;       // horizontal bow of each bezier segment
const NODE_R = 4;

export default function FilDorThread() {
  const rootRef = useRef(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !root.parentElement) return;
    const parent = root.parentElement;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let svg = null;
    let path = null;
    let circles = [];
    let pts = [];
    let len = 0;
    let raf = 0;
    let resizeTimer = 0;

    const clear = () => {
      if (svg) { svg.remove(); svg = null; path = null; circles = []; pts = []; len = 0; }
    };

    const measure = () => {
      clear();
      if (!window.matchMedia("(min-width: 1024px)").matches) return;
      const anchors = parent.querySelectorAll("[data-fil-node]");
      if (anchors.length < 2) return;

      const pr = parent.getBoundingClientRect();
      const rtl = getComputedStyle(parent).direction === "rtl";
      pts = Array.from(anchors).map((el) => {
        const r = el.getBoundingClientRect();
        const x = rtl ? r.right - pr.left + GUTTER : r.left - pr.left - GUTTER;
        return {
          x: Math.min(Math.max(x, 10), pr.width - 10),
          y: r.top - pr.top + r.height / 2,
        };
      }).sort((a, b) => a.y - b.y);

      const sw = rtl ? -SWING : SWING;
      let d = `M ${pts[0].x} ${pts[0].y}`;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        const dy = (b.y - a.y) * 0.45;
        const bow = i % 2 ? sw : -sw;
        d += ` C ${a.x + bow} ${a.y + dy}, ${b.x - bow} ${b.y - dy}, ${b.x} ${b.y}`;
      }

      const NS = "http://www.w3.org/2000/svg";
      svg = document.createElementNS(NS, "svg");
      svg.setAttribute("viewBox", `0 0 ${pr.width} ${Math.max(Math.round(pr.height), 1)}`);
      svg.setAttribute("preserveAspectRatio", "none");

      const defs = document.createElementNS(NS, "defs");
      const grad = document.createElementNS(NS, "linearGradient");
      grad.setAttribute("id", "bvFilGrad");
      grad.setAttribute("x1", "0"); grad.setAttribute("y1", "0");
      grad.setAttribute("x2", "0"); grad.setAttribute("y2", "1");
      [["0", "#C87D4E"], ["1", "#EFC894"]].forEach(([off, col]) => {
        const stop = document.createElementNS(NS, "stop");
        stop.setAttribute("offset", off);
        stop.setAttribute("stop-color", col);
        grad.appendChild(stop);
      });
      defs.appendChild(grad);
      svg.appendChild(defs);

      path = document.createElementNS(NS, "path");
      path.setAttribute("d", d);
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", "url(#bvFilGrad)");
      path.setAttribute("stroke-width", "1.5");
      path.setAttribute("stroke-linecap", "round");
      svg.appendChild(path);

      circles = pts.map((p, i) => {
        const last = i === pts.length - 1;
        const g = document.createElementNS(NS, "g");
        g.setAttribute("class", "bv-node");
        const c = document.createElementNS(NS, "circle");
        c.setAttribute("cx", p.x); c.setAttribute("cy", p.y);
        c.setAttribute("r", last ? NODE_R + 1.5 : NODE_R);
        c.setAttribute("fill", "#C87D4E");
        g.appendChild(c);
        if (last) {
          // the knot: a fine ring around the final node at the CTA
          const ring = document.createElementNS(NS, "circle");
          ring.setAttribute("cx", p.x); ring.setAttribute("cy", p.y);
          ring.setAttribute("r", NODE_R + 6.5);
          ring.setAttribute("fill", "none");
          ring.setAttribute("stroke", "#C87D4E");
          ring.setAttribute("stroke-width", "1");
          g.appendChild(ring);
        }
        svg.appendChild(g);
        return g;
      });

      root.appendChild(svg);
      len = path.getTotalLength();
      path.style.strokeDasharray = `${len}`;
      draw();
    };

    const draw = () => {
      if (!path || !pts.length) return;
      let p = 1;
      if (!reduce) {
        const pr = parent.getBoundingClientRect();
        const firstY = pr.top + pts[0].y;
        const lastY = pr.top + pts[pts.length - 1].y;
        // the thread tip tracks a line at 72% of the viewport height
        const tip = window.innerHeight * 0.72;
        p = Math.min(Math.max((tip - firstY) / Math.max(lastY - firstY, 1), 0), 1);
      }
      path.style.strokeDashoffset = `${len * (1 - p)}`;
      const reachY = pts[0].y + p * (pts[pts.length - 1].y - pts[0].y);
      circles.forEach((g, i) => {
        g.classList.toggle("lit", pts[i].y <= reachY + 1);
      });
    };

    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => { raf = 0; draw(); });
    };
    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(measure, 250);
    };

    measure();
    if (!reduce) window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(onResize) : null;
    if (ro) ro.observe(parent);

    return () => {
      if (!reduce) window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      if (ro) ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
      clearTimeout(resizeTimer);
      clear();
    };
  }, []);

  return <div ref={rootRef} aria-hidden="true" className="bv-thread hidden lg:block" />;
}
