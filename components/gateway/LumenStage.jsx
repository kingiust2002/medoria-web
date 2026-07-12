"use client";
// components/gateway/LumenStage.jsx — «LUMEN GATE» / the Medoria Aperture,
// motion system «Оптика» / THE COUNTER-LENS.
// ONE full-viewport still-life scene, TWO lights, and two optical instruments:
//   · The LIGHT-BLADE — the boundary between the worlds is a living curve: it
//     bows toward wherever the light is being pulled (gaussian bend, physical
//     springs, chromatic cool/warm fringes) and flares with pointer velocity.
//     Rendered as an SVG light path + a matching polygon clip on the warm
//     grading; the straight CSS seam plays the entrance, then hands over.
//   · The COUNTER-LENS — on fine pointers the cursor becomes a glass loupe
//     that reveals the OPPOSITE world: over the glacial side you peer into
//     champagne, over champagne you peer into glacial (slightly magnified,
//     spring-weighted). It retires politely over plaques/links.
// Hover/focus on a world's plaque floods that world to ~62% while the other
// stays present and respected; idle, the aperture breathes around center.
// The engine sleeps when everything settles, and pauses on tab-hide and
// offscreen. Optional cinemagraph loops (lib/gateway/media.js) mount only
// after the entrance, on ≥1024px screens, with motion/data/core gating, and
// fall back to the posters silently. Without JS the aperture rests straight
// at 50% and every link/CTA is fully present (SSR/crawlable, never
// auto-forwards); reduced motion pins everything static.
import { forwardRef, useEffect, useRef, useState } from "react";
import Link from "next/link";
import WorldLockup from "./WorldLockup";

const clamp = (min, max, v) => Math.max(min, Math.min(max, v));
const LENS_R = 96; // px radius of the counter-lens

