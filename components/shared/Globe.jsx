// components/shared/Globe.jsx — real interactive 3D WebGL globe (cobe).
// Theme-aware: bright dots on a dark globe (dark theme) / darker dots on a light
// globe (light theme). Auto-rotates. Dushanbe is pinned. Load via dynamic(ssr:false).
"use client";
import { useEffect, useRef } from "react";
import createGlobe from "cobe";

export default function Globe({ dark = true }) {
  const canvasRef = useRef(null);
  const phiRef = useRef(0);

  useEffect(() => {
    let width = 0;
    const onResize = () => { if (canvasRef.current) width = canvasRef.current.offsetWidth; };
    window.addEventListener("resize", onResize);
    onResize();

    const theme = dark
      ? { dark: 1, baseColor: [0.72, 0.77, 0.96], markerColor: [0.97, 0.3, 0.62], glowColor: [0.3, 0.5, 1.0], diffuse: 1.2, mapBrightness: 6 }
      : { dark: 0, baseColor: [0.42, 0.48, 0.78], markerColor: [0.82, 0.12, 0.5], glowColor: [0.75, 0.82, 1.0], diffuse: 1.6, mapBrightness: 2.2 };

    let globe;
    try {
      globe = createGlobe(canvasRef.current, {
        devicePixelRatio: 2,
        width: width * 2,
        height: width * 2,
        phi: 0,
        theta: 0.28,
        mapSamples: 16000,
        markers: [{ location: [38.5598, 68.787], size: 0.12 }],
        ...theme,
        onRender: (state) => {
          phiRef.current += 0.004;
          state.phi = phiRef.current;
          state.width = width * 2;
          state.height = width * 2;
        },
      });
      requestAnimationFrame(() => { if (canvasRef.current) canvasRef.current.style.opacity = "1"; });
    } catch {
      /* WebGL unavailable — leave the canvas blank */
    }
    return () => {
      if (globe) globe.destroy();
      window.removeEventListener("resize", onResize);
    };
  }, [dark]);

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
