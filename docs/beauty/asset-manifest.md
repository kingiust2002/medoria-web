# Medoria Beauty — Asset Manifest (Health-mirror layout)

Beauty is a verbatim copy of the Health home; it needs only **5 images**.
Drop a file with the exact name below and it appears automatically (hero via
`lib/beauty/media.js`; showcase tiles via the shared ImagePlaceholder slots).

| # | File (in /public/beauty/) | Where it shows | Render size (desktop / mobile) | Master (min) | Notes |
|---|---|---|---|---|---|
| 1 | `hero/hero-banner-light.webp` | Hero background photo layer (25% opacity, like Health) | 1440×~836 / 390×~700 | 2400×1400 (1600×940) | wide, subject right-of-center; left 55% stays quiet under the headline |
| 2 | `showcase/showcase-01.webp` | Showcase tile — Витринаи люкс (carries delivery chip) | 292×292 / 173×173 (square) | 1000×1000 (700×700) | keep bottom 20% clear (glass chips) |
| 3 | `showcase/showcase-02.webp` | Showcase tile — Маҳсулоти аслӣ | 292×292 / 173×173 | 1000×1000 (700×700) | no readable labels |
| 4 | `showcase/showcase-03.webp` | Showcase tile — Бастабандии зебо | 292×292 / 173×173 | 1000×1000 (700×700) | packaging detail, warm light |
| 5 | `showcase/showcase-04.webp` | Showcase tile — Дастаи мо | 292×292 / 173×173 | 1000×1000 (700×700) | team/service moment |

Grading: warm ivory/nude base, copper highlights, deep navy shadows — light,
editorial, desaturated. WebP/AVIF, hero ≤300 KB, tiles ≤140 KB each.
