const isDev = process.env.NODE_ENV === "development";

function configuredOrigin(value) {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

const supabaseOrigin = configuredOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseCspSources = Array.from(
  new Set(["https://*.supabase.co", ...(supabaseOrigin ? [supabaseOrigin] : [])])
);

const supabaseRemotePatterns = [
  { protocol: "https", hostname: "*.supabase.co" },
];

if (supabaseOrigin) {
  const url = new URL(supabaseOrigin);
  const pattern = {
    protocol: url.protocol.replace(":", ""),
    hostname: url.hostname,
  };
  if (url.port) pattern.port = url.port;

  const duplicate = supabaseRemotePatterns.some(
    (item) =>
      item.protocol === pattern.protocol &&
      item.hostname === pattern.hostname &&
      (item.port || "") === (pattern.port || "")
  );
  if (!duplicate) supabaseRemotePatterns.push(pattern);
}

// Analytics hosts are allowed ONLY when the matching id is configured at build time (the ids reach the
// build as Docker build args, so this and components/shared/AnalyticsScripts.jsx always agree). With no
// id, nothing from Google or Yandex can load or be connected to.
const gaOn = Boolean(process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID);
const ymOn = Boolean(process.env.NEXT_PUBLIC_YANDEX_METRICA_ID);
const GA = { script: ["https://www.googletagmanager.com"], img: ["https://www.googletagmanager.com", "https://www.google-analytics.com"], connect: ["https://www.google-analytics.com", "https://analytics.google.com", "https://stats.g.doubleclick.net"] };
const YM = { script: ["https://mc.yandex.ru"], img: ["https://mc.yandex.ru"], connect: ["https://mc.yandex.ru", "https://mc.yandex.com"], frame: ["https://mc.yandex.ru"] };
const allow = (kind) => [...(gaOn ? GA[kind] || [] : []), ...(ymOn ? YM[kind] || [] : [])].join(" ");

// Content-Security-Policy tuned to what the application loads:
//   • Supabase REST/storage (cloud or the configured self-hosted origin)
//   • GA4 / Yandex Metrica, only if configured (see above)
// Fonts are emitted by next/font and served from this application origin.
// 'unsafe-inline' remains required by the current Next.js runtime and analytics
// bootstrap snippets. Nonces would force dynamic rendering and defeat ISR
// (decision recorded in docs/SECURITY_DECISIONS.md).
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} ${allow("script")}`.trim(),
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${supabaseCspSources.join(" ")} ${allow("img")}`.trim(),
  "font-src 'self' data:",
  `connect-src 'self'${isDev ? " ws: wss:" : ""} ${supabaseCspSources.join(" ")} ${allow("connect")}`.trim(),
  `frame-src 'self' ${allow("frame")}`.trim(),
  "worker-src 'self' blob:",
  `media-src 'self' blob: ${supabaseCspSources.join(" ")}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  // Two years, HTTPS only. includeSubDomains stays disabled until every
  // subdomain is confirmed to be served over HTTPS.
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
  output: "standalone",
  // End-to-end tests build into their own folder (their NEXT_PUBLIC_* values point
  // at a fake database); unset in production, so the default `.next` is unchanged.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  poweredByHeader: false,
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: supabaseRemotePatterns,
  },
  // xlsx (SheetJS) parses operator uploads server-side only.
  serverExternalPackages: ["xlsx"],
  // Moved out of `experimental` in Next 15; keeping it explicit preserves intent.
  typedRoutes: false,
  experimental: {
    serverActions: {
      bodySizeLimit: "8mb",
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async redirects() {
    return [
      // medoriaco.com is the canonical production domain.
      // Only the www variant redirects to the apex domain.
      { source: "/:path*", has: [{ type: "host", value: "www.medoriaco.com" }], destination: "https://medoriaco.com/:path*", permanent: true },
      // «World» drill-down moved from query params to route segments so pages
      // can be statically prerendered. Preserve old links permanently.
      {
        source: "/beauty/:lang(tg|ru|en|fa)/worlds",
        has: [{ type: "query", key: "dept", value: "(?<dept>[^&]+)" }, { type: "query", key: "group", value: "(?<group>[^&]+)" }],
        destination: "/beauty/:lang/worlds/:dept/:group",
        permanent: true,
      },
      {
        source: "/beauty/:lang(tg|ru|en|fa)/worlds",
        has: [{ type: "query", key: "dept", value: "(?<dept>[^&]+)" }],
        destination: "/beauty/:lang/worlds/:dept",
        permanent: true,
      },
      // Vertical-first migration: old locale-first public routes are Medoria
      // Health. Locale constraints prevent matching system routes.
      { source: "/:lang(tg|ru|en|fa)/:path*", destination: "/health/:lang/:path*", permanent: true },
      { source: "/:lang(tg|ru|en|fa)", destination: "/health/:lang", permanent: true },
    ];
  },
};

module.exports = nextConfig;
