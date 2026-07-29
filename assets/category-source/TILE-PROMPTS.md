# Category tile art direction — the 45 group tiles

Two ways a tile gets into `public/beauty/categories/<slug>.webp`:

1. **Composited from real supplier product shots** — see `README.md` next to
   this file. Always prefer this when the distributor's media kit has cut-outs.
2. **Art-directed still life**, for groups we have no supplier cut-outs for
   yet. That is what this file is for.

Either way the manifest is rebuilt the same way, from whatever is actually in
the output folder:

```bash
node scripts/build_category_tiles.mjs --manifest-only
```

## Why the prompts are written down

The 45 tiles sit next to each other in a grid, so they only work if they read
as **one campaign**. Regenerating a single tile months from now has to produce
something that still belongs in the set, hence the shell below is verbatim,
not a summary.

But consistency is not sameness, and the first pass got that wrong. Every tile
was built from one fixed shell — a straight-on row of objects on a marble
ledge with silk behind — and side by side in the grid they read as a single
photograph with the products swapped out. At tile size the products alone do
not carry enough difference.

The fix splits the brief in two. **Fixed, because it is what makes the set a
family:** cream marble, ivory cloth, warm champagne light raking in from the
left, the ivory/gold palette, and the content rules below. **Varied, because it
is what makes tiles distinguishable:** the surface, the height rhythm of the
group, and the camera position. Eight set-ups cover that second half.

## Hard content rules (from the brand law)

- No text, letters, numbers, logos, labels, or **embossed/engraved marks**.
  Generators love to put a fake brand embossing on a bottle shoulder; the
  negative has to say so explicitly or it comes back.
- No people, hands or faces.
- Every vessel completely blank. Distinctive designer *silhouettes* are the
  point — a generic bottle set looks like clip art — but no real brand's
  trade dress, and never a redrawn official mark.
- Palette stays ivory / cream / warm beige / champagne gold / copper. No cool
  blues, no colour gels. Bronze and charcoal are allowed for the men's and
  sports groups; they still sit on the same cream marble.

## Output format

**1376×768**, WebP quality 80 (≈20–30 KB) — Stitch's `DESKTOP` screens come out
at exactly that size, so no resampling is needed.

Tiles are displayed at `aspect-[4/3]` with `object-cover`, so the page throws
away **13% off each side**. Two things follow, and both were learned the hard
way on `perfume-gift-set`, whose first version lost its gift box entirely and
rendered as a near-empty frame:

- Say **"grouped tightly in the CENTRE of the frame, filling most of the frame
  height"** and **"nothing placed near the left or right edges"** in the
  subject line. A generator left to itself spreads objects edge to edge.
- Always check the tile the way the grid will actually crop it, not the way it
  came out of the generator.

## Choosing between candidates

Generate two per group and pick one; more than two is wasted tokens. What
decides it, in order:

1. **Survives the 4:3 crop** — nothing important near an edge.
2. **Scale** — objects should fill the frame. The common failure is a correct
   but timid still life sitting small with dead headroom.
3. **Palette discipline** — anything drifting gold-heavy or cool breaks the
   set. Ivory first, gold as accent.

## The shell

Everything below is sent verbatim, with `{SUBJECT}` and `{SET}` replaced:

> A photorealistic luxury product still-life photograph. Absolutely NO text, NO
> words, NO letters, NO numbers, NO logos, NO labels, NO printed or embossed or
> engraved marks of any kind anywhere in the image. NO people, no hands, no
> faces. NO watermark. Every product is completely blank and unbranded — smooth
> clean surfaces only. Full-bleed photograph, no borders, no frames, no graphic
> overlays.
>
> SUBJECT: {SUBJECT}. The group is arranged in the CENTRE of the frame and fills
> most of the frame height; nothing is placed near the left or right edges.
>
> {SET}
>
> LIGHT AND PALETTE: warm champagne studio light rakes in from the left, casting
> soft shadows to the right. The palette is strictly ivory, cream, warm beige,
> champagne gold and polished copper — no cool blues, no colored gels, no strong
> saturation.
>
> STYLE: editorial luxury beauty campaign photography, high-end retail
> merchandising quality, calm and expensive. Landscape 16:9 composition.

### The eight set-ups — `{SET}`

**ledge** — the objects stand in a straight row on a pale cream marble ledge
running across the lower third of the frame, ivory silk draped in soft folds
behind them, slightly out of focus. CAMERA: straight on at product height,
85mm, shallow depth of field.