export default function LumenStage({ media, copy, defaultLang, langs, langLabels, langDirs, year }) {
  const rootRef = useRef(null);
  const healthDoorRef = useRef(null);
  const beautyDoorRef = useRef(null);
  const warmClipRef = useRef(null);
  const bladeRef = useRef(null);
  const bladeCoolRef = useRef(null);
  const bladeWarmRef = useRef(null);
  const bladeCoreRef = useRef(null);
  const lensRef = useRef(null);
  const lensCanvasRef = useRef(null);
  const [videoOn, setVideoOn] = useState(false);

  // ── the optics engine ────────────────────────────────────────────────────
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return; // static 50/50

    const finePointer = window.matchMedia("(pointer: fine)").matches;
    const wide = window.matchMedia("(min-width: 768px)").matches;
    const warmClip = warmClipRef.current;
    const blade = bladeRef.current;
    const bladePaths = [bladeCoolRef.current, bladeWarmRef.current, bladeCoreRef.current].filter(Boolean);
    const lens = finePointer ? lensRef.current : null;
    const lensCanvas = lensCanvasRef.current;

    // Magnetic plaque CTAs: each invitation subtly reaches toward the hand.
    const magnets = [healthDoorRef.current, beautyDoorRef.current]
      .map((door) => door?.querySelector(".lumen-cta"))
      .filter(Boolean)
      .map((node) => ({ el: node, left: 0, top: 0, w: 0, h: 0, x: 0, y: 0, vx: 0, vy: 0 }));

    let rect = { left: 0, top: 0, width: 1, height: 1 };
    const measure = () => {
      const r = el.getBoundingClientRect();
      rect = { left: r.left, top: r.top, width: r.width, height: r.height };
      blade?.setAttribute("viewBox", `0 0 ${Math.max(1, Math.round(rect.width))} ${Math.max(1, Math.round(rect.height))}`);
      if (lensCanvas) {
        lensCanvas.style.width = `${rect.width}px`;
        lensCanvas.style.height = `${rect.height}px`;
      }
      for (const m of magnets) {
        const b = m.el.getBoundingClientRect();
        m.left = b.left - rect.left;
        m.top = b.top - rect.top;
        m.w = b.width;
        m.h = b.height;
      }
    };
    measure();

    // Springs: aperture position, blade bend + bend altitude, lens x/y/scale,
    // velocity flare. All integrated per-frame with dt-clamped physics.
    let pos = 50, vel = 0, target = 50;
    let pointerPct = 50, pointerFresh = false; // raw pointer x% — the blade bows toward the hand
    let pointerOn = false;                     // a fine pointer is over the stage right now
    let bend = 0, bendVel = 0;
    let cy = 50, cyVel = 0, cyTarget = 50;
    let parX = 0, parVX = 0, parY = 0, parVY = 0; // heavy-lag scene depth (vitrine parallax)
    let flare = 0, flareT = 0;
    let lx = 0, ly = 0, ltx = 0, lty = 0, lvx = 0, lvy = 0, lensSeeded = false;
    let ls = 0, lsv = 0, lst = 0;
    let lensSide = "", lensAttr = false;
    let hold = null;                    // plaque hover/focus pin (62 health / 38 beauty)
    let live = false;
    let raf = 0, last = 0;
    let visible = !document.hidden, onscreen = true;
    let world = null, lockTimer = 0;
    let lastMove = 0, lastMX = 0;
    const t0 = performance.now();
    let lastSteer = t0;                 // idle breathing starts 3.5s after the entrance

    // The straight seam owns the entrance choreography; the living blade
    // takes over once the score resolves (same position — a seamless handoff).
    const liveTimer = setTimeout(() => {
      live = true;
      el.setAttribute("data-live", "");
      schedule();
    }, 2300);

    const setWorld = (w) => {
      if (w === world) return;
      world = w;
      if (w) el.setAttribute("data-world", w);
      else el.removeAttribute("data-world");
    };

    const apply = () => {
      el.style.setProperty("--mx", `${pos.toFixed(3)}%`);
      el.style.setProperty("--flare", Math.min(1, flare).toFixed(3));
      el.style.setProperty("--lift-health", clamp(0, 1, (pos - 52) / 11).toFixed(3));
      el.style.setProperty("--lift-beauty", clamp(0, 1, (48 - pos) / 11).toFixed(3));
      if (finePointer && wide) {
        el.style.setProperty("--par-x", parX.toFixed(4));
        el.style.setProperty("--par-y", parY.toFixed(4));
        for (const m of magnets) {
          m.el.style.setProperty("--magx", `${m.x.toFixed(2)}px`);
          m.el.style.setProperty("--magy", `${m.y.toFixed(2)}px`);
        }
      }
      setWorld(pos > 55 ? "health" : pos < 45 ? "beauty" : null);

      if (live) {
        // The bent boundary: one gaussian bow shared by the warm grading's
        // polygon clip (percent space) and the blade's SVG path (pixel space).
        const N = 26, S2 = 2 * 17 * 17;
        let poly = "", d = "";
        for (let i = 0; i <= N; i++) {
          const yp = (i / N) * 100;
          const x = pos + bend * Math.exp(-((yp - cy) * (yp - cy)) / S2);
          poly += `${x.toFixed(2)}% ${yp.toFixed(2)}%, `;
          d += `${i ? "L" : "M"}${((x / 100) * rect.width).toFixed(1)} ${((yp / 100) * rect.height).toFixed(1)} `;
        }
        if (warmClip) warmClip.style.clipPath = `polygon(${poly}100% 100%, 100% 0%)`;
        for (const p of bladePaths) p.setAttribute("d", d);
      }

      if (lens) {
        lens.style.transform = `translate3d(${(lx - LENS_R).toFixed(1)}px, ${(ly - LENS_R).toFixed(1)}px, 0) scale(${Math.max(0, ls).toFixed(3)})`;
        lens.style.opacity = clamp(0, 1, ls * 1.15).toFixed(3);
        if (lensCanvas) {
          lensCanvas.style.transformOrigin = `${lx.toFixed(1)}px ${ly.toFixed(1)}px`;
          lensCanvas.style.transform = `translate(${(LENS_R - lx).toFixed(1)}px, ${(LENS_R - ly).toFixed(1)}px) scale(1.15)`;
        }
        // Under the cool world you peer into the warm one — and back.
        const side = (lx / rect.width) * 100 < pos ? "warm" : "cool";
        if (side !== lensSide) { lensSide = side; lens.setAttribute("data-side", side); }
      }
    };

    const frame = (now) => {
      raf = 0;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const breathing = finePointer && wide && hold == null && now - lastSteer > 3500;
      if (hold != null) target = hold;
      else if (breathing) target = 50 + Math.sin((now - t0) * 0.00032) * 5.5; // slow ±5.5 drift

      // Physical springs — heavy, expensive movement, never twitchy.
      vel += (46 * (target - pos) - 12.5 * vel) * dt;
      pos += vel * dt;
      // The blade bows toward the hand itself (raw pointer, not the leaned
      // target); velocity flares widen the bow. Idle light is a straight
      // blade with only the breath's soft curvature.
      const reach = pointerFresh && hold == null ? (pointerPct - pos) * 0.24 : (target - pos) * 0.6;
      const bendTarget = live
        ? clamp(-9, 9, reach) * (0.55 + Math.min(1, flare) * 0.6)
        : 0;
      bendVel += (60 * (bendTarget - bend) - 10 * bendVel) * dt;
      bend += bendVel * dt;
      cyVel += (90 * (cyTarget - cy) - 14 * cyVel) * dt;
      cy += cyVel * dt;
      flare += (flareT - flare) * (flareT > flare ? 10 : 3.2) * dt;
      flareT *= Math.pow(0.002, dt); // the flash always dies down
      // Vitrine depth: the scene drifts against the hand on a deliberately
      // heavy spring — the still life sits BEHIND the glass.
      const parTX = pointerFresh ? clamp(-1, 1, (pointerPct - 50) / 50) : 0;
      const parTY = pointerFresh ? clamp(-1, 1, (cyTarget - 50) / 50) : 0;
      parVX += (26 * (parTX - parX) - 9 * parVX) * dt;
      parX += parVX * dt;
      parVY += (26 * (parTY - parY) - 9 * parVY) * dt;
      parY += parVY * dt;
      // Magnetic invitations: near the hand a plaque CTA leans toward it
      // (≤5px, falloff from its nearest EDGE) and springs home when it leaves.
      let magBusy = false;
      for (const m of magnets) {
        let tx = 0, ty = 0;
        if (live && pointerOn) {
          // distance from the CTA's nearest edge, not its center — wide
          // buttons keep a real attraction field around them
          const qx = clamp(m.left, m.left + m.w, ltx);
          const qy = clamp(m.top, m.top + m.h, lty);
          const dist = Math.hypot(ltx - qx, lty - qy);
          if (dist < 80) {
            const pull = (1 - dist / 80) * 0.1;
            tx = clamp(-5, 5, (ltx - (m.left + m.w / 2)) * pull);
            ty = clamp(-4, 4, (lty - (m.top + m.h / 2)) * pull);
          }
        }
        m.vx += (120 * (tx - m.x) - 14 * m.vx) * dt;
        m.x += m.vx * dt;
        m.vy += (120 * (ty - m.y) - 14 * m.vy) * dt;
        m.y += m.vy * dt;
        if (Math.abs(tx - m.x) > 0.05 || Math.abs(m.vx) > 0.05) magBusy = true;
      }
      if (lens) {
        lvx += (150 * (ltx - lx) - 18 * lvx) * dt;
        lx += lvx * dt;
        lvy += (150 * (lty - ly) - 18 * lvy) * dt;
        ly += lvy * dt;
        lsv += (120 * (lst - ls) - 16 * lsv) * dt;
        ls += lsv * dt;
      }

      const busy =
        breathing || magBusy ||
        Math.abs(target - pos) > 0.02 || Math.abs(vel) > 0.05 ||
        Math.abs(bend) > 0.03 || Math.abs(bendVel) > 0.05 ||
        Math.abs(parTX - parX) > 0.002 || Math.abs(parVX) > 0.002 ||
        Math.abs(parTY - parY) > 0.002 || Math.abs(parVY) > 0.002 ||
        flare > 0.015 ||
        (lens && (ls > 0.005 || Math.abs(lst - ls) > 0.005 ||
          Math.abs(ltx - lx) > 0.3 || Math.abs(lty - ly) > 0.3));
      if (!busy) {
        pos = target; vel = 0; bend = 0;
        apply();
        return; // settled — the engine sleeps until the next input
      }
      apply();
      schedule();
    };

    const schedule = () => {
      if (!raf && visible && onscreen) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };
    const halt = () => { if (raf) { cancelAnimationFrame(raf); raf = 0; } };

    // Two steering laws: touch/keys command the light DIRECTLY (drag it where
    // you want); a fine pointer only makes it LEAN (±14 around center) — the
    // lens travels deep into a world while the boundary respectfully follows.
    const steer = (clientX, clientY, direct) => {
      const px = ((clientX - rect.left) / rect.width) * 100;
      pointerPct = px;
      pointerFresh = !direct;
      target = direct ? clamp(16, 84, px) : clamp(36, 64, 50 + (px - 50) * 0.28);
      cyTarget = clamp(0, 100, ((clientY - rect.top) / rect.height) * 100);
      lastSteer = performance.now();
      schedule();
    };

    const setLensWanted = (want) => {
      lst = want ? 1 : 0;
      if (want !== lensAttr) {
        lensAttr = want;
        if (want) el.setAttribute("data-lens", "");
        else el.removeAttribute("data-lens");
      }
    };

    const onPointerMove = (e) => {
      if (e.pointerType === "touch") return;
      pointerOn = true;
      const nx = e.clientX - rect.left, ny = e.clientY - rect.top;
      const nowT = performance.now();
      if (lensSeeded) {
        // pointer velocity (px/ms) charges the flare
        const v = Math.abs(nx - lastMX) / Math.max(1, nowT - lastMove);
        if (v > 0.35) flareT = Math.min(1, flareT + v * 0.5);
      } else {
        lx = nx; ly = ny; lensSeeded = true; // spawn under the pointer, not fly in
      }
      lastMove = nowT; lastMX = nx;
      ltx = nx; lty = ny;
      const overUi = !!e.target?.closest?.("a, .lumen-plaque, header, footer");
      setLensWanted(!!lens && live && hold == null && !overUi);
      if (hold == null && !overUi) steer(e.clientX, e.clientY, false);
      schedule();
    };
    const onTouchMove = (e) => {
      const t = e.touches[0];
      if (t && hold == null) steer(t.clientX, t.clientY, true);
    };
    const onLeave = () => {
      setLensWanted(false);
      lastSteer = 0; cyTarget = 50; pointerFresh = false; pointerOn = false;
      schedule(); // hand back to the idle breath
    };
    const onKey = (e) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      target = clamp(16, 84, target + (e.key === "ArrowLeft" ? -6 : 6));
      pointerFresh = false; // keys command the light directly
      lastSteer = performance.now();
      schedule();
    };

    // World flood on plaque hover / keyboard focus / touch — the chosen world
    // opens to ~62%, the other remains visible and premium. The lens retires.
    const pin = (v) => () => { hold = v; setLensWanted(false); lastSteer = performance.now(); schedule(); };
    const unpin = () => { hold = null; lastSteer = performance.now(); schedule(); };
    const lock = (w) => () => {
      el.setAttribute("data-lock", w);
      flareT = 1; // the light answers the choice
      clearTimeout(lockTimer);
      lockTimer = setTimeout(() => el.removeAttribute("data-lock"), 600);
      schedule();
    };

    const videos = () => el.querySelectorAll("video");
    const onVisibility = () => {
      visible = !document.hidden;
      if (!visible) { halt(); videos().forEach((v) => v.pause()); }
      else { schedule(); videos().forEach((v) => v.play().catch(() => {})); }
    };
    const io = new IntersectionObserver(([entry]) => {
      onscreen = entry.isIntersecting;
      if (!onscreen) { halt(); videos().forEach((v) => v.pause()); }
      else { schedule(); videos().forEach((v) => v.play().catch(() => {})); }
    });
    io.observe(el);

    const onReflow = () => { measure(); schedule(); };
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("touchmove", onTouchMove, { passive: true });
    el.addEventListener("pointerleave", onLeave);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onReflow);
    window.addEventListener("scroll", onReflow, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);

    const doorBindings = [];
    const bindDoor = (door, at, name) => {
      if (!door) return;
      const enter = pin(at);
      const cta = door.querySelector(".lumen-cta");
      const flash = lock(name);
      door.addEventListener("pointerenter", enter);
      door.addEventListener("pointerleave", unpin);
      door.addEventListener("focusin", enter);
      door.addEventListener("focusout", unpin);
      door.addEventListener("touchstart", enter, { passive: true });
      cta?.addEventListener("click", flash);
      doorBindings.push(() => {
        door.removeEventListener("pointerenter", enter);
        door.removeEventListener("pointerleave", unpin);
        door.removeEventListener("focusin", enter);
        door.removeEventListener("focusout", unpin);
        door.removeEventListener("touchstart", enter);
        cta?.removeEventListener("click", flash);
      });
    };
    bindDoor(healthDoorRef.current, 62, "health"); // cool light floods left
    bindDoor(beautyDoorRef.current, 38, "beauty"); // warm light floods right

    schedule();

    return () => {
      halt();
      clearTimeout(liveTimer);
      clearTimeout(lockTimer);
      io.disconnect();
      el.removeAttribute("data-live");
      el.removeAttribute("data-lens");
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onReflow);
      window.removeEventListener("scroll", onReflow);
      document.removeEventListener("visibilitychange", onVisibility);
      doorBindings.forEach((off) => off());
    };
  }, []);

  // ── optional cinemagraph gate (both loops or nothing, after the entrance) ─
  useEffect(() => {
    if (!media?.video?.cool || !media?.video?.warm || !media?.scene) return;
    const mm = (q) => window.matchMedia(q).matches;
    if (!mm("(min-width: 1024px)")) return;              // desktop only
    if (mm("(prefers-reduced-motion: reduce)")) return;  // stillness respected
    if (navigator.connection?.saveData) return;          // data respected
    if ((navigator.hardwareConcurrency || 8) < 4) return;
    const t = setTimeout(() => setVideoOn(true), 2400);  // posters own the LCP
    return () => clearTimeout(t);
  }, [media]);

  const grading = (kind) => {
    const src = media?.scene?.[kind];
    return (
      <>
        {src ? (
          <img
            src={src}
            alt=""
            aria-hidden="true"
            fetchPriority="high"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <PlaceholderScene grade={kind} />
        )}
        {videoOn && (
          <video
            className="lumen-video"
            src={media.video[kind]}
            poster={src || undefined}
            muted
            loop
            playsInline
            autoPlay
            preload="none"
            aria-hidden="true"
            tabIndex={-1}
            onLoadedData={(e) => e.currentTarget.classList.add("is-live")}
            onError={() => setVideoOn(false)}
          />
        )}
      </>
    );
  };

  return (
    <section
      ref={rootRef}
      aria-label="Medoria — Health ё Beauty"
      className="lumen-stage noise relative flex min-h-[100svh] flex-col overflow-hidden"
      style={{ "--mx": "50%" }}
    >
      {/* ── пардаи нур: the light curtains part from the aperture line ──── */}
      <div aria-hidden="true" className="lumen-curtain lumen-curtain-l absolute inset-y-0 left-0 z-30 max-md:hidden" />
      <div aria-hidden="true" className="lumen-curtain lumen-curtain-r absolute inset-y-0 right-0 z-30 max-md:hidden" />

      {/* ── the vitrine: one scene, two lights ──────────────────────────── */}
      <div aria-hidden="true" className="lumen-scene absolute inset-0 max-md:hidden">
        {/* cool / Health — full frame, owns everything left of the aperture */}
        <div className="absolute inset-0">
          {grading("cool")}
          <div className="lumen-field lumen-field-cool" />
        </div>
        {/* warm / Beauty — clipped to the right of the aperture (straight at
            rest / JS-off; the live engine re-clips it along the bent blade) */}
        <div ref={warmClipRef} className="lumen-clip absolute inset-0" style={{ clipPath: "inset(0 0 0 var(--mx))" }}>
          {grading("warm")}
          <div className="lumen-field lumen-field-warm" />
        </div>
        <div className="lumen-vignette absolute inset-0" />
        <div className="lumen-wash-top absolute inset-x-0 top-0 h-44" />
        <div className="lumen-wash-bottom absolute inset-x-0 bottom-0 h-[19rem]" />
      </div>

      {/* ── the aperture (straight seam: SSR/JS-off/entrance state) ──────── */}
      <div aria-hidden="true" className="lumen-aperture absolute inset-y-0 max-md:hidden" style={{ left: "var(--mx)" }}>
        <span className="lumen-refract absolute inset-y-0 -left-[7px] w-[14px]" />
        <span className="lumen-bloom absolute inset-y-0 -left-16 w-32" />
        <span className="lumen-core absolute inset-y-0 -left-px w-[2px]" />
        <span className="lumen-drop absolute inset-y-0 -left-px w-[2px] overflow-hidden" />
      </div>

      {/* ── the light-blade: the boundary as a living curve (engine-driven) ─ */}
      <svg ref={bladeRef} aria-hidden="true" className="lumen-blade absolute inset-0 h-full w-full max-md:hidden" preserveAspectRatio="none">
        <path ref={bladeCoolRef} className="lumen-blade-cool" d="" />
        <path ref={bladeWarmRef} className="lumen-blade-warm" d="" />
        <path ref={bladeCoreRef} className="lumen-blade-core" d="" />
      </svg>

      {/* ── the counter-lens: peer into the opposite world (fine pointers) ── */}
      {media?.scene && (
        <div ref={lensRef} aria-hidden="true" className="lumen-lens">
          <div ref={lensCanvasRef} className="lumen-lens-canvas">
            <img src={media.scene.warm} alt="" data-grade="warm" draggable={false} className="lumen-lens-img" />
            <img src={media.scene.cool} alt="" data-grade="cool" draggable={false} className="lumen-lens-img" />
          </div>
          <span className="lumen-lens-ring" />
        </div>
      )}

      {/* the two worlds — centered glass cards pinned to the top (md+). On
          phones the dedicated vertical two-door split below takes over. */}
      <nav
        aria-label="Medoria Health / Medoria Beauty"
        className="relative z-20 hidden gap-3 px-4 pt-5 md:grid md:px-8 md:pt-7 xl:grid-cols-2 xl:gap-6 xl:px-16"
      >
        <WorldDoor
          ref={healthDoorRef}
          vertical="health"
          copy={copy.health}
          index="01"
          macro={media?.macro?.health}
          href={`/health/${defaultLang}`}
          hrefBase="/health"
          langs={langs}
          langLabels={langLabels}
          langDirs={langDirs}
        />
        <WorldDoor
          ref={beautyDoorRef}
          vertical="beauty"
          copy={copy.beauty}
          index="02"
          macro={media?.macro?.beauty}
          href={`/beauty/${defaultLang}`}
          hrefBase="/beauty"
          langs={langs}
          langLabels={langLabels}
          langDirs={langDirs}
        />
      </nav>

      {/* the cinematic vitrine fills everything below the bars */}
      <div className="flex-1" />

      <footer
        className="lumen-rise relative z-20 flex items-center justify-center gap-3 px-6 pb-5 text-center text-[11px]"
        style={{ "--d": "1.9s", color: "rgb(20 28 46 / 0.55)" }}
      >
        <span>© {year} Medoria</span>
        <span aria-hidden="true" className="h-3 w-px" style={{ background: "rgb(20 28 46 / 0.2)" }} />
        <span dir="ltr" translate="no">Health · Beauty</span>
      </footer>

      {/* ── MOBILE: a vertical two-door split (phones only). Top = Health
          hall, bottom = Beauty hall, a horizontal light seam between, a
          centered glass card in each. Uses the portrait mobile crops when
          present (media.mobile.*), else the campaign stills. ─────────────── */}
      <div className="lumen-mobile md:hidden">
        {[
          { v: "health", grade: "cool", base: "/health", cta: copy.health.cta },
          { v: "beauty", grade: "warm", base: "/beauty", cta: copy.beauty.cta },
        ].map((w) => (
          <section key={w.v} data-vertical={w.v} className={`lumen-mo-half lumen-mo-${w.v}`}>
            {media?.mobile?.[w.grade] || media?.scene?.[w.grade] ? (
              <img
                src={media?.mobile?.[w.grade] || media.scene[w.grade]}
                alt=""
                aria-hidden="true"
                fetchPriority="high"
                decoding="async"
                className="lumen-mo-img"
              />
            ) : (
              <PlaceholderScene grade={w.grade} />
            )}
            <span aria-hidden="true" className="lumen-mo-wash" />
            <div
              className={`lumen-rise lumen-plaque lumen-card lumen-mo-card lumen-plaque-${w.v}`}
              style={{ "--d": w.v === "beauty" ? "0.55s" : "0.45s" }}
            >
              <span aria-hidden="true" className="lumen-card-sheen" />
              <WorldLockup vertical={w.v} height={30} className="lumen-card-lockup" />
              <div className="lumen-card-act">
                <ul className="lumen-langs" aria-label={`Medoria ${w.v === "beauty" ? "Beauty" : "Health"} languages`}>
                  {langs.map((code) => (
                    <li key={code}>
                      <Link
                        href={`${w.base}/${code}`}
                        hrefLang={code}
                        lang={code}
                        dir={langDirs[code]}
                        className="lumen-lang v-focus"
                        aria-label={`Medoria ${w.v === "beauty" ? "Beauty" : "Health"} — ${langLabels[code]}`}
                      >
                        {langLabels[code]}
                      </Link>
                    </li>
                  ))}
                </ul>
                <Link href={`${w.base}/${defaultLang}`} className={`lumen-cta lumen-cta-${w.v} v-focus group/cta`}>
                  <span>{w.cta}</span>
                  <span aria-hidden="true" className="lumen-cta-arrow">→</span>
                </Link>
              </div>
            </div>
          </section>
        ))}
        <span aria-hidden="true" className="lumen-mo-seam" />
        <footer className="lumen-mo-footer">© {year} Medoria · Health · Beauty</footer>
      </div>
    </section>
  );
}

