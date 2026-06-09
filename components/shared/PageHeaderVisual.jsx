// components/shared/PageHeaderVisual.jsx
// Subtle, theme-aware decorative banner that sits BEHIND a page header's real
// HTML text (breadcrumb / title / subtitle stay as HTML for SEO + a11y).
// The reference art has baked-in text on its left half, so we anchor the image
// to the right and lay a scrim over the left — only the right-side visual shows
// through. Per-page opacity / filter / object-position / tint because the three
// references differ in how washed-out, sharp, and text-heavy they are, and the
// light theme needs extra colour depth so it never reads as icy/faint.
import Image from "next/image";

export default function PageHeaderVisual({
  name,
  light = 0.2,
  dark = 0.42,
  lightFilter = "none",
  darkFilter = "none",
  objectPosition = "right",
  tint = 0,
}) {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none select-none" aria-hidden="true">
      <Image
        src={`/images/headers/${name}-light.webp`}
        alt=""
        fill
        sizes="100vw"
        style={{ opacity: light, objectPosition, filter: lightFilter }}
        className="object-cover dark:hidden"
      />
      <Image
        src={`/images/headers/${name}-dark.webp`}
        alt=""
        fill
        sizes="100vw"
        style={{ opacity: dark, objectPosition, filter: darkFilter }}
        className="object-cover hidden dark:block"
      />
      {/* scrim: opaque on the left (keeps HTML text crisp + hides any baked-in
          text), clears toward the right so only the right-side visual reads through */}
      <div className="absolute inset-0 bg-gradient-to-r from-canvas-soft from-35% via-canvas-soft/75 to-canvas-soft/10 dark:via-canvas-soft/60 dark:to-transparent" />
      {/* premium blue/violet/cyan depth on the right (light theme only), kept off
          the text zone so HTML copy stays readable */}
      {tint > 0 && (
        <div
          className="absolute inset-0 dark:hidden mix-blend-multiply"
          style={{
            background: `linear-gradient(to left, rgba(124,58,237,${tint}) 0%, rgba(79,70,229,${tint * 0.7}) 25%, rgba(8,145,178,${tint * 0.4}) 50%, transparent 68%)`,
          }}
        />
      )}
    </div>
  );
}