**plinths** — the objects are staggered across three cream limestone plinths of
clearly different heights, so the group makes a stepped silhouette rather than
a flat line. A plain warm plaster wall behind, no fabric. CAMERA: straight on
at mid-product height, 85mm, shallow depth of field.

**cluster** — the objects are grouped into a tight overlapping triangle on a
cream marble surface — some in front, some behind — rather than lined up.
Softly gathered ivory linen behind. CAMERA: raised slightly above the objects
and turned about 30 degrees to one side, a three-quarter view, 50mm.

**tray** — the objects rest together on a shallow antique-brass tray on a cream
marble counter, with a folded ivory linen cloth beside it. CAMERA: looking down
at roughly 45 degrees onto the tray, 50mm.

**silk** — no hard ledge; the objects lie nestled in the deep folds of a heavy
ivory silk drape that fills the frame, some resting on their sides, the fabric
rising behind them. CAMERA: low, almost level with the fabric, 85mm, very
shallow depth of field.

**niche** — the objects stand inside a shallow arched niche cut into a warm
cream plaster wall, the curve of the arch framing them and the recess falling
into soft shadow at its edges. CAMERA: straight on, centred on the arch, 85mm.

**macro** — only the two or three most characteristic objects, very large in
frame and slightly overlapping, cropped close so they run past the top of the
picture. Cream marble beneath, warm blurred ivory behind. CAMERA: close, 100mm
macro, very shallow depth of field with the nearest edge crisp.

**fluted** — the objects stand on a fluted cream stone column top, with a warm
champagne glow behind them throwing a soft halo and a gentle rim light down
their edges. CAMERA: straight on, slightly below product height so the objects
rise against the glow, 85mm.

### Which set-up each group uses

Assigned so **no two tiles next to each other inside a department share a
set-up** — the grid only ever shows one department at a time, so that is where
sameness actually shows. Change one and check its neighbours.

| Department | Set-ups, in the department's sort order |
| --- | --- |
| perfume | cologne `ledge` · men `plinths` · women `niche` · unisex `macro` · kids `silk` · air-freshener `cluster` · gift-set `tray` · body-mist `fluted` · spray `plinths` · body-splash `silk` · fragrances `cluster` |
| personal-care | face-care `ledge` · body-care `cluster` · oral-care `plinths` · shaving `tray` · hygiene-sets `silk` · mens-care `niche` · baby-care `cluster` · skin-hair-supplement `macro` · intimate `fluted` |
| makeup | face `tray` · eye `macro` · brow `plinths` · lip `cluster` · nail `silk` · accessories `ledge` · sets `niche` |
| hair | care `plinths` · styling `fluted` · color `tray` |
| electrical | shaving `plinths` · hair-styling `niche` · skincare `macro` · nail `tray` · oral `fluted` · health `cluster` |
| fashion | womens `tray` · mens `cluster` |
| supplements | vitamins `plinths` · fitness `tray` · sports `ledge` · womens `niche` · kids `fluted` · mens `macro` · skin-hair `tray` |

`perfume-cologne`, `face-care` and `makeup-accessories` keep `ledge` as the
family's anchors and are the three tiles never regenerated.

## SUBJECT per group

All 45 tiles are committed. The subject line is what changes per group; the
set-up comes from the table above.

### perfume

