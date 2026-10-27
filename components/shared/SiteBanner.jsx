// components/shared/SiteBanner.jsx — the announcement strip of a house (server component). Renders NOTHING unless a banner is live, so
// the pages look exactly as before until a person publishes one in the panel. Plain text only; the link is validated twice (when saved
// and when shown). The colours are the house's own tokens (--line, --ink, --v-accent), so Health and Beauty each keep their identity.
import Link from "next/link";
import { getLiveContent } from "@/lib/siteContentPublic";
import { pickBanner } from "@/lib/siteContent";

export default async function SiteBanner({ house, lang }) {
  const banner = pickBanner(await getLiveContent(house, "banner"), lang);
  if (!banner) return null;
  const external = banner.href.startsWith("https://");
  const link = banner.href
    ? external
      ? <a href={banner.href} target="_blank" rel="noopener noreferrer" className="ms-2 font-semibold underline underline-offset-2 hover:opacity-80" style={{ color: "var(--v-accent, currentColor)" }}>{banner.label || banner.text}</a>
      : <Link href={banner.href} className="ms-2 font-semibold underline underline-offset-2 hover:opacity-80" style={{ color: "var(--v-accent, currentColor)" }}>{banner.label || banner.text}</Link>
    : null;
  return (
    <div data-testid="site-banner" data-tone={banner.tone} className={`border-b border-line text-ink ${banner.tone === "promo" ? "bg-canvas-soft" : "bg-line-soft"}`}>
      <div className="container-x py-2 text-center text-xs sm:text-sm leading-relaxed [overflow-wrap:anywhere]">
        {banner.href && !banner.label ? link : <><span>{banner.text}</span>{link}</>}
      </div>
    </div>
  );
}
