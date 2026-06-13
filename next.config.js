const isDev = process.env.NODE_ENV === "development";

// Content-Security-Policy tuned to exactly what the app loads:
//   • Supabase (REST + storage images) • Google Fonts • GA4 • Yandex Metrica
//   • Vercel Analytics (same-origin /_vercel + vitals endpoint)
// 'unsafe-inline' for scripts/styles is required by Next.js inline runtime
// chunks, styled-jsx and the GA/YM bootstrap snippets (no nonce infra — nonces
// would force every page dynamic and defeat ISR). The CSP still enforces the
// high-value invariants: no foreign script/connect/frame origins, no objects,
// no base-uri takeover, no being framed. Dev adds eval/ws for HMR only.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://www.googletagmanager.com https://mc.yandex.ru https://va.vercel-scripts.com`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https://*.supabase.co https://www.googletagmanager.com https://www.google-analytics.com https://mc.yandex.ru",
  "font-src 'self' data: https://fonts.gstatic.com",
  `connect-src 'self'${isDev ? " ws: wss:" : ""} https://*.supabase.co https://www.google-analytics.com https://analytics.google.com https://stats.g.doubleclick.net https://mc.yandex.ru https://mc.yandex.com https://vitals.vercel-insights.com`,
  "frame-src 'self' https://mc.yandex.ru",
  "worker-src 'self' blob:",
  "media-src 'self' blob: https://*.supabase.co",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  // 2 years, HTTPS-only site behind Vercel. includeSubDomains is intentionally
  // omitted until every subdomain of the apex domains is confirmed HTTPS.
  { key: "Strict-Transport-Security", value: "max-age=63072000" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  // allow-popups keeps the WhatsApp/Telegram window.open handoff working.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },
  experimental: { typedRoutes: false },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // 301 the secondary domain to the canonical one (only fires when the request
  // host is medoria.com; medoria.tj / vercel.app are unaffected).
  async redirects() {
    return [
      { source: "/:path*", has: [{ type: "host", value: "medoria.com" }], destination: "https://medoria.tj/:path*", permanent: true },
      { source: "/:path*", has: [{ type: "host", value: "www.medoria.com" }], destination: "https://medoria.tj/:path*", permanent: true },
      // Vertical-first migration: old locale-first public routes are now Medoria
      // Health. Permanent, single-hop, path-tail preserved. The locale enum keeps
      // these from ever matching /health, /beauty, /operator, /api or /.
      { source: "/:lang(tg|ru|en|fa)/:path*", destination: "/health/:lang/:path*", permanent: true },
      { source: "/:lang(tg|ru|en|fa)", destination: "/health/:lang", permanent: true },
    ];
  },
};

module.exports = nextConfig;
