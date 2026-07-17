// components/beauty/home/BeautyHeroScene.jsx
// Beauty hero particle field — now a faithful port of Health's HeroScene: a
// cloud of fine champagne/copper particles that drift, then gather to spell
// brand/beauty words over the right-side card, then disperse — repeating, on
// the SAME cadence as Health (rest 3.0s, word 4.6s). Light-only rendering
// (NormalBlending on ivory). Colour follows the page's own navy->copper->gold
// `.gradient-text` direction, biased light so navy stays a rare accent.
// Lazy + capability-gated by the parent; pauses off-screen/hidden; disposes.
"use client";
import { useEffect, useRef } from "react";
import * as THREE from "three";

// Brand-tone stops. The cloud now leans DARK — copper/navy dominant with only
// a champagne minority — so the gathered words read with real contrast against
// the ivory canvas (pale champagne alone was near-invisible).
const CHAMP = [0.953, 0.863, 0.745]; // champagne   #F3DCBE  (light minority)
const COPPER = [0.784, 0.490, 0.306]; // copper     #C87D4E
const COPPER_DEEP = [0.612, 0.357, 0.176]; // deep copper #9C5B2D
const NAVY = [0.106, 0.161, 0.318]; // deep navy    #1C2951
const lerp = (a, b, t) => a + (b - a) * t;
// Medoria + Beauty, then luxury houses the boutique carries.
const WORDS = ["MEDORIA", "BEAUTY", "CHANEL", "DIOR", "GUCCI", "YSL", "LANCOME", "HERMES"];

export default function BeautyHeroScene({ particleCount = 6000, rtl = false }) {
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
    const cloud = new Float32Array(N * 3); // resting champagne-dust positions
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
      // Colour assigned ONCE per particle, weighted DARK for legibility:
      // ~15% champagne (sparkle), ~62% copper, ~23% navy (strong contrast).
      const rc = Math.random();
      let a, b;
      if (rc < 0.15) { a = CHAMP; b = COPPER; }
      else if (rc < 0.77) { a = COPPER; b = COPPER_DEEP; }
      else { a = COPPER_DEEP; b = NAVY; }
      const m = Math.random();
      col[i * 3] = lerp(a[0], b[0], m);
      col[i * 3 + 1] = lerp(a[1], b[1], m);
      col[i * 3 + 2] = lerp(a[2], b[2], m);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.08,
      vertexColors: true,
      transparent: true,
      opacity: 0.62,
      blending: THREE.NormalBlending, // light-only: additive would wash out on ivory
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
      // word rests over the right-side hero card zone (mirrored for RTL).
      const SX = 7, SY = 7 * (tc.height / tc.width);
      const OX = rtl ? -7 : 7, OY = 6;
      for (let i = 0; i < N; i++) {
        const p = pts.length ? pts[i % pts.length] : [tc.width / 2, tc.height / 2];
        target[i * 3] = (p[0] / tc.width - 0.5) * SX + OX + (Math.random() - 0.5) * 0.035;
        target[i * 3 + 1] = -(p[1] / tc.height - 0.5) * SY + OY + (Math.random() - 0.5) * 0.035;
        target[i * 3 + 2] = (Math.random() - 0.5) * 0.16; // flatter → sharper letters
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
      // SAME cadence as Health: rest 3.0s, hold the word 4.6s.
      if (inWord && phase > 4.6) { inWord = false; phase = 0; toCloud(); }
      else if (!inWord && phase > 3.0) { inWord = true; phase = 0; wi = (wi + 1) % WORDS.length; setWord(WORDS[wi]); }

      // crisp + fully opaque when it assembles into a word (denser, darker read)
      mat.size += ((inWord ? 0.105 : 0.08) - mat.size) * 0.08;
      mat.opacity += ((inWord ? 1.0 : 0.62) - mat.opacity) * 0.08;

      const k = inWord ? 0.07 : 0.03; // settle faster when forming, drift otherwise
      const arr = geo.attributes.position.array;
      for (let i = 0; i < N; i++) {
        const j = i * 3;
        let txp = target[j], typ = target[j + 1], tzp = target[j + 2];
        if (!inWord) { // gentle champagne drift while resting
          txp += Math.sin(t * 0.5 + seed[i]) * 0.12;
          typ += Math.cos(t * 0.4 + seed[i]) * 0.12;
        }
        arr[j] += (txp - arr[j]) * k;
        arr[j + 1] += (typ - arr[j + 1]) * k;
        arr[j + 2] += (tzp - arr[j + 2]) * k;
      }
      geo.attributes.position.needsUpdate = true;

      if (inWord) { points.rotation.y += (0 - points.rotation.y) * 0.06; points.rotation.x += (0 - points.rotation.x) * 0.06; }
      else { points.rotation.y += dt * 0.05; points.rotation.x = Math.sin(t * 0.1) * 0.05; }

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
  }, [particleCount, rtl]);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className="absolute inset-0 w-full h-full -z-10 pointer-events-none"
      style={{ opacity: 0.85 }}
    />
  );
}
