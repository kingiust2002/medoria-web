// app/layout.jsx — root document + global metadata and analytics.
import "./globals.css";
import { Inter, Plus_Jakarta_Sans, Vazirmatn } from "next/font/google";
import { Providers } from "./providers";
import AnalyticsScripts from "@/components/shared/AnalyticsScripts";
import { SITE_URL, ogImage } from "@/lib/seo";

// Self-hosted at build time via next/font. The generated font files are served
// from this application origin, so browsers do not depend on Google Fonts at
// runtime. Cyrillic ships with the sans face for Tajik; Vazirmatn carries the
// Arabic subset for fa/RTL.
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
      </body>
    </html>
  );
}
