// app/beauty/operator/layout.jsx — base wrapper for the entire BEAUTY
// operator area. A static sibling of app/beauty/[lang], so it wins route
// matching over the locale tree and inherits none of the public chrome.
// RTL + Persian font, calm canvas background. Never indexed.
export const metadata = {
  title: "پنل بیوتی | Medoria Beauty",
  robots: { index: false, follow: false },
};

export default function BeautyOperatorLayout({ children }) {
  return (
    // data-vertical="beauty" puts the whole panel inside the Beauty token
    // scope, so btn-primary / gradient-text render nude-copper-navy — the
    // panel wears its own house colors, not the default violet.
    <div dir="rtl" lang="fa" data-vertical="beauty" className="bop font-farsi min-h-screen bg-canvas text-ink">
      {children}
    </div>
  );
}
