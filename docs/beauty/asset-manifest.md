# Medoria Beauty — Campaign Asset Manifest

**System:** MEDORIA BEAUTY — NUDE COPPER EDITORIAL
**Machine-readable version:** `docs/beauty/asset-manifest.json`

## How it works
Drop a correctly named file into `public/beauty/<folder>/` (AVIF preferred; WebP/JPG/PNG accepted). The build detects it automatically (`lib/beauty/media.js`) and swaps out the satin fallback — **no code change needed**. Until then every slot renders an elegant nude-satin fallback with the official mark as a quiet watermark; there are no broken-image states.

## Global grading rules
Warm ivory / nude base · copper highlights · deep navy shadows · desaturated, editorial, **light theme**. No text, no logos, no readable packaging, no competitor products, nothing explicit. People may appear only as abstract beauty gestures (hands, profile light) — no identifiable faces needed.

> Dimensions below are computed from the implemented CSS at the reference viewports **1440×900** and **390×844**. A headless browser wasn't available in this environment to pixel-verify — re-check with DevTools after dropping the first real asset.

## Assets (12)

| # | ID / filename | Section | Rendered (desktop / mobile) | Ratio | Master (min) | Fit / position | Load | Priority |
|---|---|---|---|---|---|---|---|---|
| 1 | `hero/hero-editorial.avif` | Hero right layer | 662×900 / — (hidden <lg) | ~3:4 | 1800×2400 (1200×1600) | cover · 50% 40% | **preload** | **P1** |
| 2 | `collections/world-skincare.avif` | Worlds — tall left | 544×840 / 350×467 | 2:3 | 1400×2100 (900×1350) | cover · 50% 30% | lazy | **P1** |
| 3 | `collections/world-makeup.avif` | Worlds — top right | 544×408 / 350×263 | 4:3 | 1600×1200 (1000×750) | cover · 50% 50% | lazy | **P1** |
| 4 | `collections/world-tools.avif` | Worlds — bottom right | 544×408 / 350×263 | 4:3 | 1600×1200 (1000×750) | cover · 50% 65% | lazy | **P1** |
| 5 | `signature/signature-product.avif` | Signature moment | 420×525 / 350×438 | 4:5 | 1200×1500 (840×1050) | cover · 50% 50% | lazy | P2 |
| 6 | `story/story-texture.avif` | Story backdrop (under 72% ivory veil) | ~1360×560 / ~350×620 | 5:3 master, center-safe | 2000×1200 (1400×840) | cover · 50% 50% | lazy | P3 |
| 7–11 | `lookbook/lookbook-01…05.avif` | Lookbook plates | 432×576 / 296×490 | 3:4 | 1200×1600 (900×1200) | cover · 50% 50% | lazy | P2 |
| 12 | `cta/cta-backdrop.avif` | CTA navy panel (25% opacity) | 1112×~380 / 350×~520 | 2:1, center-safe | 1800×900 (1200×600) | cover · 50% 50% | lazy | P3 (optional) |

### Per-slot notes
- **hero-editorial** — subject weight in the **right 60%**; the left 55% sits under an ivory veil so the headline always wins. Warm nude skin/silk/copper light.
- **world-skincare** — cream swipe / serum-on-skin gesture; **bottom 30% is covered by the glass caption plate** (keep it texture, not subject).
- **world-makeup** — pigment/colour moment, copper-rose. Bottom 35% caption-safe.
- **world-tools** — brushes/accessories still life on nude satin, navy shadow depth. Bottom 35% caption-safe.
- **signature-product** — ONE product, soft copper spotlight, generous negative space. A true **cutout PNG with transparency is supported** (it composites over the satin fallback); otherwise photographic AVIF.
- **story-texture** — macro champagne silk / serum flow, low contrast, no subject (fully veiled). Must survive both an ultra-wide desktop crop and a portrait mobile crop → keep detail in the **center 60%**.
- **lookbook 01–05** — one editorial frame per word: Ритуал (ritual gesture) · Ранг (colour macro) · Дурахш (glow/highlight) · Нафосат (refined still life) · Ҳиссиёт (emotive close-up). Bottom 18% carries the caption bar.
- **cta-backdrop** — optional; abstract dark copper-silk streak. Rendered at 25% opacity under centered copy — keep it abstract.

### Size targets
P1 ≤ 200–240 KB each · P2 ≤ 180–200 KB · P3 ≤ 260 KB. AVIF preferred, WebP fallback fine; PNG **only** for the signature cutout transparency.

### Motion dependencies
Hero (static layer under parallax veil) · Worlds (clip-path reveal) · Signature (±5% parallax) · Story (±6% parallax) · Lookbook (desktop horizontal scroll-scrub) · CTA (none).
