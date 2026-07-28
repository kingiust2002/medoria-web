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

// Content-Security-Policy tuned to what the application loads:
//   • Supabase REST/storage (cloud or the configured self-hosted origin)
//   • GA4 • Yandex Metrica
// Fonts are emitted by next/font and served from this application origin.
// 'unsafe-inline' remains required by the current Next.js runtime and analytics
// bootstrap snippets. Nonces would force dynamic rendering and defeat ISR.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://www.googletagmanager.com https://mc.yandex.ru`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${supabaseCspSources.join(" ")} https://www.googletagmanager.com https://www.google-analytics.com https://mc.yandex.ru`,
  "font-src 'self' data:",
  `connect-src 'self'${isDev ? " ws: wss:" : ""} ${supabaseCspSources.join(" ")} https://www.google-analytics.com https://analytics.google.com https://stats.g.doubleclick.net https://mc.yandex.ru https://mc.yandex.com`,
  "frame-src 'self' https://mc.yandex.ru",
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
  poweredByHeader: false,
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: supabaseRemotePatterns,
  },
  // xlsx (SheetJS) is parsed server-side only (lib/operator/spreadsheetServer.js).
  // Marking it external keeps the CJS lib out of the client graph entirely.
  experimental: { typedRoutes: false, serverComponentsExternalPackages: ["xlsx", "exceljs"] },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async redirects() {
    return [
      // medoria.co is the selected canonical domain. The secondary domain and
      // www variants redirect in one permanent hop after DNS cutover.
      { source: "/:path*", has: [{ type: "host", value: "medoriaco.com" }], destination: "https://medoria.co/:path*", permanent: true },
      { source: "/:path*", has: [{ type: "host", value: "www.medoriaco.com" }], destination: "https://medoria.co/:path*", permanent: true },
      { source: "/:path*", has: [{ type: "host", value: "www.medoria.co" }], destination: "https://medoria.co/:path*", permanent: true },
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
