// components/home/HeroScene.jsx
// "Max-wow" hero: a real three.js GPU particle field (depth + parallax, brand
// spectrum, additive glow). Lazy (loaded via next/dynamic) and only mounted on
// capable desktops in dark theme — otherwise the CSS <Aurora> is the fallback.
// Pauses when the hero is off-screen or the tab is hidden; disposes on unmount.
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

export default function HeroScene() {
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

    const N = 2600;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const r = 6 + Math.random() * 5.5;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      const x = r * Math.sin(ph) * Math.cos(th) * 1.45;
      const y = r * Math.cos(ph) * 0.85;
      const z = r * Math.sin(ph) * Math.sin(th);
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      const tt = Math.max(0, Math.min(1, x / 8.7 * 0.5 + 0.5));
      const seg = Math.min(STOPS.length - 2, Math.floor(tt * (STOPS.length - 1)));
      const lt = tt * (STOPS.length - 1) - seg;
      col[i * 3]     = lerp(STOPS[seg][0], STOPS[seg + 1][0], lt);
      col[i * 3 + 1] = lerp(STOPS[seg][1], STOPS[seg + 1][1], lt);
      col[i * 3 + 2] = lerp(STOPS[seg][2], STOPS[seg + 1][2], lt);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.08, vertexColors: true, transparent: true, opacity: 0.92,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    });
    const points = new THREE.Points(geo, mat);
    scene.add(points);

    let tx = 0, ty = 0, cx = 0, cy = 0, raf = 0, running = true;
    const clock = new THREE.Clock();
    const onMove = (e) => { tx = e.clientX / window.innerWidth - 0.5; ty = e.clientY / window.innerHeight - 0.5; };
    const resize = () => { renderer.setSize(W(), H(), false); camera.aspect = W() / H(); camera.updateProjectionMatrix(); };

    const frame = () => {
      if (!running) return;
      const t = clock.getElapsedTime();
      points.rotation.y = t * 0.05;
      points.rotation.x = Math.sin(t * 0.11) * 0.08;
      cx += (tx - cx) * 0.035; cy += (ty - cy) * 0.035;
      camera.position.x = cx * 3.2; camera.position.y = -cy * 2.2; camera.lookAt(0, 0, 0);
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
  }, []);

  return <canvas ref={ref} aria-hidden="true" className="absolute inset-0 w-full h-full -z-10 pointer-events-none" style={{ opacity: 0.95 }} />;
}
