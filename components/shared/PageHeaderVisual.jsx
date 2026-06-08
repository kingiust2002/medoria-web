// components/shared/PageHeaderVisual.jsx
// Subtle, theme-aware decorative banner that sits BEHIND a page header's real
// HTML text (breadcrumb / title / subtitle stay as HTML for SEO + a11y).
// The reference art has baked-in text on its left half, so we anchor the image
// to the right and lay a scrim over the left — only the right-side visual shows
// through, at an opacity low enough that it reads as premium texture, never as
// duplicate text. Per-page opacity because the three references differ in how
// much (faint) text/detail they contain.
import Image from "next/image";

export default function PageHeaderVisual({ name, light = 0.2, dark = 0.42 }) {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none select-none" aria-hidden="true">
      <Image
        src={`/images/headers/${name}-light.webp`}
        alt=""
        fill
        sizes="100vw"
        style={{ opacity: light }}
        className="object-cover object-right dark:hidden"
      />
      <Image
        src={`/images/headers/${name}-dark.webp`}
        alt=""
        fill
        sizes="100vw"
        style={{ opacity: dark }}
        className="object-cover object-right hidden dark:block"
      />
      {/* scrim: opaque on the left (keeps text crisp + hides baked-in text), clears to the right */}
      <div className="absolute inset-0 bg-gradient-to-r from-canvas-soft from-35% via-canvas-soft/80 to-canvas-soft/15 dark:via-canvas-soft/65 dark:to-transparent" />
    </div>
  );
}
