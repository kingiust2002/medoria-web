// app/layout.jsx
import "./globals.css";
import { Providers } from "./providers";

export const metadata = {
  metadataBase: new URL("https://medoria.tj"),
  title: { default: "Medoria — Medical Catalog", template: "%s | Medoria" },
  description: "Professional B2B catalog of medical consumables for clinics, pharmacies and hospitals in Tajikistan.",
  icons: { icon: "/logo-mark.png", apple: "/logo-mark.png" },
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
      </body>
    </html>
  );
}