- ✅ `perfume-cologne` — five distinctive unbranded cologne bottles in a row: a tall rectangular clear glass flacon with a brushed silver cap, a faceted square crystal bottle with a polished gold cap, a ribbed cylindrical bottle, an apothecary-style bottle with a heavy faceted glass stopper, and a slim atomiser with a champagne-gold collar
- ✅ `perfume-men` — five distinctive unbranded men's fragrance bottles in a row: a heavy square smoked-topaz glass flacon with a brushed bronze cap, a matte ivory cylinder with a dark wooden cap, a tall amber glass bottle with an angular gold shoulder, a broad low rectangular bottle with a magnetic bronze cap, and a slim faceted bottle with warm cognac-coloured juice inside
- ✅ `perfume-women` — five distinctive unbranded women's fine-fragrance bottles in a row: a faceted heavy crystal flacon with a polished gold cap, a tall slim cylindrical clear bottle with a champagne-gold collar, a rounded teardrop bottle in frosted rose glass, a squat square bottle with a large ribbed gold cap, and a taller fluted glass bottle with pale amber juice inside
- ✅ `perfume-unisex` — four sculptural unbranded unisex fragrance bottles in a row: a matte ivory ceramic-look bottle with a flat stone cap, a clear glass cube with a slim gold stem cap, a frosted cylinder with a rounded champagne cap, and a smooth pebble-shaped bottle in warm sand glass
- ✅ `perfume-kids` — four small unbranded children's fragrance bottles in a row: a small squat rounded bottle with a domed cream cap, a tiny teardrop bottle in pale peach glass, a small cylindrical spray with a soft gold collar, and a little rounded flask with a smooth ivory stopper. Delicate and playful in scale but elegant and grown-up in finish — no cartoons, no characters, no decoration
- ✅ `air-freshener` — four unbranded home fragrance vessels in a row: a ribbed clear glass reed diffuser with a bundle of natural rattan reeds fanning out, a tall cylindrical room spray with a brushed gold collar, a squat frosted diffuser bottle with a wooden neck, and a smooth ivory ceramic vessel
- ✅ `perfume-gift-set` — an unbranded fragrance gift presentation grouped tightly together in the CENTRE of the frame, filling most of the frame height: a rigid ivory gift box standing upright with its lid resting ajar against it and pale silk lining visible inside, a large faceted crystal flacon with a polished gold cap standing immediately beside the box, a smaller matching travel spray in front, and a champagne satin ribbon curling across the marble between them. The objects are large in frame and touch each other; nothing is placed near the left or right edges
- ✅ `body-mist` — four tall slim unbranded body-mist bottles in a row: larger volume spray bottles in frosted pale-cream, pale peach and clear glass with fine-mist caps in matte ivory and soft gold, one with a slender pump collar
- ✅ `perfume-spray` — four unbranded perfume atomisers in a row: a small purse atomiser in polished gold, a refillable travel spray in brushed champagne metal, a tall clear glass pump spray with a gold collar, and a vintage-style bulb atomiser with a silk tassel and a soft ivory bulb
- ✅ `body-splash` — four large unbranded body-splash bottles in a row: wide cylindrical clear glass bottles with broad screw caps in ivory and brushed gold, one with pale golden liquid inside, one frosted, generous casual proportions rather than fine-fragrance proportions
- ✅ `fragrances` — an editorial mixed unbranded fragrance grouping: a faceted crystal flacon with a gold cap, a ribbed glass reed diffuser with rattan reeds, a slim rollerball vial with a gold cap lying on its side, and a small round solid-perfume compact in polished champagne metal, open to show the cream inside

### personal-care

- ✅ `face-care` — four unbranded facial skincare vessels in a row: a faceted clear glass serum bottle with a gold dropper cap, a wide low cream jar with a stepped polished copper lid, a tall frosted pump bottle with a ribbed gold collar, and a rounded ivory lotion bottle with an angled cap and a thin gold seam
- ✅ `body-care` — five unbranded body-care items in a row: a tall ribbed glass pump bottle with pale golden liquid and a gold pump, a wide cream jar with a polished copper lid, a large blank body-lotion tube standing on its cap, a frosted cylindrical bottle with a copper cap, and a rolled cream cotton towel lying on its side
- ✅ `oral-care` — four unbranded oral-care items in a row: a smooth blank white toothpaste tube standing on its cap, a slim ivory toothbrush upright in a tall marble holder, a clear glass mouthwash bottle with pale amber liquid and a champagne-gold cap, and a small round polished gold floss case
- ✅ `shaving` — four unbranded wet-shaving items in a row: a heavy ivory ceramic bowl holding a whipped shaving cream puck, a badger-hair shaving brush with a cream resin handle, a chrome and gold double-edge safety razor standing upright on a small stand, and a squat clear glass aftershave bottle with a brushed gold cap
- ✅ `hygiene-sets` — an unbranded personal-hygiene gift set: a stacked pair of rigid ivory boxes with the top lid ajar, a cream soap bar resting on a small marble dish, a tall pump bottle in frosted glass with a gold pump, a small blank tube, and a rolled cream cotton towel
- ✅ `mens-care` — four unbranded men's grooming products in a row: a matte charcoal cylindrical pump bottle with a bronze collar, a smooth deodorant stick in brushed bronze, a blank matte tube standing on its cap, and a squat dark glass jar with a heavy bronze lid. Masculine cylindrical forms, warm bronze and deep taupe against the cream marble
- ✅ `baby-care` — four unbranded baby-care products in a row: a soft rounded pump bottle in pale cream, a small wide tub with a smooth ivory lid, a blank soft tube standing on its cap, and a rounded powder bottle with a domed cap. Very pale cream and soft blush, rounded gentle shapes, no characters and no decoration
- ✅ `skin-hair-supplement` — four unbranded skin-and-hair supplement vessels in a row: a tall amber glass bottle with a polished gold cap, a smooth ivory capsule jar with a gold lid, a small clear dropper bottle with a champagne pipette top, and a shallow marble dish holding a few smooth golden softgel capsules
- ✅ `intimate` — four unbranded discreet personal-care products in a row: a slim frosted pump bottle with a soft ivory pump, a small blank tube standing on its cap, a low round jar with a smooth champagne lid, and a slender cylindrical bottle in pale blush glass. Quiet, clinical-luxury, entirely neutral and unsuggestive

