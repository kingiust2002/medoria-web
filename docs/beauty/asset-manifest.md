# Medoria Beauty — Campaign Asset Manifest

**Structure:** mirrors the Health home skeleton · **Skin:** nude / ivory / champagne / copper / deep navy
**Machine-readable:** `docs/beauty/asset-manifest.json`

## How it works
Drop a correctly named file into `public/beauty/<folder>/` (AVIF preferred; WebP/JPG/PNG accepted). The build detects it automatically (`lib/beauty/media.js`) and replaces the satin fallback — **no code change needed**. Until then every slot shows an elegant nude-satin fallback with the official mark watermark.

## Global grading
Warm ivory/nude base · copper highlights · deep navy shadows · editorial, light, desaturated. No text, no logos, no readable packaging, nothing explicit.

> Sizes computed from the implemented layout (container `max-w-7xl`, 1216px inner at 1440×900; 358px inner at 390×844). Re-verify in DevTools after the first real asset.

## Assets (11)

| # | Filename (folder) | Section | Desktop / Mobile render | Ratio | Master (min) | Load | Priority |
|---|---|---|---|---|---|---|---|
| 1 | `hero/hero-banner.avif` | Hero photo layer (22% opacity) | 1440×~836 / 390×~700 | wide, center-safe | 2400×1400 (1600×940) | priority | **P1** |
| 2 | `collections/world-skincare.avif` | Worlds card | 395×296 / 358×269 | 4:3 | 1200×900 (800×600) | lazy | **P1** |
| 3 | `collections/world-makeup.avif` | Worlds card | 395×296 / 358×269 | 4:3 | 1200×900 (800×600) | lazy | **P1** |
| 4 | `collections/world-tools.avif` | Worlds card | 395×296 / 358×269 | 4:3 | 1200×900 (800×600) | lazy | **P1** |
| 5 | `featured/featured-01.avif` | Featured pick — Ritual | 392×294 / hidden <md | 4:3 | 1200×900 (800×600) | lazy | P2 |
| 6 | `featured/featured-02.avif` | Featured pick — Radiance | 392×294 / hidden <md | 4:3 | 1200×900 (800×600) | lazy | P2 |
| 7 | `featured/featured-03.avif` | Featured pick — Elegance | 392×294 / hidden <md | 4:3 | 1200×900 (800×600) | lazy | P2 |
| 8 | `showcase/showcase-01.avif` | Showcase — luxe display (+delivery chip) | 292×292 / 173×173 | 1:1 | 1000×1000 (700×700) | lazy | P2 |
| 9 | `showcase/showcase-02.avif` | Showcase — original products | 292×292 / 173×173 | 1:1 | 1000×1000 (700×700) | lazy | P2 |
| 10 | `showcase/showcase-03.avif` | Showcase — packaging | 292×292 / 173×173 | 1:1 | 1000×1000 (700×700) | lazy | P2 |
| 11 | `showcase/showcase-04.avif` | Showcase — team | 292×292 / 173×173 | 1:1 | 1000×1000 (700×700) | lazy | P3 |

**Size targets:** hero ≤300 KB · worlds/featured ≤160 KB · showcase ≤140 KB.
**Text-safe:** hero keeps the left 55% quiet; showcase tiles keep the bottom 20% clear (glass chips).
