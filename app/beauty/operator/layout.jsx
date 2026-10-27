// app/beauty/operator/layout.jsx — base wrapper for the entire BEAUTY
// operator area. A static sibling of app/beauty/[lang], so it wins route
// matching over the locale tree and inherits none of the public chrome.
// Direction, language and font follow the panel language (Persian / Tajik / English, a cookie). Never indexed.
import PanelFrame from "@/components/panel/PanelFrame";
import { tr } from "@/lib/panel/i18n";

export const metadata = {
  title: tr("پنل بیوتی | Medoria Beauty"),
  robots: { index: false, follow: false },
  icons: { icon: { url: "/brand/beauty-mark-icon.webp", type: "image/webp" }, apple: { url: "/brand/beauty-mark-icon.webp", type: "image/webp" } },
};

export default function BeautyOperatorLayout({ children }) {
  // data-vertical="beauty" puts the whole panel inside the Beauty token scope, so btn-primary / gradient-text render
  // nude-copper-navy — the panel wears its own house colors, not the default violet.
  return <PanelFrame dataVertical="beauty" className="bop">{children}</PanelFrame>;
}