// One world's invitation plaque: editorial numbering, the REAL designed
// lockup, display title, one line, a plaque CTA and the four language links.
// Health and Beauty render through the same component — equality by
// construction; only tokens/alignment differ.
const WorldDoor = forwardRef(function WorldDoor(
  { vertical, copy, index, macro, href, hrefBase, langs, langLabels, langDirs },
  ref
) {
  const beauty = vertical === "beauty";
  return (
    <div ref={ref} data-vertical={vertical} className={`lumen-door lumen-door-${vertical}`}>
      <div
        className={`lumen-rise lumen-plaque lumen-card lumen-plaque-${vertical} lumen-card-${vertical}`}
        style={{ "--d": beauty ? "0.62s" : "0.5s" }}
      >
        <span aria-hidden="true" className="lumen-card-sheen" />
        <WorldLockup vertical={vertical} height={28} className="lumen-card-lockup" />
        <div className="lumen-card-act">
          <ul className="lumen-langs" aria-label={`Medoria ${beauty ? "Beauty" : "Health"} languages`}>
            {langs.map((code) => (
              <li key={code}>
                <Link
                  href={`${hrefBase}/${code}`}
                  hrefLang={code}
                  lang={code}
                  dir={langDirs[code]}
                  className="lumen-lang v-focus"
                  aria-label={`Medoria ${beauty ? "Beauty" : "Health"} — ${langLabels[code]}`}
                >
                  {langLabels[code]}
                </Link>
              </li>
            ))}
          </ul>
          <Link href={href} className={`lumen-cta lumen-cta-${vertical} v-focus group/cta`}>
            <span>{copy.cta}</span>
            <span aria-hidden="true" className="lumen-cta-arrow">→</span>
          </Link>
        </div>
      </div>
    </div>
  );
});

