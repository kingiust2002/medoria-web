// components/beauty/home/BeautyHeroScene.jsx
// Ambient "champagne dust" field for the Beauty hero: a quiet cloud of fine
// particles that drifts and gently shimmers — no word-formation. An earlier
// version tried to gather the cloud into letterforms (mirroring Health's
// HeroScene), but at this particle density a formed "word" reads as loose
// scattered sparkle, not legible text, so it's been dropped in favour of a
// refined, honest ambient effect. Colour now follows the SAME navy->copper->
// gold direction as the page's own `.gradient-text` (see globals.css), with
// navy kept as a minority accent — like fine dark mica flecks in gold powder
// — so the particles read as part of this brand's palette, not generic dust.
"use client";
import { useEffect, useRef } from "react";
import * as THREE from "three";

// Matches .gradient-text's navy -> copper (55%) -> gold direction exactly.
const STOPS = [
  [0.973, 0.882, 0.816], // blush champagne (has enough presence against the
                          // ivory background — the old near-white first stop
                          // was nearly invisible)
  [0.953, 0.863, 0.745], // champagne     #F3DCBE  (== --v-champagne)
  [0.784, 0.490, 0.306], // copper        #C87D4E  (== --v-copper)
  [0.106, 0.161, 0.318], // deep navy     #1C2951  (== --v-navy) — rare accent
];
const lerp = (a, b, t) => a + (b - a) * t;

export default function BeautyHeroScene({ particleCount = 2600 }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: "low-power" });
    } catch {
      return; // no WebGL — Hero already renders its full gradient/aurora fallback
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    const W = () => canvas.clientWidth || 1;
    const H = () => canvas.clientHeight || 1;
    renderer.setSize(W(), H(), false);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(58, W() / H(), 0.1, 100);
    camera.position.z = 15;

    const N = particleCount;
    const pos = new Float32Array(N * 3);
    const base = new Float32Array(N * 3);   // resting position — never changes
    const col = new Float32Array(N * 3);
    const seed = new Float32Array(N);
    const sparklePhase = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const r = 6 + Math.random() * 5.5;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      const x = r * Math.sin(ph) * Math.cos(th) * 1.6;
      const y = r * Math.cos(ph) * 0.8;
      const z = r * Math.sin(ph) * Math.sin(th);
      base[i * 3] = x; base[i * 3 + 1] = y; base[i * 3 + 2] = z;
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      seed[i] = Math.random() * Math.PI * 2;
      sparklePhase[i] = Math.random() * Math.PI * 2;

      // Colour is assigned ONCE, permanently, per particle — there is no
      // later re-shuffling (the previous bug: word-formation reassigned which
      // particle sat where, but never touched colour, so letters rendered as
      // a random mix of every stop instead of a clean tone). Bias the mix
      // toward the light end so navy stays a rare, deliberate accent.
      const tt = Math.max(0, Math.min(1, x / 9.6 * 0.5 + 0.5));
      const biased = Math.pow(tt, 2.4);
      const s = Math.min(STOPS.length - 2, Math.floor(biased * (STOPS.length - 1)));
      const lt = biased * (STOPS.length - 1) - s;
      col[i * 3] = lerp(STOPS[s][0], STOPS[s + 1][0], lt);
      col[i * 3 + 1] = lerp(STOPS[s][1], STOPS[s + 1][1], lt);
      col[i * 3 + 2] = lerp(STOPS[s][2], STOPS[s + 1][2], lt);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.062,
      vertexColors: true,
      transparent: true,
      opacity: 0.5,
      blending: THREE.NormalBlending, // light-only: additive would wash out on white
      depthWrite: false,
      sizeAttenuation: true,
    });
    const points = new THREE.Points(geo, mat);
    scene.add(points);

    let raf = 0, running = true;
    let tx = 0, ty = 0, cx = 0, cy = 0;
    const clock = new THREE.Clock();
    const onMove = (e) => { tx = e.clientX / window.innerWidth - 0.5; ty = e.clientY / window.innerHeight - 0.5; };
    const resize = () => { renderer.setSize(W(), H(), false); camera.aspect = W() / H(); camera.updateProjectionMatrix(); };

    const frame = () => {
      if (!running) return;
      const dt = Math.min(clock.getDelta(), 0.05);
      const t = clock.elapsedTime;

      // slow, quiet drift — no state machine, no target-chasing
      const arr = geo.attributes.position.array;
      for (let i = 0; i < N; i++) {
        const j = i * 3;
        arr[j] = base[j] + Math.sin(t * 0.35 + seed[i]) * 0.5;
        arr[j + 1] = base[j + 1] + Math.cos(t * 0.28 + seed[i]) * 0.4;
        arr[j + 2] = base[j + 2] + Math.sin(t * 0.22 + seed[i] * 1.3) * 0.4;
      }
      geo.attributes.position.needsUpdate = true;

      // gentle ambient shimmer (breathing opacity) instead of a legible word
      mat.opacity = 0.42 + Math.sin(t * 0.6) * 0.08;

      points.rotation.y += dt * 0.03;
      points.rotation.x = Math.sin(t * 0.08) * 0.03;

      cx += (tx - cx) * 0.03; cy += (ty - cy) * 0.03;
      camera.position.x = cx * 2.4; camera.position.y = -cy * 1.6; camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
      raf = requestAnimationFrame(frame);
    };
    const play = () => { if (!running) { running = true; raf = requestAnimationFrame(frame); } };
    const pause = () => { running = false; cancelAnimationFrame(raf); };
    raf = requestAnimationFrame(frame);

    window.addEventListener("mousemove", onMove);
    window.addEventListener("resize", resize);
    const onVis = () => (document.hidden ? pause() : play());
    document.addEventListener("visibilitychange", onVis);
    let io;
    if ("IntersectionObserver" in window) {
      io = new IntersectionObserver(([e]) => (e.isIntersecting ? play() : pause()), { threshold: 0 });
      io.observe(canvas);
    }
    return () => {
      pause();
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVis);
      if (io) io.disconnect();
      geo.dispose(); mat.dispose(); renderer.dispose();
    };
  }, [particleCount]);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className="absolute inset-0 w-full h-full -z-10 pointer-events-none"
      style={{ opacity: 0.85 }}
    />
  );
}
