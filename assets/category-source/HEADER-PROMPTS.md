# Page-header art direction — the Beauty tab banners

Where they ship:

| Slot | File | Size | Used by |
| --- | --- | --- | --- |
| Worlds | `public/beauty/headers/worlds-header-{light,dark}.webp` | 1600×600 | `app/beauty/[lang]/worlds/page.jsx` → `WorldGrid headerImg` |
| Collection | `public/beauty/headers/catalog-header-{light,dark}.webp` | 1600×600 | `app/beauty/[lang]/catalog/page.jsx` |
| Maisons | `public/beauty/headers/brands-header-{light,dark}.webp` | 1600×600 | `app/beauty/[lang]/brands/page.jsx` |
| About | `public/beauty/headers/about-header-{light,dark}.webp` | 1600×600 | `app/beauty/[lang]/about/page.jsx` |
| Contact | `public/beauty/headers/contact-header-{light,dark}.webp` | 1600×600 | `app/beauty/[lang]/contact/ContactInner.jsx` |
| About · mission | `public/beauty/about/mission{,-dark}.webp` | 1600×1100 | `app/beauty/[lang]/about/page.jsx` |

All six are rendered by `components/beauty/BeautyPageHeader.jsx` (the banners)
or `components/shared/ImagePlaceholder.jsx` (the mission photo). Both degrade
to the gradient placeholder if a file is missing, so a half-finished set never
breaks a page.

## What makes a header different from a category tile

A tile is a catalogue picture: the products centred, legible, the point of the
frame. A header is **atmosphere behind live HTML type** — it sits at 32–50%
opacity under a scrim, and the breadcrumb, `<h1>` and subtitle stay real text
for SEO and screen readers. So a header is briefed for:

- **an empty left third.** That is where the headline lands in the three LTR
  locales. In the Persian route the type moves to the right, so the component
  mirrors the picture (`rtl:scale-x-[-1]`) and flips the scrim with it. This is
  only safe because the brief forbids text, logos and hands — nothing in these
  frames reads wrong reversed.
- **low contrast.** A punchy tile turns to mud under a scrim; these are soft.
- **one scene, two gradings.** The dark variant is NOT generated separately —
  it is derived from the same frame by `publish_headers.py` (pull down, sink
  the shadows toward the site's ink-navy `#11152B`, screen the champagne back
  into the highlights). A second generation would drift the composition, and
  the type would then sit over a different part of the picture depending on
  which theme the visitor is in.

## Hard content rules

Identical to the tiles (see `TILE-PROMPTS.md`): no text, letters, numbers,
logos, labels or embossed marks; no people, hands or faces; no watermark; no
real product packaging. Every object blank and unbranded. Full-bleed
photograph — no borders, frames or UI chrome.

## The shell (verbatim)

```
A photorealistic luxury editorial still-life photograph, a wide cinematic
banner. Absolutely NO text, NO words, NO letters, NO numbers, NO logos, NO
labels, NO printed or embossed or engraved marks of any kind anywhere in the
image. NO people, no hands, no faces. NO watermark. Every object is completely
blank and unbranded — smooth clean surfaces only. Full-bleed photograph, no
borders, no frames, no graphic overlays, no user interface.

SUBJECT: <subject>.

COMPOSITION: the LEFT THIRD of the frame is deliberately empty — nothing but
soft light, wall or surface — because type will be set over it. Everything of
interest sits right of centre. Nothing touches the left edge.

<SET line — one of the six below>

LIGHT AND PALETTE: warm champagne light rakes in from the left, casting soft
long shadows to the right. The palette is strictly ivory, cream, warm beige,
champagne gold and polished copper — no cool blues, no colored gels, no strong
saturation. Keep the whole picture soft and low in contrast: this is
atmosphere, not a catalogue shot.
```

The Maisons band is the one surface carrying white type over a deep ground, so
it swaps the last two blocks for the dark set: objects on **polished dark
navy-ink stone**, a single warm champagne source from the left, copper rim
light, left half in near darkness, palette deep navy-ink / near-black / warm
bronze / champagne gold.

## The six SET lines

- **wide_ledge** — a long pale cream marble ledge across the lower third, the
  objects together in the right third, the ledge continuing away empty to the
  left; ivory silk far behind, well out of focus. Straight on, 85mm.
- **window_light** — a warm cream plaster room corner, objects on a marble
  counter in the right third, soft morning light through an unseen window at
  the left so the left half is an empty wash of light and shadow. Raised
  slightly, turned ~25°, 50mm.
- **drape** — heavy ivory silk filling the frame in deep folds, objects
  nestled among them in the right third, fabric sweeping away unfocused to the
  left. Low, level with the fabric, 85mm.
- **shelf** — a shallow cream stone shelf against warm plaster, objects spaced
  along the right half at slightly different heights, shelf running on empty to
  the left. Straight on, 85mm.
- **tray_corner** — a brass tray on cream marble holding the objects in the
  right third with folded ivory linen beside it, counter bare to the left.
  Looking down ~40°, 50mm.
- **arch_glow** — a shallow arched niche in warm cream plaster in the right
  third holding the objects, champagne glow behind, plaster running on plain
  to the left. Straight on, 85mm.

## Subjects

- **worlds-header** — one object from each of the seven worlds standing
  together as a family: a tall faceted glass flacon, a squat frosted cream jar,
  a slim lipstick bullet, a wooden-handled hairbrush, a small chrome styling
  device, a folded silk scarf, a plain amber supplement bottle. All blank.
- **catalog-header** — a considered collection laid out for review: plain cream
  cartons of two or three sizes stacked low, three unbranded glass and frosted
  vessels standing in front.
- **brands-header** — three tall unbranded glass flacons of clearly different
  silhouettes with heavy polished gold caps, standing close together like a row
  of houses, one slightly forward.
- **about-header** — the quiet corner of a beauty atelier: a folded stack of
  ivory linen, a brass tray with two blank frosted jars, a shallow ceramic
  bowl, a single dried pampas stem in a plain stone vase.
- **contact-header** — a reception counter set for a visitor: a small polished
  brass bell, a plain cream card holder with a blank unprinted card, a shallow
  marble dish, a single white ranunculus in a slim stone bud vase.
- **about-mission** — an open cream cabinet of shallow shelves holding rows of
  blank vessels — frosted jars, glass droppers, cream tubes, folded linen —
  arranged neatly by height, like a working atelier store.

## Regenerating

The generator and the publisher live in the session scratchpad, not the repo
(they need a Stitch key). The pieces that matter are written down above: the
shell, the set lines and the subjects are enough to reproduce the set. The
publish step is a centre-crop to the shipping ratio, a resize, the derived dark
grade, and a webp at quality 80 — every banner lands well under the 500KB hero
budget at that setting.
