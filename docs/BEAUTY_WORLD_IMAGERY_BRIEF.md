# Medoria Beauty — World department imagery brief (Phase 4)

Mood photography for the 7 departments on the World page
(`/beauty/[lang]/worlds`) and, optionally, the department chips. One
photographic family across all seven — the same studio, light and materials as
the existing "The Edit" shots — so the set reads as one campaign.

## How an image gets used (two ways, no code needed for either)

1. **Panel upload (preferred):** Beauty operator → دسته‌بندی‌ها → edit a
   department → "آپلود تصویر". This sets `beauty_categories.image_url` and wins
   over everything else. Works for any department / group / subgroup.
2. **Static file:** drop a `.webp` into `public/beauty/edit/` (or
   `public/beauty/worlds/`) and add one line to `DEPT_IMG` in
   `app/beauty/[lang]/worlds/page.jsx`.

Until an image exists, the tile shows an on-brand champagne/copper gradient +
the department icon — never an empty box.

## Status

| # | department | slug | image |
|---|---|---|---|
| 1 | عطر Perfume | `perfume` | needed |
| 2 | بهداشتی Personal Care | `personal-care` | ✅ reuses `edit-skincare.webp` |
| 3 | آرایشی Makeup | `makeup` | ✅ reuses `edit-makeup.webp` |
| 4 | مو Hair | `hair` | needed |
| 5 | لوازم برقی Electrical | `electrical` | needed |
| 6 | مد و فشن Fashion | `fashion` | needed |
| 7 | مکمل غذایی Supplements | `supplements` | needed |

## Global spec (every image)

- **Aspect / size:** 16:10, ≥ 2560px wide, exported **webp ≤ 500 KB**.
- **Look:** luxury still-life, soft studio key light from one side, shallow
  depth of field, calm and quiet (not busy). Warm ivory → champagne → copper
  palette with cool marble accents. Brushed **gold/copper** metal (Beauty),
  frosted glass, silk, marble — the Beauty material family.
- **Negative prompt (all):** `no people, no faces, no hands, no text, no
  letters, no logos, no labels, no brand names, no packaging copy, no
  watermark, no cheap stock-photo look`.
- **Brand law:** no real brands, no readable text baked in, no fake
  certifications. Generic, unbranded forms only.

## Per-department prompts

**1 · Perfume (`perfume`)**
> Luxury still-life of two or three unbranded frosted-glass perfume flacons with
> minimal brushed-copper caps, amber and champagne liquid catching soft side
> light, a fold of ivory silk and a pale marble surface, warm golden haze,
> shallow depth of field, 85mm, editorial beauty photography. Negative: (global).

**4 · Hair (`hair`)**
> Luxury still-life of unbranded frosted pump bottles of hair oil and serum in
> champagne tones on marble, a soft ribbon of flowing silk suggesting hair, a
> single wooden comb silhouette out of focus, warm copper light, shallow depth
> of field, 85mm, editorial. Negative: (global).

**5 · Electrical (`electrical`)**
> Luxury still-life of sleek matte-cream and brushed-copper beauty-device forms
> (abstract, unbranded — a smooth wand and a rounded base), soft studio key
> light, pale marble, one silk fold, minimal and calm, shallow depth of field,
> 85mm, editorial product photography. Negative: (global).

**6 · Fashion (`fashion`)**
> Luxury still-life of champagne silk fabric in soft folds with a few abstract
> gold/copper accessory forms (a smooth ring, a fine chain) resting on marble,
> warm directional light, shallow depth of field, 85mm, editorial fashion
> still-life. Negative: (global).

**7 · Supplements (`supplements`)**
> Luxury still-life of unbranded frosted-glass supplement jars with brushed-gold
> lids, a few soft dried botanicals, pale marble and ivory silk, clean bright
> calm light, shallow depth of field, 85mm, editorial wellness photography.
> Negative: (global).

## Optional: groups & subgroups

Departments matter most. Groups/subgroups can stay on the gradient placeholder,
or the owner can upload per-category images over time from the panel — the World
page already shows whatever is uploaded at any level.

## Tools

Free: **Stitch** (`stitch.withgoogle.com`) or the `canvas-design` skill for
abstract variants. Paid tools (Higgsfield/Motion) are intentionally not used.
Do not generate final assets unbriefed — this file is the brief; review before
placing.