### makeup

- ✅ `face-makeup` — five unbranded face-makeup items in a row: a clear glass foundation bottle with a gold pump and warm beige liquid, a round polished gold compact powder case lying open to show the pressed powder, a cushion compact with a mirrored lid, a slim concealer tube with a gold cap, and a single pressed blush pan in warm rose
- ✅ `eye-makeup` — five unbranded eye-makeup items in a row: a tall slim mascara tube in matte ivory with a gold collar, an open rectangular eyeshadow palette showing four neutral champagne and taupe pressed shades, a slim eyeliner pen, a small eyeshadow brush lying flat, and a tiny pot of loose shimmer powder
- ✅ `brow-makeup` — four unbranded brow products in a row: a slim wooden brow pencil with a gold ferrule, a spoolie brush standing upright in a small marble cup, a small clear brow-gel tube with a gold cap, and a tiny round pot of brow pomade with the lid resting beside it
- ✅ `lip-makeup` — five unbranded lip products in a row: a bullet lipstick uncapped in a polished gold case showing a warm rose bullet, a lip gloss with a clear tube and a slim gold wand cap, a small round lip balm pot with the lid off, a liquid lipstick tube in matte ivory, and a lip liner pencil lying flat
- ✅ `nail-makeup` — five unbranded nail products in a row: three square glass nail polish bottles with slim black-gold caps holding a soft nude, a warm rose and a deep berry lacquer, a slim gold-handled nail file lying flat, and a small clear bottle of remover with a champagne cap
- ✅ `makeup-accessories` — four unbranded makeup accessories: a fan of five makeup brushes with cream resin handles and champagne-gold ferrules standing in a tall marble cup, a rounded beauty sponge resting on a small dish, a closed round pocket mirror in polished gold, and a soft cream silk pouch lying flat
- ✅ `makeup-sets` — an unbranded makeup gift set: an open rigid ivory presentation case lined in cream silk holding an eyeshadow palette of neutral champagne shades and three brushes, with a gold bullet lipstick and a round gold compact standing on the marble beside it

### hair

- ✅ `hair-care` — four unbranded hair-care products in a row: a tall cylindrical shampoo bottle in frosted glass with a gold pump, a matching slightly wider conditioner bottle with a smooth ivory cap, a wide low hair-mask jar with a heavy champagne-gold lid, and a slim clear serum dropper bottle with a gold pipette
- ✅ `hair-styling` — four unbranded hair-styling products in a row: a tall slim aerosol hairspray can in brushed champagne metal with a smooth ivory nozzle cap, a round styling-cream jar with a polished gold lid, a blank matte tube of styling gel standing on its cap, and a texturising mist bottle in clear glass with a fine-mist gold collar
- ✅ `hair-color` — four unbranded hair-colour items in a row: a smooth blank aluminium colour tube standing on its cap, a tall clear developer bottle with pale liquid and an ivory cap, a shallow ivory ceramic mixing bowl with a champagne-gold tint brush resting across it, and a folded pair of soft cream gloves. Salon-professional but elegant

### electrical

