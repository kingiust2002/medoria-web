# LUMEN GATE — optional enhancement assets

**Status: OPTIONAL ONLY.** The gateway at `/` is complete and production-ready
today, built on the existing campaign pair
(`public/images/gateway/mirror-cold.jpg` + `mirror-warm.jpg` and their
optimized WebP derivatives). Nothing below is required; nothing below blocks
anything. If a file listed here is uploaded, `lib/gateway/media.js`
auto-detects it on the next build and the page upgrades itself. If it is
absent, the page shows no gap, no placeholder, no broken media.

Do **not** spend Higgsfield/Motion credits (or any paid generation) on these
without the owner's explicit approval of the prompts below.

## Hard content rules (all assets)

- No people, no faces, no hands.
- No readable text inside the image, no labels, no fake logos, no fake
  certification marks, no copyrighted packaging.
- Same scene family as the existing pair: fluted glass carafe, spherical
  bottle, frosted jars with brushed-metal lids, black marble dish with water
  ripple, white orchid stem, silk drape on veined marble.
- Health grading: brushed SILVER lids, glacial blue-white morning light.
- Beauty grading: brushed GOLD/copper lids, champagne rim light.
- Paired assets must come from the SAME base frame (image-to-image
  relight/edit), never two independent generations — the aperture wipe only
  works if composition is pixel-aligned.

## 1. Cinemagraph loops (the "living vitrine")

| File | Role |
| --- | --- |
| `public/images/gateway/lumen-cold.webm` (+ `.mp4` fallback) | Health grading in motion |
| `public/images/gateway/lumen-warm.webm` (+ `.mp4` fallback) | Beauty grading in motion |

Spec: 16:9, ≥1920×1080, 5–8 s seamless loop, **camera locked** (zero pan/zoom
— the two loops must stay aligned with each other and with the stills), muted,
≤ ~4 MB each after compression (`webm` VP9 preferred, `mp4` H.264 fallback).
The existing stills remain the posters, the LCP image, and the
reduced-motion / Save-Data / mobile / low-core fallback — the code already
gates video off in all of those cases and silently falls back if playback
fails.

Motion prompt (apply to each grading's still as image-to-video):

> Cinemagraph from this exact frame, camera completely locked. Only micro
> motion: the water ripple in the black marble dish slowly pulses outward,
> the silk drape breathes almost imperceptibly, dust motes drift through the
> light shaft, a slow bloom of light intensity (±5%). Everything else frozen.
> Seamless loop, luxury campaign film, 6 seconds.
> Negative: no camera movement, no people, no hands, no text, no logos, no
> watermark, no added objects, no color shift.

## 2. Macro specimen details (plaque "lenses")

| File | Role |
| --- | --- |
| `public/images/gateway/lumen-health-macro.webp` (or `.jpg`) | circular specimen inside the Health plaque |
| `public/images/gateway/lumen-beauty-macro.webp` (or `.jpg`) | circular specimen inside the Beauty plaque |

Spec: square 1:1, ≥1200×1200, subject centered (shown in a circular crop),
≤ ~200 KB after optimization.

Health macro prompt:

> Extreme macro photograph, 100mm lens, laboratory-grade: a single clear
> water droplet resting on brushed silver metal, glacial blue-white light,
> razor-thin depth of field, clinical precision, cold glass reflections.
> Negative: no people, no text, no logos, no labels, no watermark.

Beauty macro prompt:

> Extreme macro photograph, 100mm lens, editorial cosmetic still life: pearl
> dew on champagne silk beside a brushed copper cap edge, warm rim light,
> soft glow, sensual and quiet.
> Negative: no people, no text, no logos, no labels, no watermark.

## 3. Optional mobile portrait crops

Not currently needed — the desktop pair center-crops safely at 390 px. Only
if a future art direction demands it: `lumen-cold-portrait.*` /
`lumen-warm-portrait.*`, 4:5, ≥1600 px tall, same base frames (these names are
NOT yet wired into `lib/gateway/media.js`; wire them before uploading).

## After any upload

1. Verify dimensions/weight (`file`, Pillow) against the specs above.
2. `npm run build` — confirm `lib/gateway/media.js` picks the files up.
3. Run `medoria-gateway-visual-qa` and review real screenshots.
