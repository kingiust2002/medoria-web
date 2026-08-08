# Medoria Beauty — Asset Manifest (Health-mirror layout)

Beauty started as a verbatim copy of the Health home and needed only **5
images**. Drop a file with the exact name below and it appears automatically
(hero via `lib/beauty/media.js`; showcase tiles via the shared
ImagePlaceholder slots).

Beyond the home page, Beauty now also carries **page-header banners on every
tab** and a photo in the About mission block — those are listed in the second
table, and their art direction is written down in
`assets/category-source/HEADER-PROMPTS.md`. The 45 group and 141 subgroup
category tiles are a third set again, in `public/beauty/categories/`, indexed
by the generated `lib/beauty/categoryImages.js`.

| # | File (in /public/beauty/) | Where it shows | Render size (desktop / mobile) | Master (min) | Notes |
|---|---|---|---|---|---|
| 1 | `hero/hero-banner-light.webp` | Hero background photo layer (25% opacity, like Health) | 1440×~836 / 390×~700 | 2400×1400 (1600×940) | wide, subject right-of-center; left 55% stays quiet under the headline |
| 2 | `showcase/showcase-01.webp` | Showcase tile — Витринаи люкс (carries delivery chip) | 292×292 / 173×173 (square) | 1000×1000 (700×700) | keep bottom 20% clear (glass chips) |
| 3 | `showcase/showcase-02.webp` | Showcase tile — Маҳсулоти аслӣ | 292×292 / 173×173 | 1000×1000 (700×700) | no readable labels |
| 4 | `showcase/showcase-03.webp` | Showcase tile — Бастабандии зебо | 292×292 / 173×173 | 1000×1000 (700×700) | packaging detail, warm light |
| 5 | `showcase/showcase-04.webp` | Showcase tile — Дастаи мо | 292×292 / 173×173 | 1000×1000 (700×700) | team/service moment |

Grading: warm ivory/nude base, copper highlights, deep navy shadows — light,
editorial, desaturated. WebP/AVIF, hero ≤300 KB, tiles ≤140 KB each.

## Page headers (one per tab) + the About photo

Rendered by `components/beauty/BeautyPageHeader.jsx`, which mirrors the frame
and flips its scrim in the RTL route — so every banner is briefed with its
**left third empty** for the headline. Each ships as a light/dark pair that is
two gradings of ONE frame, never two separate photographs.

| # | File (in /public/beauty/) | Where it shows | Master | Notes |
|---|---|---|---|---|
| 6 | `headers/worlds-header-{light,dark}.webp` | «Worlds» tab, above the seven departments | 1600×600 | one object from each of the seven worlds |
| 7 | `headers/catalog-header-{light,dark}.webp` | «Collection» tab | 1600×600 | cartons + vessels, a collection laid out |
| 8 | `headers/brands-header-{light,dark}.webp` | «Maisons» tab | 1600×600 | shot DARK — white type sits on it |
| 9 | `headers/about-header-{light,dark}.webp` | «About» tab | 1600×600 | atelier corner, linen and brass |
| 10 | `headers/contact-header-{light,dark}.webp` | «Contact» tab | 1600×600 | reception counter, bell and bud vase |
| 11 | `about/mission{,-dark}.webp` | About → mission block | 1600×1100 | shelves of blank vessels; 16:11 |

Budget: ≤150 KB per banner. They render at 32–50% opacity under a scrim, so
they are graded soft and low-contrast on purpose — a punchy frame turns to mud
behind the type.
