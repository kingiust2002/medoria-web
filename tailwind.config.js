/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx}",
    "./components/**/*.{js,jsx}",
    "./lib/**/*.{js,jsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans:    ['Inter',          'system-ui', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'Inter', 'sans-serif'],
        farsi:   ['Vazirmatn',      'Tahoma',    'sans-serif'],
        // Self-hosted via next/font (app/beauty/[lang]/layout.jsx) — the var
        // resolves to next/font's scoped font-face, not the literal Google name.
        beauty:  ['var(--font-beauty)', 'Georgia', 'serif'],
      },
      colors: {
        // ── Brand spectrum — straight from the logo ─────────────────────────
        // pink/magenta → violet → blue → cyan. This IS the visual identity now.
        brand: {
          pink:    "#F0289E",
          fuchsia: "#E0359E",
          magenta: "#FF3DAE",
          violet:  "#8B2FF7",
          purple:  "#9333EA",
          indigo:  "#5B5BF0",
          blue:    "#3B82F6",
          sky:     "#60A5FA",
          cyan:    "#22D3EE",
          aqua:    "#67E8F9",
        },
        // Kept for the raster logo / legacy halos
        logo: {
          pink:   "#E8188A",
          violet: "#7B2FF7",
          blue:   "#3B5BDB",
          cyan:   "#00C8F0",
        },
        // ── Primary (blue) — the trust anchor, still used widely ─────────────
        primary: {
          50:  "#EFF6FF",
          100: "#DBEAFE",
          200: "#BFDBFE",
          300: "#93C5FD",
          400: "#60A5FA",
          500: "#3B82F6",
          600: "#2563EB",
          700: "#1D4ED8",
          800: "#1E40AF",
          900: "#1E3A8A",
          DEFAULT: "#2563EB",
        },
        cyan: {
          50:  "#ECFEFF",
          100: "#CFFAFE",
          400: "#22D3EE",
          500: "#06B6D4",
          600: "#0891B2",
          DEFAULT: "#06B6D4",
        },
        // Accents now point at the brand spectrum
        accent: {
          violet: "#7C3AED",
          pink:   "#F0289E",
          gold:   "#F59E0B",
        },
        // ── Neutrals — token-backed so they swap per theme (see globals.css) ─
        ink: {
          DEFAULT: "rgb(var(--ink) / <alpha-value>)",
          soft:    "rgb(var(--ink-soft) / <alpha-value>)",
          muted:   "rgb(var(--ink-muted) / <alpha-value>)",
          faint:   "rgb(var(--ink-faint) / <alpha-value>)",
        },
        line: {
          DEFAULT: "rgb(var(--line) / <alpha-value>)",
          soft:    "rgb(var(--line-soft) / <alpha-value>)",
        },
        canvas: {
          DEFAULT: "rgb(var(--canvas) / <alpha-value>)",
          soft:    "rgb(var(--canvas-soft) / <alpha-value>)",
          tint:    "#EEF2FB",
        },
        surface: {
          DEFAULT: "rgb(var(--surface) / <alpha-value>)",
          soft:    "rgb(var(--surface-2) / <alpha-value>)",
        },
        ok:      "#16A34A",
        warn:    "#EA580C",
        navy:    "#080B17",
        // ── Soft tints (subtle backgrounds) ─────────────────────────────────
        tint: {
          blue:   "#EFF4FF",
          cyan:   "#ECFEFF",
          violet: "#F4F1FE",
          pink:   "#FDF1F8",
        },
      },
      backgroundImage: {
        // Full-spectrum brand gradient (the logo flow) — used everywhere now
        "brand-gradient":      "linear-gradient(120deg,#F0289E 0%,#A634E8 38%,#3B82F6 72%,#22D3EE 100%)",
        "brand-gradient-vivid":"linear-gradient(115deg,#FF3DAE 0%,#A634E8 40%,#3B82F6 74%,#3DDCEE 100%)",
        "brand-gradient-soft": "linear-gradient(135deg,#FDF1F8 0%,#F1F0FF 46%,#ECFEFF 100%)",
        "brand-conic":         "conic-gradient(from 180deg at 50% 50%,#F0289E,#A634E8,#3B82F6,#22D3EE,#F0289E)",
        "brand-sheen":         "linear-gradient(120deg,transparent 25%,rgba(255,255,255,0.38) 50%,transparent 75%)",
        "logo-gradient":       "linear-gradient(135deg,#E8188A 0%,#7B2FF7 52%,#3B5BDB 100%)",
        "hero-radial":         "radial-gradient(circle at 30% 20%,rgba(124,58,237,0.10) 0%,rgba(6,182,212,0.05) 50%,transparent 80%)",
        "dot-grid":            "radial-gradient(circle, rgba(99,102,241,0.14) 1px, transparent 1px)",
        "subtle-grid":         "linear-gradient(to right,#E6EAF2 1px,transparent 1px),linear-gradient(to bottom,#E6EAF2 1px,transparent 1px)",
      },
      boxShadow: {
        soft:      "0 1px 2px rgba(15,23,42,0.04), 0 2px 10px rgba(15,23,42,0.05)",
        card:      "0 2px 8px rgba(15,23,42,0.04), 0 12px 36px rgba(15,23,42,0.07)",
        hover:     "0 8px 24px rgba(124,58,237,0.10), 0 24px 60px rgba(37,99,235,0.12)",
        brand:     "0 10px 30px -6px rgba(124,58,237,0.45)",
        "brand-lg":"0 24px 70px -14px rgba(124,58,237,0.55)",
        "glow-pink":"0 0 44px -8px rgba(240,40,158,0.6)",
        "glow-blue":"0 0 44px -8px rgba(59,130,246,0.55)",
        "glow-cyan":"0 0 44px -8px rgba(34,211,238,0.55)",
        ring:      "0 0 0 4px rgba(37,99,235,0.12)",
      },
      animation: {
        shimmer:       "shimmer 1.6s linear infinite",
        "fade-up":     "fadeUp 0.7s cubic-bezier(0.2,0.8,0.2,1) forwards",
        "fade-in":     "fadeIn 0.5s ease forwards",
        marquee:       "marquee 35s linear infinite",
        float:         "float 6s ease-in-out infinite",
        "float-slow":  "float 9s ease-in-out infinite",
        aurora:        "aurora 20s ease-in-out infinite",
        "gradient-pan":"gradientPan 6s ease infinite",
        "spin-slow":   "spin 26s linear infinite",
        "glow-pulse":  "glowPulse 4.5s ease-in-out infinite",
      },
      keyframes: {
        shimmer:{ "0%":{ backgroundPosition:"200% 0"}, "100%":{ backgroundPosition:"-200% 0"} },
        fadeUp: { "0%":{ opacity:0, transform:"translateY(18px)"}, "100%":{ opacity:1, transform:"translateY(0)"} },
        fadeIn: { "0%":{ opacity:0}, "100%":{ opacity:1} },
        marquee:{ "0%":{ transform:"translateX(0)"}, "100%":{ transform:"translateX(-50%)"} },
        float:  { "0%,100%":{ transform:"translateY(0)"}, "50%":{ transform:"translateY(-14px)"} },
        aurora: { "0%,100%":{ transform:"translate(0,0) scale(1)"}, "33%":{ transform:"translate(5%,-7%) scale(1.12)"}, "66%":{ transform:"translate(-5%,5%) scale(0.94)"} },
        gradientPan: { "0%,100%":{ backgroundPosition:"0% 50%"}, "50%":{ backgroundPosition:"100% 50%"} },
        glowPulse: { "0%,100%":{ opacity:0.45}, "50%":{ opacity:0.85} },
      },
    },
  },
  plugins: [],
};
