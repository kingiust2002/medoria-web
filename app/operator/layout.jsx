// app/operator/layout.jsx — base wrapper for the entire operator area.
// RTL + Persian font, calm canvas background. Not indexed by search engines.
export const metadata = {
  title: "پنل اپراتور | Medoria",
  robots: { index: false, follow: false },
  icons: { icon: "/logo-mark.png", apple: "/logo-mark.png" },
};

export default function OperatorLayout({ children }) {
  return (
    <div dir="rtl" lang="fa" className="font-farsi min-h-screen bg-canvas text-ink">
      {children}
    </div>
  );
}
