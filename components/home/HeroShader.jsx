// components/home/HeroShader.jsx
// ONE controlled premium WebGL aurora for the hero backdrop.
// Heavily gated: desktop-only, not reduced-motion, enough CPU, WebGL available.
// Any failure → renders an inert transparent canvas, so the CSS/SVG <Aurora>
// underneath remains the fallback. Pauses when tab hidden or hero off-screen.
"use client";
import { useEffect, useRef } from "react";

const FRAG = `
precision mediump float;
uniform vec2 u_res;
uniform float u_time;
float hash(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
float noise(vec2 p){
  vec2 i=floor(p), f=fract(p);
  float a=hash(i), b=hash(i+vec2(1.0,0.0)), c=hash(i+vec2(0.0,1.0)), d=hash(i+vec2(1.0,1.0));
  vec2 u=f*f*(3.0-2.0*f);
  return mix(mix(a,b,u.x),mix(c,d,u.x),u.y);
}
float fbm(vec2 p){ float v=0.0,a=0.5; for(int i=0;i<5;i++){ v+=a*noise(p); p*=2.0; a*=0.5; } return v; }
void main(){
  vec2 uv = gl_FragCoord.xy / u_res.xy;
  vec2 p = uv * vec2(u_res.x/u_res.y, 1.0);
  float t = u_time * 0.035;
  vec2 q = vec2(fbm(p*1.4 + vec2(0.0, t)), fbm(p*1.4 + vec2(5.2, -t)));
  float n = fbm(p*1.9 + q*1.4 + vec2(t*0.5, t*0.3));
  vec3 pink   = vec3(0.925, 0.118, 0.584);
  vec3 violet = vec3(0.545, 0.184, 0.969);
  vec3 blue   = vec3(0.145, 0.388, 0.922);
  vec3 cyan   = vec3(0.024, 0.714, 0.831);
  vec3 col = mix(violet, blue, smoothstep(0.2, 0.62, n));
  col = mix(col, cyan, smoothstep(0.55, 0.92, n));
  col = mix(col, pink, smoothstep(0.0, 0.22, n) * 0.7);
  float glow = smoothstep(0.18, 0.85, n);
  float falloff = smoothstep(1.05, 0.05, uv.y);          // richer up top, fade down
  float sides = smoothstep(0.0, 0.35, uv.x) * smoothstep(1.0, 0.65, uv.x) + 0.45;
  float alpha = glow * 0.38 * falloff * clamp(sides, 0.0, 1.0);
  gl_FragColor = vec4(col * glow, alpha);
}`;

const VERT = `attribute vec2 a; void main(){ gl_Position = vec4(a, 0.0, 1.0); }`;

export default function HeroShader() {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    // ── Gates ──────────────────────────────────────────────
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const desktop = window.matchMedia("(min-width: 1024px)").matches;
    const lowCPU = (navigator.hardwareConcurrency || 4) < 4;
    const saveData = navigator.connection && navigator.connection.saveData;
    if (reduce || !desktop || lowCPU || saveData) return;

    let gl;
    try {
      gl = canvas.getContext("webgl", { alpha: true, antialias: false, premultipliedAlpha: false, powerPreference: "low-power", depth: false });
    } catch { gl = null; }
    if (!gl) return;

    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { gl.deleteShader(s); return null; }
      return s;
    };
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;
    const prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "a");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const uRes = gl.getUniformLocation(prog, "u_res");
    const uTime = gl.getUniformLocation(prog, "u_time");
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const SCALE = 0.62; // render below CSS resolution — the effect is soft, so cheap
    const resize = () => {
      const w = Math.max(1, Math.floor(canvas.clientWidth * SCALE));
      const h = Math.max(1, Math.floor(canvas.clientHeight * SCALE));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uRes, canvas.width, canvas.height);
    };
    resize();
    window.addEventListener("resize", resize);

    let raf = 0, running = true, start = performance.now();
    const frame = (now) => {
      if (!running) return;
      gl.uniform1f(uTime, (now - start) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      raf = requestAnimationFrame(frame);
    };
    const play = () => { if (!running) { running = true; start = performance.now() - 1000; raf = requestAnimationFrame(frame); } };
    const pause = () => { running = false; cancelAnimationFrame(raf); };
    raf = requestAnimationFrame(frame);

    const onVis = () => (document.hidden ? pause() : play());
    document.addEventListener("visibilitychange", onVis);

    // pause when hero scrolls off-screen
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
      const ext = gl.getExtension("WEBGL_lose_context");
      if (ext) ext.loseContext();
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className="absolute inset-0 w-full h-full -z-10 pointer-events-none"
      style={{ opacity: 0.95 }}
    />
  );
}
