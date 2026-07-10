"use client";
// components/gateway/MirrorStage.jsx — «Оинаи нур» / The Light Mirror.
// ONE full-viewport scene, TWO lights: the warm (Beauty) grading sits above
// the cool (Health) grading and is clipped at a luminous vertical seam that
// follows the pointer with spring physics. Moving the light IS choosing the
// world. Idle, the seam sways slowly around center so the page breathes on
// its own; keyboard focus pulls it toward the focused world; touch drags it;
// reduced-motion pins it at 50%. Without JS the seam rests at 50% and both
// worlds' content + links are fully present (SSR/crawlable).
import { useEffect, useRef } from "react";
import Link from "next/link";
import WorldLockup from "./WorldLockup";

export default function MirrorStage({ images, copy, defaultLang, langs, langLabels }) {
  const rootRef = useRef(null);
  const healthCtaRef = useRef(null);
  const beautyCtaRef = useRef(null);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return; // seam stays centered; clicks/links all work

    let raf = 0;
    let target = 50, current = 50;      // seam position, vw percent
    let focusHold = null;               // keyboard focus pin
    let lastInput = 0;                  // ms timestamp of last pointer/touch
    let t0 = performance.now();
    let side = null;

    const setSide = (s) => {
      if (s !== side) { side = s; s ? el.setAttribute("data-mirror", s) : el.removeAttribute("data-mirror"); }
    };

    const frame = (now) => {
      const idleFor = now - lastInput;
      // Idle breathing: a slow ±7 sway around center whenever the visitor
      // isn't steering (and no CTA holds focus).
      if (focusHold != null) {
        target = focusHold;
      } else if (idleFor > 3500) {
        target = 50 + Math.sin((now - t0) * 0.00035) * 7;
      }
      current += (target - current) * 0.07;
      el.style.setProperty("--mx", `${current.toFixed(3)}%`);
      // Content emphasis: seam pushed left exposes the warm world (beauty),
      // pushed right exposes the cool world (health).
      setSide(current < 44 ? "beauty" : current > 56 ? "health" : null);
      raf = requestAnimationFrame(frame);
    };

    const steer = (clientX) => {
      const r = el.getBoundingClientRect();
      target = Math.max(8, Math.min(92, ((clientX - r.left) / r.width) * 100));
      lastInput = performance.now();
    };
    const onPointerMove = (e) => { if (e.pointerType !== "touch") steer(e.clientX); };
    const onTouchMove = (e) => { if (e.touches[0]) steer(e.touches[0].clientX); };
    const onLeave = () => { lastInput = 0; }; // release to the idle sway
    const onKey = (e) => {
      if (e.key === "ArrowLeft") { target = Math.max(8, target - 6); lastInput = performance.now(); }
      if (e.key === "ArrowRight") { target = Math.min(92, target + 6); lastInput = performance.now(); }
    };
    const holdFor = (v) => () => { focusHold = v; };
    const release = () => { focusHold = null; lastInput = 0; };

    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("touchmove", onTouchMove, { passive: true });
    el.addEventListener("pointerleave", onLeave);
    window.addEventListener("keydown", onKey);
    const h = healthCtaRef.current, b = beautyCtaRef.current;
    h?.addEventListener("focus", holdFor(72)); h?.addEventListener("blur", release);
    b?.addEventListener("focus", holdFor(28)); b?.addEventListener("blur", release);
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("keydown", onKey);
      h?.removeEventListener("focus", holdFor(72)); h?.removeEventListener("blur", release);
      b?.removeEventListener("focus", holdFor(28)); b?.removeEventListener("blur", release);
    };
  }, []);

  const scene = (grade) =>
    images ? (
      <img
        src={grade === "cool" ? images.cool : images.warm}
        alt=""
        aria-hidden="true"
        fetchPriority="high"
        className="absolute inset-0 h-full w-full object-cover"
      />
    ) : (
      <PlaceholderScene grade={grade} />
    );

  return (
    <section
      ref={rootRef}
      aria-label="Medoria — Health ё Beauty"
      className="mirror-stage noise relative flex min-h-[100svh] flex-col overflow-hidden"
      style={{ "--mx": "50%" }}
    >
      {/* ── the two lights ────────────────────────────────────────────── */}
      <div aria-hidden="true" className="mirror-veil absolute inset-0">
        {/* cool (Health) — full frame, revealed left of the seam */}
        <div className="absolute inset-0">{scene("cool")}</div>
        {/* warm (Beauty) — clipped to the right of the seam */}
        <div className="absolute inset-0" style={{ clipPath: "inset(0 0 0 var(--mx))" }}>
          {scene("warm")}
        </div>
        {/* legibility wash top & bottom */}
        <div className="absolute inset-x-0 top-0 h-44" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.7), rgba(255,255,255,0))" }} />
        <div className="absolute inset-x-0 bottom-0 h-72" style={{ background: "linear-gradient(0deg, rgba(255,255,255,0.74) 14%, rgba(255,255,255,0))" }} />
      </div>

      {/* ── the luminous seam ─────────────────────────────────────────── */}
      <div aria-hidden="true" className="mirror-seam absolute inset-y-0" style={{ left: "var(--mx)" }}>
        <span className="mirror-seam-glow absolute inset-y-0 -left-14 w-28" />
        <span className="mirror-seam-core gw-seam-line absolute inset-y-0 -left-px w-[2px]" />
        <span className="mirror-seam-pulse absolute inset-y-0 -left-px w-[2px] overflow-hidden" />
      </div>

      {/* ── identity ──────────────────────────────────────────────────── */}
      <header className="relative z-20 flex flex-col items-center px-6 pt-9 text-center">
        <p className="gw-rise mb-2.5 text-[10px] font-bold uppercase tracking-[0.34em]" style={{ "--d": "0.9s", color: "rgb(20 28 46 / 0.62)" }}>
          {copy.eyebrow}
        </p>
        <span dir="ltr" translate="no" aria-label="Medoria" className="gw-rise inline-flex items-center gap-2.5 select-none" style={{ "--d": "1.0s" }}>
          <img src="/logo-mark.png" alt="" aria-hidden="true" width={30} height={30} style={{ width: 30, height: 30 }} className="shrink-0 object-contain" />
          <img src="/brand/gateway/medoria-health.png" alt="Medoria" width={141} height={26} fetchPriority="high" style={{ height: 26, width: "auto" }} className="object-contain" />
        </span>
        <h1 className="gw-rise mt-3.5 font-display text-[19px] font-semibold tracking-tight md:text-[21px]" style={{ "--d": "1.12s", color: "rgb(16 24 42)" }}>
          {copy.headline}
        </h1>
        <p className="gw-rise mt-1.5 text-[12.5px]" style={{ "--d": "1.24s", color: "rgb(20 28 46 / 0.6)" }}>
          {copy.hint}
        </p>
      </header>

      <div className="flex-1" />

      {/* ── the two doors ─────────────────────────────────────────────── */}
      <div className="relative z-20 grid gap-7 px-6 pb-8 md:grid-cols-2 md:gap-4 md:px-12 md:pb-12 lg:px-16">
        {/* Health — lives in the cool light (left). The gw-rise entrance runs
            on an inner wrapper: its animation-fill would otherwise pin
            opacity:1 on the door and defeat the steer-dimming rule. The
            mirror-glass panel keeps the door legible over any photography. */}
        <div data-vertical="health" className="mirror-door mirror-door-health">
        <div className="gw-rise mirror-glass flex flex-col items-center text-center md:items-start md:text-start" style={{ "--d": "1.35s" }}>
          <WorldLockup vertical="health" height={34} />
          <p className="mt-3 max-w-sm text-[13.5px] leading-relaxed" style={{ color: "rgb(22 34 56 / 0.78)" }}>
            {copy.health.tagline}
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3 md:justify-start">
            <Link
              ref={healthCtaRef}
              href={`/health/${defaultLang}`}
              className="v-btn v-focus group/cta inline-flex items-center gap-2.5 rounded-full px-6 py-3 text-[14.5px] font-semibold"
            >
              {copy.health.cta}
              <span aria-hidden="true" className="transition-transform duration-300 group-hover/cta:translate-x-1">→</span>
            </Link>
            <ul className="flex items-center gap-1.5">
              {langs.map((code) => (
                <li key={code}>
                  <Link
                    href={`/health/${code}`}
                    className="v-focus rounded-md px-2 py-1 text-[11.5px] font-semibold transition-colors hover:text-[color:var(--v-accent)]"
                    style={{ color: "rgb(22 34 56 / 0.6)", border: "1px solid rgb(22 34 56 / 0.16)" }}
                  >
                    {langLabels[code]}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
        </div>

        {/* Beauty — lives in the warm light (right) */}
        <div data-vertical="beauty" className="mirror-door mirror-door-beauty">
        <div className="gw-rise mirror-glass flex flex-col items-center text-center md:items-end md:text-end" style={{ "--d": "1.45s" }}>
          <WorldLockup vertical="beauty" height={34} />
          <p className="mt-3 max-w-sm text-[13.5px] leading-relaxed" style={{ color: "rgb(48 34 22 / 0.78)" }}>
            {copy.beauty.tagline}
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3 md:flex-row-reverse md:justify-start">
            <Link
              ref={beautyCtaRef}
              href={`/beauty/${defaultLang}`}
              className="v-btn v-focus group/cta inline-flex items-center gap-2.5 rounded-full px-6 py-3 text-[14.5px] font-semibold"
            >
              {copy.beauty.cta}
              <span aria-hidden="true" className="transition-transform duration-300 group-hover/cta:translate-x-1">→</span>
            </Link>
            <ul className="flex items-center gap-1.5">
              {langs.map((code) => (
                <li key={code}>
                  <Link
                    href={`/beauty/${code}`}
                    className="v-focus rounded-md px-2 py-1 text-[11.5px] font-semibold transition-colors hover:text-[color:var(--v-accent)]"
                    style={{ color: "rgb(48 34 22 / 0.6)", border: "1px solid rgb(48 34 22 / 0.16)" }}
                  >
                    {langLabels[code]}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
        </div>
      </div>

      <footer className="gw-rise relative z-20 flex items-center justify-center gap-3 px-6 pb-5 text-center text-[11px]" style={{ "--d": "1.6s", color: "rgb(20 28 46 / 0.55)" }}>
        <span>© {new Date().getFullYear()} Medoria</span>
        <span aria-hidden="true" className="h-3 w-px" style={{ background: "rgb(20 28 46 / 0.2)" }} />
        <span dir="ltr" translate="no">Health · Beauty</span>
      </footer>
    </section>
  );
}

// Built-in CSS grading stand-in — the SAME abstract light composition in two
// temperatures, so the wipe stays perfectly aligned until real photography
// lands in /public/images/gateway/. Deliberately quiet: light, marble haze,
// a low horizon shadow — a stage waiting for its still life.
function PlaceholderScene({ grade }) {
  const cool = grade === "cool";
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0"
      style={{
        background: cool
          ? "linear-gradient(180deg, #F4F8FC 0%, #E9F1F8 46%, #D8E5F0 74%, #C9D9E8 100%)"
          : "linear-gradient(180deg, #FBF4EA 0%, #F6E9D8 46%, #ECD7BC 74%, #DFC5A4 100%)",
      }}
    >
      {/* volumetric key light */}
      <div
        className="absolute inset-0"
        style={{
          background: cool
            ? "radial-gradient(90% 70% at 22% 8%, rgba(255,255,255,0.95), transparent 62%)"
            : "radial-gradient(90% 70% at 78% 8%, rgba(255,252,244,0.95), transparent 62%)",
        }}
      />
      {/* far light shaft */}
      <div
        className="absolute top-0 h-[78%] w-[34%] blur-3xl"
        style={{
          left: cool ? "8%" : "58%",
          background: cool
            ? "linear-gradient(192deg, rgba(214,232,248,0.85), rgba(150,190,225,0.0) 80%)"
            : "linear-gradient(168deg, rgba(250,232,205,0.9), rgba(222,178,120,0.0) 80%)",
        }}
      />
      {/* marble haze bands */}
      <div
        className="absolute inset-0 opacity-40"
        style={{
          background: cool
            ? "repeating-linear-gradient(104deg, transparent 0 140px, rgba(148,178,205,0.10) 140px 220px, transparent 220px 380px)"
            : "repeating-linear-gradient(76deg, transparent 0 140px, rgba(205,164,112,0.10) 140px 220px, transparent 220px 380px)",
        }}
      />
      {/* table line + falling shadow of the (future) still life */}
      <div className="absolute inset-x-0 bottom-[26%] h-px" style={{ background: cool ? "rgba(96,128,160,0.34)" : "rgba(160,118,70,0.34)" }} />
      <div
        className="absolute bottom-[13%] left-1/2 h-[20%] w-[64%] -translate-x-1/2 rounded-[100%] blur-2xl"
        style={{ background: cool ? "rgba(84,118,152,0.24)" : "rgba(150,104,56,0.24)" }}
      />
    </div>
  );
}
