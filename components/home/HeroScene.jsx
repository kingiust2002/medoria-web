// components/home/HeroScene.jsx
// Premium hero: thousands of tiny snow/dew particles that drift, then morph to
// spell brand/medical words, then disperse — repeating. Works in BOTH themes
// (additive glow on dark, soft tinted dots on light). Lazy + capability-gated by
// the parent; pauses off-screen/hidden; disposes on unmount.
"use client";
import { useEffect, useRef } from "react";
import * as THREE from "three";

const STOPS = [
  [0.941, 0.157, 0.620], // pink   #F0289E
  [0.651, 0.204, 0.910], // violet #A634E8
  [0.231, 0.510, 0.965], // blue   #3B82F6
  [0.133, 0.827, 0.933], // cyan   #22D3EE
];
const lerp = (a, b, t) => a + (b - a) * t;
const WORDS = ["MEDORIA", "MEDICAL", "QUALITY", "CARE", "TRUST"];

export default function HeroScene({ dark = true, rtl = false }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: "low-power" });
    } catch { return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    const W = () => canvas.clientWidth || 1;
    const H = () => canvas.clientHeight || 1;
    renderer.setSize(W(), H(), false);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(58, W() / H(), 0.1, 100);
    camera.position.z = 15;

    const N = 6000;
    const pos = new Float32Array(N * 3);   // live positions
    const cloud = new Float32Array(N * 3); // resting "dew cloud" positions
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
      size: dark ? 0.05 : 0.07,
      vertexColors: true, transparent: true,
      opacity: dark ? 0.9 : 0.62,
      blending: dark ? THREE.AdditiveBlending : THREE.NormalBlending,
      depthWrite: false, sizeAttenuation: true,
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
      // word sits in the empty UPPER band (right for LTR, left for RTL)
      const SX = 8, SY = 8 * (tc.height / tc.width);
      const OX = rtl ? -3.2 : 3.2, OY = 5.8;
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
      if (inWord && phase > 4.6) { inWord = false; phase = 0; toCloud(); }
      else if (!inWord && phase > 3.0) { inWord = true; phase = 0; wi = (wi + 1) % WORDS.length; setWord(WORDS[wi]); }

      // crisp + brighten the dew when it assembles into a word (smaller, denser)
      mat.size += (((inWord ? (dark ? 0.07 : 0.085) : (dark ? 0.05 : 0.07))) - mat.size) * 0.08;
      mat.opacity += (((inWord ? (dark ? 1.0 : 0.98) : (dark ? 0.85 : 0.5))) - mat.opacity) * 0.08;

      const k = inWord ? 0.07 : 0.03; // settle a touch faster when forming, smooth drift otherwise
      const arr = geo.attributes.position.array;
      for (let i = 0; i < N; i++) {
        const j = i * 3;
        let txp = target[j], typ = target[j + 1], tzp = target[j + 2];
        if (!inWord) { // gentle dew drift while resting
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
  }, [dark, rtl]);

  return <canvas ref={ref} aria-hidden="true" className="absolute inset-0 w-full h-full -z-10 pointer-events-none" style={{ opacity: dark ? 0.95 : 0.85 }} />;
}