- ✅ `elec-shaving` — four unbranded grooming appliances in a row: a rotary electric shaver in brushed champagne metal standing on a slim charging stand, a foil shaver in matte ivory and rose-gold, a cylindrical beard trimmer with a fine metal guard, and a small set of comb attachments lying flat. Brushed champagne, rose gold and matte ivory finishes only
- ✅ `elec-hair-styling` — four unbranded hair appliances in a row: a professional hair dryer in matte ivory with a rose-gold nozzle standing upright, a flat straightening iron in brushed champagne metal, a slim curling wand with a cool ivory tip, and a round ceramic styling brush lying flat
- ✅ `elec-skincare` — four unbranded skincare devices in a row: a rounded silicone facial cleansing brush in pale blush, a slim LED light-therapy wand in brushed champagne metal on a small stand, a microcurrent facial device with two smooth gold spheres, and a compact charging dock in matte ivory
- ✅ `elec-nail` — four unbranded nail-care devices in a row: a slim electric nail file handpiece in brushed champagne metal resting in an ivory cradle, a small round base unit with a smooth dial, a neat row of three fine polishing bits standing in a tiny holder, and a compact UV curing lamp in matte ivory
- ✅ `elec-oral` — four unbranded oral-care appliances in a row: a sonic electric toothbrush in matte ivory with a rose-gold band standing on a small round charging base, a second brush handle in brushed champagne, a compact water flosser unit with a smooth reservoir, and two spare brush heads standing in a tiny marble cup
- ✅ `elec-health` — four unbranded personal wellness devices in a row: a slim digital thermometer in matte ivory lying flat, a compact upper-arm blood-pressure monitor with a neatly rolled cream cuff, a small handheld percussive massager in brushed champagne metal, and a round glass bathroom scale with a champagne-gold rim standing on edge

### fashion

- ✅ `womens-accessories` — four unbranded women's accessories arranged on the marble: a cream silk scarf folded into a soft fan, a pair of sunglasses with warm tortoiseshell frames and gold temples resting folded, a slim wristwatch with a champagne-gold case and a cream leather strap, and a small structured ivory clutch standing on edge. Every piece completely blank — no monograms, no hardware logos, no engraved marks
- ✅ `mens-accessories` — four unbranded men's accessories arranged on the marble: a tan leather belt coiled into a neat spiral with a plain brushed bronze buckle, a pair of sunglasses with dark tortoiseshell frames resting folded, a wristwatch with a bronze case and a cognac leather strap, and a pair of smooth polished bronze cufflinks on a small dish. Every piece completely blank — no monograms, no engraved marks

### supplements

- ✅ `vitamins` — four unbranded vitamin containers in a row: a tall amber glass bottle with a polished gold cap, a smooth ivory plastic tub with a champagne lid, a shorter clear glass jar showing golden softgel capsules inside, and a shallow marble dish holding a few loose capsules
- ✅ `fitness-supplement` — four unbranded fitness nutrition containers: a large cylindrical protein tub in matte ivory with a smooth champagne-gold lid, a stainless shaker bottle in brushed champagne with an ivory collar, a smaller wide jar with a gold lid, and a polished metal scoop resting on the marble
- ✅ `sports-supplement` — four unbranded sports nutrition containers in a row: a tall matte bronze tub with a smooth lid, a slimmer ivory tub, a clear glass bottle of pale amber liquid with a gold cap, and a brushed champagne shaker bottle with a scoop resting beside it
- ✅ `womens-supplement` — four unbranded women's supplement containers in a row: a rounded pale blush glass bottle with a smooth ivory cap, a low wide tub with a polished rose-gold lid, a slim clear bottle showing small cream capsules, and a small marble dish with a few loose capsules. Softer rounded forms, blush and champagne against the cream marble
- ✅ `kids-supplement` — four unbranded children's supplement containers in a row: a small rounded bottle with a domed ivory cap, a squat gummy jar in clear glass with a smooth champagne lid showing soft amber gummies inside, a small tub with a rounded lid, and a tiny measuring spoon resting on the marble. Small friendly proportions but elegant adult finishes, no characters and no decoration
- ✅ `mens-supplement` — four unbranded men's supplement containers in a row: a tall matte charcoal tub with a brushed bronze lid, a dark amber glass bottle with a heavy bronze cap, a squat wide jar in smoked glass, and a polished bronze scoop resting on the marble. Deeper bronze and charcoal tones against the cream marble
- ✅ `supplement-skin-hair` — four unbranded beauty-supplement containers in a row: a wide low collagen tub in matte ivory with a polished gold lid and a small scoop resting in it, a tall amber glass bottle with a gold cap, a slim clear dropper bottle with a champagne pipette, and a shallow marble dish holding a few golden capsules

## Groups with no tile yet

They are not broken. `WorldGrid` resolves a tile in this order:

```
uploaded beauty_categories.image_url  →  CATEGORY_IMG[slug]  →  department mood shot  →  gradient + icon
```

so a group without a tile falls back to its department's gradient and icon.
Any tile can also be replaced at any time from the operator panel without
touching this repo — an upload always wins.
