# Medoria — Image slots / جای عکس‌ها

Drop a file with the **exact name** below into `public/images/` and it appears
on the site automatically. Until a file exists, an elegant brand-gradient
placeholder is shown instead (no broken images), so the design always looks
intentional.

اگر فایلی با همین نام دقیق اینجا بگذاری، خودکار در سایت نمایش داده می‌شود.
تا وقتی فایل نباشد، یک placeholder گرادیانی زیبا نشان داده می‌شود.

| File name | Where it's used | Recommended size | Notes |
|---|---|---|---|
| `hero-medical-banner.jpg` | Homepage hero — desktop background | **2400 × 1200** (2:1, landscape) | Clinic / warehouse / clean medical scene. A dark overlay is applied automatically for text contrast. |
| `hero-medical-banner-mobile.jpg` | Homepage hero — mobile background | **1080 × 1350** (4:5, portrait) | Tighter crop of the same scene; the focal subject should sit center/top. |
| `showcase-warehouse.jpg` | Home "Showcase" — large tile | **1200 × 1200** (square) | Warehouse / logistics / shelves. |
| `showcase-products.jpg` | Home "Showcase" — small tile | **800 × 800** (square) | Boxes of gloves, masks, syringes… |
| `showcase-qc.jpg` | Home "Showcase" — small tile | **800 × 800** (square) | Quality control / certified packaging. |
| `showcase-team.jpg` | Home "Showcase" — wide tile | **1600 × 800** (2:1) | Sales / support team or delivery. |
| `about-medical-team.jpg` | About page — company section | **1600 × 1000** (16:10) | Team / facility photo. |
| `catalog-visual.jpg` | Catalog header accent (optional) | **1600 × 600** | Wide banner strip. |
| `product-placeholder.jpg` | Optional generic product fallback | **1000 × 750** (4:3) | Only used if you wire it per-product; cards otherwise show a category icon. |

## How it works

- Slots are rendered through `components/shared/ImagePlaceholder.jsx`, which
  shows the `src` image and **falls back to the placeholder if the file is
  missing or fails to load** (`onError`).
- The hero banner uses CSS `background-image`, which simply paints nothing when
  the file is absent, revealing the brand gradient beneath.
- Prefer optimized JP/WebP (< ~300 KB each) for performance. JPG names above
  also work if you save WebP — just keep the `.jpg` name, or update the path in
  the component.

## Brand palette (for choosing / editing photos & overlays)

```
magenta/pink  #EC1E95
violet        #8B2FF7
indigo        #4F46E5
blue          #2563EB
cyan          #06B6D4
ink / navy    #0B1120 / #080B17
```
