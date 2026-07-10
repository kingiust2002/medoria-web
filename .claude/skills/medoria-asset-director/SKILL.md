---
name: medoria-asset-director
description: Plan production-grade imagery for Medoria — decide what images/video loops are actually needed, write exact generation prompts and specs, and define filenames the code auto-detects. Use when a design calls for new photography, video, or brand-asset derivatives.
---

# Medoria Asset Director

Produce an asset plan the owner can execute with Higgsfield/Midjourney and
upload straight to the repo. Never spend Higgsfield/Motion credits (or ask
the owner to) until the prompts have been shown and approved.

## Before requesting anything new

1. Read what exists: `public/brand/` (official marks/wordmarks + tight-crop
   derivatives in `brand/gateway/`), `public/images/` (Health photography,
   `images/gateway/mirror-*` campaign pair), and any asset manifest files.
2. Reuse or derive first — crops/variants can be produced locally with
   Python (Pillow) from existing masters. New generations only when they
   clearly improve the concept.

## Content rules (hard)

- No people or faces. No readable fake text in-image. No fake logos or
  certification marks. No copyrighted product packaging. No cheap
  stock-photo look.
- Brand-true materials: Health = glass, water, ice-light, marble, brushed
  SILVER metal, glacial blue-white. Beauty = frosted glass, silk, champagne
  light, marble, brushed GOLD/copper metal. One photographic family across
  both worlds (same scene language).
- Paired assets (two gradings of one scene) must start from the same base
  image (image-to-image relight/edit) so composition stays aligned.

## Every asset spec must include

- Purpose (where it appears) and the exact filename + path the code
  detects (e.g. `public/images/gateway/mirror-cool.jpg` — `mirror-cold` is
  an accepted alias; see `lib/gateway/media.js` before inventing new names).
- Aspect ratio and minimum resolution (heroes: 16:9, ≥2560px wide; mobile
  portrait variants only if the design can't crop center-safe).
- Composition notes (negative space reserved for typography, subject
  thirds, center-safe zone for responsive crops).
- The full generation prompt in photographic language (lens, light
  direction, materials, mood) + negative prompt ("no people, no text, no
  logos, no labels, no watermark").
- Compression budget (heroes ≤ ~500KB after optimization; video loops
  muted, seamless, 5–8s, ≤ ~4MB, mp4/webm + poster).
- Whether upscale or background removal is needed after generation.

## After upload

Verify dimensions/weight (`file`, Pillow), confirm the code detects the
files, optimize if over budget, and run `medoria-gateway-visual-qa`.
