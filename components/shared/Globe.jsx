// components/shared/Globe.jsx — lightweight WebGL globe (cobe) with Dushanbe pinned.
// Client-only; auto-rotates and is drag-spinnable. Load via next/dynamic(ssr:false).
"use client";
import { useEffect, useRef } from "react";
import createGlobe from "cobe";

export default function Globe() {
  const canvasRef = useRef(null);
  const pointer = useRef(null);
  const phiRef = useRef(0);

  useEffect(() => {
    let width = 0;
    const onResize = () => { if (canvasRef.current) width = canvasRef.current.offsetWidth; };
    window.addEventListener("resize", onResize);
    onResize();

    const globe = createGlobe(canvasRef.current, {
      devicePixelRatio: 2,
      width: width * 2,
      height: width * 2,
      phi: 0,
      theta: 0.28,
      dark: 1,
      diffuse: 1.4,
      mapSamples: 16000,
      mapBrightness: 5,
      baseColor: [0.55, 0.6, 0.85],
      markerColor: [0.97, 0.3, 0.62],
      glowColor: [0.25, 0.5, 1],
      markers: [{ location: [38.5598, 68.787], size: 0.12 }], // Dushanbe, TJ
      onRender: (state) => {
        if (pointer.current === null) phiRef.current += 0.005;
        state.phi = phiRef.current + (pointer.current ?? 0);
        state.width = width * 2;
        state.height = width * 2;
      },
    });

    requestAnimationFrame(() => { if (canvasRef.current) canvasRef.current.style.opacity = "1"; });
    return () => { globe.destroy(); window.removeEventListener("resize", onResize); };
  }, []);

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[460px]">
      <canvas
        ref={canvasRef}
        className="h-full w-full transition-opacity duration-700"
        style={{ contain: "layout paint size", opacity: 0 }}
      />
    </div>
  );
}
