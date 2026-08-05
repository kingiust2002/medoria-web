// components/beauty/BeautyPageHeader.jsx — the beauty-ized twin of
// components/shared/PageHeaderVisual: a decorative banner that sits BEHIND a
// page header's real HTML text, so the breadcrumb, title and subtitle stay
// crawlable HTML.
//
// Two things it does that the Health one does not:
//
//  • Direction. The photographs are art-directed with their empty third on the
//    LEFT, because that is where the headline lands in the three LTR locales.
//    In the Persian route the headline moves to the right, so the picture is
//    mirrored and the scrim flipped with it — otherwise the type would sit on
//    the busiest part of the frame. Mirroring is safe here precisely because
//    the brief forbids text, logos and hands in these images.
//
//  • Palette. It leans on the vertical's own tokens (--v-glow, canvas-soft),
//    which the [data-vertical="beauty"] scope has already remapped to the
//    ivory/champagne set, so no colours are hard-coded.
import Image from "next/image";

export default function BeautyPageHeader({
  name,
  // Beauty is light-first: the light grade carries the page, the dark grade is
  // a derived relight of the SAME frame so the two themes stay aligned.
  light = 0.46,
  dark = 0.5,
  objectPosition = "center",
  // The Maisons band sets white type over a deep ground, so its photograph is
  // shot dark and needs no ivory scrim washing it out.
  onDark = false,
}) {
  // The type zone has to be fully covered, but the middle stop is what decides
  // whether the picture reads at all — at 80% the frame vanished and only the
  // far right edge survived, which looked like a mistake rather than a design.
  //
  // Phones get a much heavier scrim: the band is the same picture at a third
  // of the width, so the headline lands on the subject rather than beside it.
  // Mobile values are the base and the desktop ones are the `md:` override.
  const scrim = onDark
    ? "from-black/80 from-45% via-black/60 to-black/40 md:from-24% md:via-black/35 md:to-black/10"
    : "from-canvas-soft from-45% via-canvas-soft/88 to-canvas-soft/50 md:from-24% md:via-canvas-soft/62 md:to-canvas-soft/5";

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none select-none" aria-hidden="true">
      <div className="absolute inset-0 rtl:scale-x-[-1]">
        <Image
          src={`/beauty/headers/${name}-light.webp`}
          alt=""
          fill
          sizes="100vw"
          style={{ opacity: light, objectPosition }}
          className="object-cover dark:hidden"
        />
        <Image
          src={`/beauty/headers/${name}-dark.webp`}
          alt=""
          fill
          sizes="100vw"
          style={{ opacity: dark, objectPosition }}
          className="object-cover hidden dark:block"
        />
      </div>
      {/* Scrim: opaque where the type sits, clearing toward the picture. */}
      <div className={`absolute inset-0 bg-gradient-to-r ${scrim} rtl:hidden`} />
      <div className={`absolute inset-0 bg-gradient-to-l ${scrim} hidden rtl:block`} />
    </div>
  );
}
