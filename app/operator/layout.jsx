// app/operator/layout.jsx — base wrapper for the entire operator area.
// Direction, language and font follow the panel language (Persian / Tajik / English, a cookie), calm canvas background.
// Not indexed by search engines.
import PanelFrame from "@/components/panel/PanelFrame";
import { getT } from "@/lib/panel/server";

export async function generateMetadata() {
  const t = await getT();
  return {
    title: t("پنل اپراتور | Medoria"),
    robots: { index: false, follow: false },
    icons: { icon: "/logo-mark.png", apple: "/logo-mark.png" },
  };
}

export default function OperatorLayout({ children }) {
  return <PanelFrame>{children}</PanelFrame>;
}
