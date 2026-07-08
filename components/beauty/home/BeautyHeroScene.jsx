// components/beauty/home/BeautyHeroScene.jsx
// Luxury Beauty interpretation of the Health HeroScene: a soft cloud of
// champagne dust / pearl dew that drifts, then gathers into a brand/beauty
// word, then disperses — repeating. Light-only (Beauty is always light), so
// it uses normal (not additive) blending and a lower particle count for a
// finer, quieter "powder" feel instead of Health's denser snowstorm.
// Same architecture as components/home/HeroScene.jsx on purpose — reused as
// the source of truth: same Three.js primitives, same word-sampling technique,
// same play/pause/dispose discipline. Gating (viewport/reduced-motion/
// save-data/tab-visibility/offscreen) lives in the parent Hero, exactly like
// Health; this file only owns the scene itself.
"use client";
import { useEffect, useRef } from "react";
import * as THREE from "three";

// Nude / ivory / champagne / copper — pearl-dew gradient across the cloud.
const STOPS = [
  [1.000, 0.992, 0.965], // pearl/ivory  #FFFDF6
  [0.953, 0.863, 0.745], // champagne    #F3DCBE
  [0.784, 0.490, 0.306], // copper       #C87D4E
  [0.937, 0.784, 0.580], // soft gold    #EFC894
];
const lerp = (a, b, t) => a + (b - a) * t;

export default function BeautyHeroScene({ rtl = false, words, particleCount = 2600 }) {
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
    const pos = new Float32Array(N * 3);   // live positions
    const cloud = new Float32Array(N * 3); // resting "dust cloud" positions
    const target = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    const seed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const r = 6 + Math.random() * 5.5;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      const x = r * Math.sin(ph) * Math.cos(th) * 1.6;
      const y = r * Math.cos(ph) * 0.8;
      const z = r * Math.sin(ph) * Math.sin(th);
      cloud[i * 3] = x; cloud[i * 3 + 1] = y; cloud[i * 3 + 2] = z;
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      target[i * 3] = x; target[i * 3 + 1] = y; target[i * 3 + 2] = z;
      seed[i] = Math.random() * Math.PI * 2;
      const tt = Math.max(0, Math.min(1, x / 9.6 * 0.5 + 0.5));
      const s = Math.min(STOPS.length - 2, Math.floor(tt * (STOPS.length - 1)));
      const lt = tt * (STOPS.length - 1) - s;
      col[i * 3] = lerp(STOPS[s][0], STOPS[s + 1][0], lt);
      col[i * 3 + 1] = lerp(STOPS[s][1], STOPS[s + 1][1], lt);
      col[i * 3 + 2] = lerp(STOPS[s][2], STOPS[s + 1][2], lt);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.065,
      vertexColors: true,
      transparent: true,
      opacity: 0.55,
      blending: THREE.NormalBlending, // light-only: additive would just wash out on white
      depthWrite: false,
      sizeAttenuation: true,
    });
    const points = new THREE.Points(geo, mat);
    scene.add(points);

    // sample a word into N target positions via an offscreen text canvas
    const tc = document.createElement("canvas");
    tc.width = 440; tc.height = 150;
    const tctx = tc.getContext("2d");
    function setWord(word) {
      tctx.clearRect(0, 0, tc.width, tc.height);
      tctx.fillStyle = "#fff";
      tctx.textAlign = "center"; tctx.textBaseline = "middle";
      let fs = 120; tctx.font = `800 ${fs}px Arial, sans-serif`;
      while (tctx.measureText(word).width > tc.width - 30 && fs > 24) { fs -= 3; tctx.font = `800 ${fs}px Arial, sans-serif`; }
      tctx.fillText(word, tc.width / 2, tc.height / 2 + 2);
      const d = tctx.getImageData(0, 0, tc.width, tc.height).data;
      const pts = [];
      for (let y = 0; y < tc.height; y += 1) for (let x = 0; x < tc.width; x += 1) {
        if (d[(y * tc.width + x) * 4 + 3] > 140) pts.push([x, y]);
      }
      // even coverage → crisp, legible letters: shuffle then round-robin assign
      for (let i = pts.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; const tmp = pts[i]; pts[i] = pts[j]; pts[j] = tmp; }
      // word rests over the right-side hero card zone (mirrored for RTL), same
      // placement convention as the Health scene so it never collides with copy.
      const SX = 7, SY = 7 * (tc.height / tc.width);
      const OX = rtl ? -7 : 7, OY = 6;
      for (let i = 0; i < N; i++) {
        const p = pts.length ? pts[i % pts.length] : [tc.width / 2, tc.height / 2];
        target[i * 3] = (p[0] / tc.width - 0.5) * SX + OX + (Math.random() - 0.5) * 0.035;
        target[i * 3 + 1] = -(p[1] / tc.height - 0.5) * SY + OY + (Math.random() - 0.5) * 0.035;
        target[i * 3 + 2] = (Math.random() - 0.5) * 0.16;
      }
    }
    const toCloud = () => { for (let i = 0; i < N * 3; i++) target[i] = cloud[i]; };

    let inWord = false, phase = 0, wi = -1, raf = 0, running = true;
    let tx = 0, ty = 0, cx = 0, cy = 0;
    const clock = new THREE.Clock();
    const onMove = (e) => { tx = e.clientX / window.innerWidth - 0.5; ty = e.clientY / window.innerHeight - 0.5; };
    const resize = () => { renderer.setSize(W(), H(), false); camera.aspect = W() / H(); camera.updateProjectionMatrix(); };

    const frame = () => {
      if (!running) return;
      const dt = Math.min(clock.getDelta(), 0.05);
      const t = clock.elapsedTime;
      phase += dt;
      if (inWord && phase > 4.6) { inWord = false; phase = 0; toCloud(); }
      else if (!inWord && phase > 3.4) { inWord = true; phase = 0; wi = (wi + 1) % words.length; setWord(words[wi]); }

      // brighten + tighten the dust a touch when it gathers into a word
      mat.size += ((inWord ? 0.078 : 0.065) - mat.size) * 0.08;
      mat.opacity += ((inWord ? 0.9 : 0.42) - mat.opacity) * 0.08;

      const k = inWord ? 0.07 : 0.03; // settle a touch faster when forming, smooth drift otherwise
      const arr = geo.attributes.position.array;
      for (let i = 0; i < N; i++) {
        const j = i * 3;
        let txp = target[j], typ = target[j + 1], tzp = target[j + 2];
        if (!inWord) { // gentle dust drift while resting
          txp += Math.sin(t * 0.5 + seed[i]) * 0.12;
          typ += Math.cos(t * 0.4 + seed[i]) * 0.12;
        }
        arr[j] += (txp - arr[j]) * k;
        arr[j + 1] += (typ - arr[j + 1]) * k;
        arr[j + 2] += (tzp - arr[j + 2]) * k;
      }
      geo.attributes.position.needsUpdate = true;

      if (inWord) { points.rotation.y += (0 - points.rotation.y) * 0.06; points.rotation.x += (0 - points.rotation.x) * 0.06; }
      else { points.rotation.y += dt * 0.04; points.rotation.x = Math.sin(t * 0.1) * 0.04; }

      cx += (tx - cx) * 0.03; cy += (ty - cy) * 0.03;
      camera.position.x = cx * 3; camera.position.y = -cy * 2; camera.lookAt(0, 0, 0);
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
  }, [rtl, words, particleCount]);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className="absolute inset-0 w-full h-full -z-10 pointer-events-none"
      style={{ opacity: 0.85 }}
    />
  );
}
