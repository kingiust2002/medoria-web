"use client";
// components/gateway/WorldPanel.jsx — one living world on the gateway stage.
// Server-rendered HTML stays complete and crawlable (links, copy, lockup);
// JS only layers on desktop-pointer physics:
//   · pointer parallax — lerps --gwx/--gwy on the section, scene layers
//     multiply them by their --gw-depth (see globals.css)
//   · magnetic CTA — the button leans toward a near cursor and springs home
//   · sparse three.js dust — dynamic import behind motion/save-data/core gates
// The ~55/45 hover & focus expansion stays CSS-only (works without JS).
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import WorldLockup from "./WorldLockup";

const GatewayDust = dynamic(() => import("./GatewayDust"), { ssr: false });

export default function WorldPanel({
  vertical,
  side,
  scene,
  edgeLabel,
  chip,
  tagline,
  cta,
  defaultLang,
  langs,
  langLabels,
  onActive,
}) {
  const rootRef = useRef(null);
  const ctaRef = useRef(null);
  const [dustCount, setDustCount] = useState(0);

  // desktop-only enhancement gates (mirrors the vertical heroes' discipline)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const saveData = navigator.connection?.saveData;
    const cores = navigator.hardwareConcurrency || 8;
    const desktop = window.innerWidth >= 1024;
    if (desktop && !reduced && !saveData && cores >= 4) {
      setDustCount(cores >= 8 ? 850 : 600);
    }
  }, []);

  // pointer physics — one rAF per panel, alive only while the pointer is
  // inside (plus the settle-out), so an idle gateway costs zero frames.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!fine || reduced || window.innerWidth < 1024) return;

    let raf = 0, running = false;
    let tx = 0, ty = 0, cx = 0, cy = 0;         // parallax target/current (px)
    let mtx = 0, mty = 0, mcx = 0, mcy = 0;     // magnet target/current (px)

    const frame = () => {
      cx += (tx - cx) * 0.075; cy += (ty - cy) * 0.075;
      mcx += (mtx - mcx) * 0.14; mcy += (mty - mcy) * 0.14;
      el.style.setProperty("--gwx", `${cx.toFixed(2)}px`);
      el.style.setProperty("--gwy", `${cy.toFixed(2)}px`);
      if (ctaRef.current) ctaRef.current.style.transform = `translate3d(${mcx.toFixed(2)}px, ${mcy.toFixed(2)}px, 0)`;
      const settled =
        Math.abs(tx - cx) < 0.05 && Math.abs(ty - cy) < 0.05 &&
        Math.abs(mtx - mcx) < 0.05 && Math.abs(mty - mcy) < 0.05;
      if (settled && tx === 0 && ty === 0 && mtx === 0 && mty === 0) { running = false; return; }
      raf = requestAnimationFrame(frame);
    };
    const wake = () => { if (!running) { running = true; raf = requestAnimationFrame(frame); } };

    const onMove = (e) => {
      const r = el.getBoundingClientRect();
      tx = ((e.clientX - r.left) / r.width - 0.5) * 22;
      ty = ((e.clientY - r.top) / r.height - 0.5) * 16;
      const c = ctaRef.current;
      if (c) {
        const cr = c.getBoundingClientRect();
        const dx = e.clientX - (cr.left + cr.width / 2);
        const dy = e.clientY - (cr.top + cr.height / 2);
        const d = Math.hypot(dx, dy);
        const R = 150;
        if (d < R) {
          const pull = (1 - d / R) * 0.34;
          mtx = Math.max(-12, Math.min(12, dx * pull));
          mty = Math.max(-10, Math.min(10, dy * pull));
        } else { mtx = 0; mty = 0; }
      }
      wake();
    };
    const onLeave = () => { tx = 0; ty = 0; mtx = 0; mty = 0; wake(); };

    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  const open = side === "left" ? "gw-open-left" : "gw-open-right";

  return (
    <section
      ref={rootRef}
      data-vertical={vertical}
      data-world={vertical}
      onPointerEnter={() => onActive?.(vertical)}
      onPointerLeave={() => onActive?.(null)}
      onFocusCapture={() => onActive?.(vertical)}
      onBlurCapture={() => onActive?.(null)}
      className={`group/world relative isolate flex min-h-[46svh] flex-1 items-center justify-center overflow-hidden px-6 py-14 lg:min-h-0 lg:py-16 ${open} transition-[flex-grow] duration-700 [transition-timing-function:var(--ease-lux)] motion-safe:lg:hover:grow-[1.22] motion-safe:lg:focus-within:grow-[1.22]`}
      style={{ background: "rgb(var(--v-canvas))" }}
    >
      {scene}
      {dustCount > 0 && <GatewayDust vertical={vertical} particleCount={dustCount} />}

      {/* decorative Latin edge label (rotated) */}
      <span
        aria-hidden="true"
        className={`gw-rise absolute top-1/2 hidden -translate-y-1/2 text-[10px] font-bold uppercase tracking-[0.3em] lg:block ${side === "left" ? "left-5" : "right-5"}`}
        style={{
          "--d": "1.5s",
          writingMode: "vertical-rl",
          transform: side === "left" ? "rotate(180deg)" : "none",
          color: "rgb(var(--v-ink-muted) / 0.55)",
        }}
      >
        {edgeLabel}
      </span>

      <div className="relative z-10 flex max-w-md flex-col items-center text-center">
        <span
          className="gw-rise mb-6 inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.22em]"
          style={{
            "--d": "0.85s",
            color: "var(--v-accent)",
            border: "1px solid rgb(var(--v-ring))",
            background: "rgb(var(--v-surface) / 0.55)",
          }}
        >
          <span aria-hidden="true" className="h-1 w-1 rounded-full" style={{ background: "var(--v-accent)" }} />
          {chip}
        </span>

        <span className="gw-rise" style={{ "--d": "0.95s" }}>
          <WorldLockup vertical={vertical} height={40} />
        </span>

        <p
          className="gw-rise mt-5 max-w-xs text-[15px] leading-relaxed"
          style={{ "--d": "1.05s", color: "rgb(var(--v-ink-muted))" }}
        >
          {tagline}
        </p>

        <span className="gw-rise mt-8" style={{ "--d": "1.15s" }}>
          <Link
            ref={ctaRef}
            href={`/${vertical}/${defaultLang}`}
            className="v-btn v-focus group/cta inline-flex items-center gap-2.5 rounded-full px-7 py-3.5 text-[15px] font-semibold will-change-transform"
          >
            {cta}
            <span aria-hidden="true" className="transition-transform duration-300 group-hover/cta:translate-x-1">→</span>
          </Link>
        </span>

        <ul className="gw-rise mt-7 flex items-center gap-2" style={{ "--d": "1.25s" }}>
          {langs.map((code) => (
            <li key={code}>
              <Link
                href={`/${vertical}/${code}`}
                className="v-focus rounded-md px-2.5 py-1 text-[12px] font-semibold transition-colors hover:text-[color:var(--v-accent)]"
                style={{ color: "rgb(var(--v-ink-muted))", border: "1px solid rgb(var(--v-line))" }}
              >
                {langLabels[code]}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
