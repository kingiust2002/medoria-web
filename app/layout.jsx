// app/layout.jsx — root document + global metadata, OG defaults, analytics.
import "./globals.css";
import { Providers } from "./providers";
import { Analytics } from "@vercel/analytics/react";
import AnalyticsScripts from "@/components/shared/AnalyticsScripts";
import { SITE_URL, ogImage } from "@/lib/seo";

const TITLE = "Medoria — Medical Supplies & Consumables in Tajikistan";
const DESC =
  "Professional B2B catalog of medical consumables and supplies — gloves, masks, syringes, dressings, infusion sets and lab essentials — for clinics, pharmacies and hospitals across Tajikistan.";

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: TITLE, template: "%s | Medoria" },
  description: DESC,
  applicationName: "Medoria",
  // Neutral default: the two vertical marks combined, half/half — the
  // gateway's own light-split motif in miniature. Health and Beauty pages
  // override this with their OWN single mark (see their layouts); this
  // combined one is only ever seen on the gateway and other neutral pages
  // (e.g. /login).
  icons: { icon: "/brand/gateway-mark-combined.png", apple: "/brand/gateway-mark-combined.png" },
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
    <html suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Plus+Jakarta+Sans:wght@600;700;800&family=Vazirmatn:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Providers>{children}</Providers>
        <AnalyticsScripts />
        <Analytics />
      </body>
    </html>
  );
}