// Built-in CSS grading stand-in — the SAME abstract light composition in two
// temperatures, so the aperture wipe stays perfectly aligned if the campaign
// pair is ever missing. Deliberately quiet: light, marble haze, a low horizon
// shadow — a stage waiting for its still life.
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
      <div
        className="absolute inset-0"
        style={{
          background: cool
            ? "radial-gradient(90% 70% at 22% 8%, rgba(255,255,255,0.95), transparent 62%)"
            : "radial-gradient(90% 70% at 78% 8%, rgba(255,252,244,0.95), transparent 62%)",
        }}
      />
      <div
        className="absolute top-0 h-[78%] w-[34%] blur-3xl"
        style={{
          left: cool ? "8%" : "58%",
          background: cool
            ? "linear-gradient(192deg, rgba(214,232,248,0.85), rgba(150,190,225,0.0) 80%)"
            : "linear-gradient(168deg, rgba(250,232,205,0.9), rgba(222,178,120,0.0) 80%)",
        }}
      />
      <div className="absolute inset-x-0 bottom-[26%] h-px" style={{ background: cool ? "rgba(96,128,160,0.34)" : "rgba(160,118,70,0.34)" }} />
      <div
        className="absolute bottom-[13%] left-1/2 h-[20%] w-[64%] -translate-x-1/2 rounded-[100%] blur-2xl"
        style={{ background: cool ? "rgba(84,118,152,0.24)" : "rgba(150,104,56,0.24)" }}
      />
    </div>
  );
}
