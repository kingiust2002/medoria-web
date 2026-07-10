// components/gateway/GatewayDust.jsx — sparse ambient dust for one gateway
// world (three.js). Same engine discipline as the Beauty hero scene (permanent
// per-particle colour, quiet sine drift, opacity breathing, IO pause, full
// dispose) at a fraction of the density — the gateway is an overture, not the
// concert. Palette per vertical:
//   health → glacial white/ice-blue with rare deep blue flecks, slow rise
//   beauty → blush/champagne/copper with rare navy flecks, gentle swirl
// Mounted desktop-only behind gates in WorldPanel (dynamic import, ssr:false).
"use client";
import { useEffect, useRef } from "react";
import * as THREE from "three";

const PALETTES = {
  health: {
    stops: [
      [0.918, 0.957, 1.0],   // ice white  #EAF4FF
      [0.749, 0.863, 1.0],   // pale sky   #BFDCFF
      [0.561, 0.737, 0.922], // glacial    #8FBCEB
      [0.184, 0.435, 0.902], // deep blue  #2F6FE6 — rare accent
    ],
    rise: 0.14, // sterile air drifts upward
  },
  beauty: {
    stops: [
      [0.973, 0.882, 0.816], // blush champagne
      [0.953, 0.863, 0.745], // champagne  #F3DCBE
      [0.784, 0.49, 0.306],  // copper     #C87D4E
      [0.106, 0.161, 0.318], // deep navy  #1C2951 — rare accent
    ],
    rise: 0.04,
  },
};
const lerp = (a, b, t) => a + (b - a) * t;

export default function GatewayDust({ vertical = "health", particleCount = 800 }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: "low-power" });
    } catch {
      return; // no WebGL — the scene gradients already carry the atmosphere
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    const W = () => canvas.clientWidth || 1;
    const H = () => canvas.clientHeight || 1;
    renderer.setSize(W(), H(), false);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(58, W() / H(), 0.1, 100);
    camera.position.z = 15;

    const { stops, rise } = PALETTES[vertical] || PALETTES.health;
    const N = particleCount;
    const pos = new Float32Array(N * 3);
    const base = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    const seed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const r = 6 + Math.random() * 5.5;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      const x = r * Math.sin(ph) * Math.cos(th) * 1.5;
      const y = r * Math.cos(ph) * 0.9;
      const z = r * Math.sin(ph) * Math.sin(th);
      base[i * 3] = x; base[i * 3 + 1] = y; base[i * 3 + 2] = z;
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      seed[i] = Math.random() * Math.PI * 2;

      // permanent per-particle colour, biased to the light end so the dark
      // stop stays a rare deliberate fleck (same rule as the Beauty hero)
      const tt = Math.max(0, Math.min(1, (x / 9 + 1) * 0.5));
      const biased = Math.pow(tt, 2.4);
      const s = Math.min(stops.length - 2, Math.floor(biased * (stops.length - 1)));
      const lt = biased * (stops.length - 1) - s;
      col[i * 3] = lerp(stops[s][0], stops[s + 1][0], lt);
      col[i * 3 + 1] = lerp(stops[s][1], stops[s + 1][1], lt);
      col[i * 3 + 2] = lerp(stops[s][2], stops[s + 1][2], lt);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.058,
      vertexColors: true,
      transparent: true,
      opacity: 0.42,
      blending: THREE.NormalBlending, // light bg: additive would wash out
      depthWrite: false,
      sizeAttenuation: true,
    });
    const points = new THREE.Points(geo, mat);
    scene.add(points);

    let raf = 0, running = true;
    const clock = new THREE.Clock();
    const resize = () => { renderer.setSize(W(), H(), false); camera.aspect = W() / H(); camera.updateProjectionMatrix(); };

    const frame = () => {
      if (!running) return;
      const dt = Math.min(clock.getDelta(), 0.05);
      const t = clock.elapsedTime;

      const arr = geo.attributes.position.array;
      for (let i = 0; i < N; i++) {
        const j = i * 3;
        arr[j] = base[j] + Math.sin(t * 0.3 + seed[i]) * 0.45;
        let y = base[j + 1] + Math.cos(t * 0.24 + seed[i]) * 0.35 + t * rise;
        // wrap risen particles back below the field so the drift is endless
        const span = 12;
        y = ((y + span / 2) % span + span) % span - span / 2;
        arr[j + 1] = y;
        arr[j + 2] = base[j + 2] + Math.sin(t * 0.2 + seed[i] * 1.3) * 0.35;
      }
      geo.attributes.position.needsUpdate = true;

      mat.opacity = 0.36 + Math.sin(t * 0.55 + (vertical === "beauty" ? 1.7 : 0)) * 0.07;
      points.rotation.y += dt * 0.02;

      renderer.render(scene, camera);
      raf = requestAnimationFrame(frame);
    };
    const play = () => { if (!running) { running = true; raf = requestAnimationFrame(frame); } };
    const pause = () => { running = false; cancelAnimationFrame(raf); };
    raf = requestAnimationFrame(frame);

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
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVis);
      if (io) io.disconnect();
      geo.dispose(); mat.dispose(); renderer.dispose();
    };
  }, [vertical, particleCount]);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
      style={{ opacity: 0.8 }}
    />
  );
}
