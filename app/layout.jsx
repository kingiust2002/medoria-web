// app/layout.jsx — root document + global metadata, OG defaults, analytics.
import "./globals.css";
import { Inter, Plus_Jakarta_Sans, Vazirmatn } from "next/font/google";
import { Providers } from "./providers";
import { Analytics } from "@vercel/analytics/react";
import AnalyticsScripts from "@/components/shared/AnalyticsScripts";
import { SITE_URL, ogImage } from "@/lib/seo";

// Self-hosted at build time via next/font (same approach as the Playfair
// display face in app/beauty/[lang]/layout.jsx). Previously these three
// families were pulled at runtime from fonts.googleapis.com by a
// render-blocking <link>: two extra origins to resolve + handshake before the
// browser could paint any text, and 14 woff2 files (~371 KB) from a third
// party — routinely slow or throttled on the networks our Tajik/Persian
// audience browses from. next/font emits the @font-face CSS inline, serves the
// woff2 from our own origin, and preloads it, so first paint no longer waits
// on Google. Each exposes a CSS variable consumed by tailwind.config.js
// (`font-sans` / `font-display` / `font-farsi`) and globals.css.
// Cyrillic ships with the sans face because Tajik (the default locale) is
// written in Cyrillic; Vazirmatn carries the Arabic subset for fa/RTL.
const inter = Inter({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sans",
  display: "swap",
});
const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-display",
  display: "swap",
});
const vazirmatn = Vazirmatn({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-farsi",
  display: "swap",
});

const TITLE = "Medoria — Medical Supplies & Consumables in Tajikistan";
const DESC =
  "Professional B2B catalog of medical consumables and supplies — gloves, masks, syringes, dressings, infusion sets and lab essentials — for clinics, pharmacies and hospitals across Tajikistan.";

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: TITLE, template: "%s | Medoria" },
  description: DESC,
  applicationName: "Medoria",
  // Neutral default: ONE mark fused down the middle — left half in Health's
  // colors, right half in Beauty's (both marks share the same underlying
  // ribbon-cross geometry, so the two halves seam into a single shape, not
  // two icons side by side). Health and Beauty pages override this with
  // their OWN single-color mark (see their layouts); this fused one is only
  // ever seen on the gateway and other neutral pages (e.g. /login).
  icons: {
    icon: { url: "/brand/gateway-mark-combined.webp", type: "image/webp" },
    apple: { url: "/brand/gateway-mark-combined.webp", type: "image/webp" },
  },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    siteName: "Medoria",
    title: TITLE,
    description: "B2B medical consumables and supplies across Tajikistan. Direct supply via WhatsApp & Telegram.",
    images: [{ url: ogImage(), width: 1200, height: 630, alt: "Medoria — B2B medical supplies" }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: "B2B medical consumables and supplies across Tajikistan.",
    images: [ogImage()],
  },
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || undefined,
    yandex: process.env.NEXT_PUBLIC_YANDEX_VERIFICATION || undefined,
  },
};

export default function RootLayout({ children }) {
  return (
    <html suppressHydrationWarning className={`${inter.variable} ${plusJakartaSans.variable} ${vazirmatn.variable}`}>
      <body>
        <Providers>{children}</Providers>
        <AnalyticsScripts />
        <Analytics />
      </body>
    </html>
  );
}
