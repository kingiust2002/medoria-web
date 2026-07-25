# Category tile source images

Drop the **official product photography** for each category group in here, then run:

```bash
node scripts/build_category_tiles.mjs
```

That composites each folder into one on-brand tile at
`public/beauty/categories/<slug>.webp` and regenerates
`lib/beauty/categoryImages.js`, which the World page reads automatically.

## Layout

One folder per category slug, 3–5 product shots inside:

```
assets/category-source/
├── face-care/        serum.png  cream-jar.png  pump.png  ampoule.png  tube.png
├── body-care/        ...
├── eye-makeup/       ...
└── vitamins/         ...
```

Folder names must match the category `slug` exactly. The 45 group slugs are
listed by:

```bash
node -e "import('./scripts/lib/beautyTreeData.mjs').then(m=>m.TREE.forEach(d=>(d.children||[]).forEach(g=>console.log(g.slug))))"
```

## What to put in

- **Official supplier / brand media-kit product shots** — the files your
  distributors provide for retail merchandising. Cut-outs on transparent or
  flat-white backgrounds composite best; the script knocks out flat white
  automatically and trims to the product.
- PNG (with alpha) is ideal, JPG and WebP also work.
- Bigger is better — the script scales down, never up. Aim for ≥ 800px on the
  product's long edge.

## What not to put in

- Images pulled from a search engine or a competitor's site. Product photography
  is the brand's or the photographer's copyright; use the assets your suppliers
  give you for exactly this purpose.
- Anything with a stock-library watermark.
- Screenshots, or photos with people, faces or hands in them (brand law).

## Overriding a single category

A tile composited here is only a fallback. To give one category its own
finished photograph, upload it to that category in the Beauty operator panel
(دسته‌بندی‌ها → edit → آپلود تصویر) — an uploaded `image_url` always wins.
