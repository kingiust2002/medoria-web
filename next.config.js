/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },
  experimental: { typedRoutes: false },
  // 301 the secondary domain to the canonical one (only fires when the request
  // host is medoria.com; medoria.tj / vercel.app are unaffected).
  async redirects() {
    return [
      { source: "/:path*", has: [{ type: "host", value: "medoria.com" }], destination: "https://medoria.tj/:path*", permanent: true },
      { source: "/:path*", has: [{ type: "host", value: "www.medoria.com" }], destination: "https://medoria.tj/:path*", permanent: true },
    ];
  },
};

module.exports = nextConfig;
