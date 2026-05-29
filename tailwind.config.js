/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx}",
    "./components/**/*.{js,jsx}",
    "./lib/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans:    ['Inter',          'system-ui', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'Inter', 'sans-serif'],
        farsi:   ['Vazirmatn',      'Tahoma',    'sans-serif'],
      },
      colors: {
        // ── Brand — derived from logo (kept as-is for logo) ─────────────────
        // These are USED only for the logo and rare accents — NOT for main UI
        logo: {
          pink:   "#E8188A",
          violet: "#7B2FF7",
          blue:   "#3B5BDB",
          cyan:   "#00C8F0",
        },
        // ── Primary B2B Medical Palette ─────────────────────────────────────
        primary: {
          50:  "#EFF6FF",
          100: "#DBEAFE",
          200: "#BFDBFE",
          300: "#93C5FD",
          400: "#60A5FA",
          500: "#3B82F6",
          600: "#2563EB",   // ← MAIN brand color
          700: "#1D4ED8",
          800: "#1E40AF",
          900: "#1E3A8A",
          DEFAULT: "#2563EB",
        },
        cyan: {
          50:  "#ECFEFF",
          100: "#CFFAFE",
          400: "#22D3EE",
          500: "#06B6D4",   // ← accent
          600: "#0891B2",
          DEFAULT: "#06B6D4",
        },
        // Used sparingly — for SALE badge or special features
        accent: {
          violet: "#7C3AED",
          pink:   "#DB2777",
          gold:   "#D97706",
        },
        // ── Neutrals (Medline / McKesson style) ─────────────────────────────
        ink:     { DEFAULT: "#0F172A", soft: "#1E293B", muted: "#475569", faint: "#94A3B8" },
        line:    { DEFAULT: "#E2E8F0", soft: "#F1F5F9" },
        canvas:  { DEFAULT: "#FFFFFF", soft: "#F8FAFC", tint: "#F1F5F9" },
        ok:      "#16A34A",
        warn:    "#EA580C",
        navy:    "#0F172A",
        // ── Soft backgrounds (subtle) ───────────────────────────────────────
        tint: {
          blue:   "#EFF6FF",
          cyan:   "#ECFEFF",
          violet: "#F5F3FF",
        },
      },
      backgroundImage: {
        // ── Main brand gradient (B2B blue) ──────────────────────────────────
        "brand-gradient":     "linear-gradient(135deg,#2563EB 0%,#0891B2 100%)",
        "brand-gradient-soft":"linear-gradient(135deg,#EFF6FF 0%,#ECFEFF 100%)",
        // Logo gradient — kept for the logo only
        "logo-gradient":      "linear-gradient(135deg,#E8188A 0%,#7B2FF7 52%,#3B5BDB 100%)",
        "hero-radial":        "radial-gradient(circle at 30% 20%,rgba(37,99,235,0.07) 0%,rgba(6,182,212,0.04) 50%,transparent 80%)",
        "subtle-grid":        "linear-gradient(to right, #E2E8F0 1px, transparent 1px), linear-gradient(to bottom, #E2E8F0 1px, transparent 1px)",
      },
      boxShadow: {
        soft:   "0 1px 2px rgba(15,23,42,0.04), 0 1px 8px rgba(15,23,42,0.04)",
        card:   "0 2px 8px rgba(15,23,42,0.04), 0 8px 32px rgba(15,23,42,0.06)",
        hover:  "0 4px 16px rgba(15,23,42,0.06), 0 16px 48px rgba(37,99,235,0.08)",
        brand:  "0 8px 24px rgba(37,99,235,0.22)",
        ring:   "0 0 0 4px rgba(37,99,235,0.10)",
      },
      animation: {
        shimmer:  "shimmer 1.6s linear infinite",
        "fade-up":"fadeUp 0.7s cubic-bezier(0.2,0.8,0.2,1) forwards",
        "fade-in":"fadeIn 0.5s ease forwards",
        marquee:  "marquee 35s linear infinite",
      },
      keyframes: {
        shimmer:{ "0%":{ backgroundPosition:"200% 0"}, "100%":{ backgroundPosition:"-200% 0"} },
        fadeUp: { "0%":{ opacity:0, transform:"translateY(16px)"}, "100%":{ opacity:1, transform:"translateY(0)"} },
        fadeIn: { "0%":{ opacity:0}, "100%":{ opacity:1} },
        marquee:{ "0%":{ transform:"translateX(0)"}, "100%":{ transform:"translateX(-50%)"} },
      },
    },
  },
  plugins: [],
};
