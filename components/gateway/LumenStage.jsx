"use client";
// components/gateway/LumenStage.jsx — «LUMEN GATE» / the Medoria Aperture.
// ONE full-viewport still-life scene, TWO lights: the warm (Beauty) grading
// sits above the cool (Health) grading and is clipped at a luminous optical
// boundary (--mx) driven by a physical spring. Steering the light IS choosing
// the world: open stage pointer/touch drags the aperture; hovering/focusing a
// world's plaque floods that world to ~62% while the other stays present and
// respected; idle, the aperture breathes slowly around center (desktop).
// The engine sleeps whenever the aperture settles, and pauses on tab-hide and
// offscreen. Optional cinemagraph loops (lib/gateway/media.js) mount only
// after the entrance, on ≥1024px screens, with motion/data/core gating, and
// fall back to the posters silently. Without JS the aperture rests at 50%
// and every link/CTA is fully present (SSR/crawlable, never auto-forwards);
// reduced motion pins everything static.
import { forwardRef, useEffect, useRef, useState } from "react";
import Link from "next/link";
import WorldLockup from "./WorldLockup";

const clamp = (min, max, v) => Math.max(min, Math.min(max, v));

export default function LumenStage({ media, copy, defaultLang, langs, langLabels, langDirs, year }) {
  const rootRef = useRef(null);
  const healthDoorRef = useRef(null);
  const beautyDoorRef = useRef(null);
  const [videoOn, setVideoOn] = useState(false);

  // ── the aperture engine ──────────────────────────────────────────────────
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return; // static 50/50

    const finePointer = window.matchMedia("(pointer: fine)").matches;
    const wide = window.matchMedia("(min-width: 768px)").matches;

    let pos = 50, vel = 0, target = 50;
    let hold = null;                    // plaque hover/focus pin (62 health / 38 beauty)
    let raf = 0, last = 0;
    let visible = !document.hidden, onscreen = true;
    let world = null, lockTimer = 0;
    const t0 = performance.now();
    let lastSteer = t0;                 // idle breathing starts 3.5s after the entrance

    const setWorld = (w) => {
      if (w === world) return;
      world = w;
      if (w) el.setAttribute("data-world", w);
      else el.removeAttribute("data-world");
    };

    const apply = () => {
      el.style.setProperty("--mx", `${pos.toFixed(3)}%`);
      // Light floods: how far the aperture has opened into each world (0..1).
      el.style.setProperty("--lift-health", clamp(0, 1, (pos - 52) / 11).toFixed(3));
      el.style.setProperty("--lift-beauty", clamp(0, 1, (48 - pos) / 11).toFixed(3));
      setWorld(pos > 55 ? "health" : pos < 45 ? "beauty" : null);
    };

    const frame = (now) => {
      raf = 0;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const breathing = finePointer && wide && hold == null && now - lastSteer > 3500;
      if (hold != null) target = hold;
      else if (breathing) target = 50 + Math.sin((now - t0) * 0.00032) * 5.5; // slow ±5.5 drift
      // Physical spring — heavy, expensive movement, never twitchy.
      vel += (46 * (target - pos) - 12.5 * vel) * dt;
      pos += vel * dt;
      if (!breathing && Math.abs(target - pos) < 0.02 && Math.abs(vel) < 0.05) {
        pos = target; vel = 0;
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

    const steer = (clientX) => {
      const r = el.getBoundingClientRect();
      target = clamp(16, 84, ((clientX - r.left) / r.width) * 100);
      lastSteer = performance.now();
      schedule();
    };
    const onPointerMove = (e) => { if (e.pointerType !== "touch" && hold == null) steer(e.clientX); };
    const onTouchMove = (e) => { if (e.touches[0] && hold == null) steer(e.touches[0].clientX); };
    const onLeave = () => { lastSteer = 0; schedule(); }; // hand back to the idle breath
    const onKey = (e) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      target = clamp(16, 84, target + (e.key === "ArrowLeft" ? -6 : 6));
      lastSteer = performance.now();
      schedule();
    };

    // World flood on plaque hover / keyboard focus / touch — the chosen world
    // opens to ~62%, the other remains visible and premium.
    const pin = (v) => () => { hold = v; lastSteer = performance.now(); schedule(); };
    const unpin = () => { hold = null; lastSteer = performance.now(); schedule(); };
    const lock = (w) => () => {
      // Click light-lock: a short flash of full light on the chosen side —
      // pure CSS reaction, navigation is never delayed.
      el.setAttribute("data-lock", w);
      clearTimeout(lockTimer);
      lockTimer = setTimeout(() => el.removeAttribute("data-lock"), 600);
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

    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("touchmove", onTouchMove, { passive: true });
    el.addEventListener("pointerleave", onLeave);
    window.addEventListener("keydown", onKey);
    document.addEventListener("visibilitychange", onVisibility);

    const doorBindings = [];
    const bindDoor = (door, at, name) => {
      if (!door) return;
      const enter = pin(at);
      const cta = door.querySelector("a");
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
      clearTimeout(lockTimer);
      io.disconnect();
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("keydown", onKey);
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
      {/* ── the vitrine: one scene, two lights ──────────────────────────── */}
      <div aria-hidden="true" className="lumen-scene absolute inset-0">
        {/* cool / Health — full frame, owns everything left of the aperture */}
        <div className="absolute inset-0">
          {grading("cool")}
          <div className="lumen-field lumen-field-cool" />
        </div>
        {/* warm / Beauty — clipped to the right of the aperture */}
        <div className="lumen-clip absolute inset-0" style={{ clipPath: "inset(0 0 0 var(--mx))" }}>
          {grading("warm")}
          <div className="lumen-field lumen-field-warm" />
        </div>
        <div className="lumen-vignette absolute inset-0" />
        <div className="lumen-wash-top absolute inset-x-0 top-0 h-44" />
        <div className="lumen-wash-bottom absolute inset-x-0 bottom-0 h-[19rem]" />
      </div>

      {/* ── the aperture ─────────────────────────────────────────────────── */}
      <div aria-hidden="true" className="lumen-aperture absolute inset-y-0" style={{ left: "var(--mx)" }}>
        <span className="lumen-refract absolute inset-y-0 -left-[7px] w-[14px]" />
        <span className="lumen-bloom absolute inset-y-0 -left-16 w-32" />
        <span className="lumen-core absolute inset-y-0 -left-px w-[2px]" />
        <span className="lumen-drop absolute inset-y-0 -left-px w-[2px] overflow-hidden" />
      </div>

      {/* ── neutral parent identity ──────────────────────────────────────── */}
      <header className="relative z-20 flex flex-col items-center px-6 pt-8 text-center md:pt-10">
        <p className="lumen-rise lumen-eyebrow" style={{ "--d": "0.92s" }}>
          {copy.eyebrow}
        </p>
        <span
          dir="ltr"
          translate="no"
          aria-label="Medoria"
          className="lumen-rise mt-3 inline-flex select-none items-center gap-3"
          style={{ "--d": "1.02s" }}
        >
          <img src="/logo-mark.png" alt="" aria-hidden="true" width={32} height={32} style={{ width: 32, height: 32 }} className="shrink-0 object-contain" />
          <img src="/brand/wordmark-navy.png" alt="Medoria" width={131} height={26} fetchPriority="high" style={{ height: 26, width: "auto" }} className="object-contain" />
        </span>
        <h1 className="lumen-rise lumen-headline font-display" style={{ "--d": "1.12s" }}>
          {copy.headline}
        </h1>
        <p className="lumen-rise lumen-hint" style={{ "--d": "1.24s" }}>
          {copy.hint}
        </p>
      </header>

      {/* the vitrine window — on mobile a guaranteed strip of raw scene
          breathes between the identity and the plaques */}
      <div className="min-h-[5.5rem] flex-1 md:min-h-0" />

      {/* ── the two worlds ───────────────────────────────────────────────── */}
      <p className="lumen-rise lumen-choose relative z-20 px-6" style={{ "--d": "1.55s" }}>
        {copy.choose}
      </p>
      <nav
        aria-label="Medoria Health ё Medoria Beauty"
        className="relative z-20 mt-4 grid gap-4 px-5 pb-7 md:grid-cols-2 md:gap-6 md:px-10 md:pb-10 lg:px-14 xl:px-20"
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

      <footer
        className="lumen-rise relative z-20 flex items-center justify-center gap-3 px-6 pb-5 text-center text-[11px]"
        style={{ "--d": "1.9s", color: "rgb(20 28 46 / 0.55)" }}
      >
        <span>© {year} Medoria</span>
        <span aria-hidden="true" className="h-3 w-px" style={{ background: "rgb(20 28 46 / 0.2)" }} />
        <span dir="ltr" translate="no">Health · Beauty</span>
      </footer>
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
        className={`lumen-rise lumen-plaque lumen-plaque-${vertical} flex flex-col items-center text-center ${
          beauty ? "md:items-end md:text-end" : "md:items-start md:text-start"
        }`}
        style={{ "--d": "1.32s" }}
      >
        {macro && (
          <img
            src={macro}
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
            width={72}
            height={72}
            className="lumen-specimen"
          />
        )}
        <p className="lumen-index">
          <span className="lumen-index-no">{index}</span>
          <span aria-hidden="true" className="lumen-index-rule" />
          <span>{copy.eyebrow}</span>
        </p>
        <div className="mt-3.5">
          <WorldLockup vertical={vertical} height={36} />
        </div>
        <h2 className="lumen-title font-display">{copy.title}</h2>
        <p className="lumen-line">{copy.line}</p>
        <div
          className={`lumen-rise mt-5 flex flex-wrap items-center justify-center gap-3 ${
            beauty ? "md:flex-row-reverse md:justify-start" : "md:justify-start"
          }`}
          style={{ "--d": "1.72s" }}
        >
          <Link href={href} className={`lumen-cta lumen-cta-${vertical} v-focus group/cta`}>
            <span>{copy.cta}</span>
            <span aria-hidden="true" className="lumen-cta-arrow">→</span>
          </Link>
          <ul className="lumen-langs" aria-label={`Medoria ${beauty ? "Beauty" : "Health"} — забонҳо / languages`}>
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
