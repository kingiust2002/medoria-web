// scripts/build_category_tiles.mjs
// Composites official product shots into consistent «World» category tiles.
//
// The category tiles are meant to show the real products we actually stock,
// lined up together — which means the source images have to be the official
// product photography from each supplier's media kit / B2B portal, NOT anything
// generated and NOT anything lifted off a search engine. This script does the
// arranging so that 45 groups of mismatched supplier shots still come out
// looking like one campaign.
//
// INPUT   assets/category-source/<group-slug>/*.{png,jpg,jpeg,webp}
//           3-5 product shots per group. Official cut-outs on white or
//           transparent backgrounds work best — that is what suppliers ship.
// OUTPUT  public/beauty/categories/<group-slug>.webp   (1600x1000, ~16:10)
//         lib/beauty/categoryImages.js                 (slug -> path manifest)
//
// Run: node scripts/build_category_tiles.mjs
//
// What it normalises, so the set reads as one family:
//   • knocks out flat white backgrounds (supplier shots almost always have one)
//   • trims to the product, then scales every item to a common visual height
//     with a slight alternating variation so the row looks styled, not ruler-flat
//   • lays them on the shared Beauty backdrop (pale marble ledge, champagne
//     gradient, soft vignette) with a contact shadow under each item
//   • exports one optimised webp per group at a fixed aspect ratio
//
// Anything a supplier gives us that is already a finished lifestyle photograph
// is better used as-is: upload it to the category in the operator panel and it
// wins over the file this script produces (see WorldGrid's image resolution).
import { readdirSync, existsSync, mkdirSync, writeFileSync, statSync } from "node:fs";
import { join, extname, basename } from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = new URL("..", import.meta.url).pathname;
const SRC_DIR = join(ROOT, "assets/category-source");
const OUT_DIR = join(ROOT, "public/beauty/categories");
const MANIFEST = join(ROOT, "lib/beauty/categoryImages.js");

const W = 1600;
const H = 1000;
const EXTS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

// The compositing itself runs in Python/Pillow — it is the only image library
// guaranteed present in this repo's toolchain, and it handles alpha, trimming
// and webp encoding without pulling a node dependency into the project.
const PY = String.raw`
import sys, os, math
from PIL import Image, ImageDraw, ImageFilter, ImageChops

W, H = ${W}, ${H}
out_path = sys.argv[1]
paths = sys.argv[2:]

def knockout_white(im, tol=18):
    """Supplier product shots are nearly always a product on flat white.
    Turn that white into alpha so items can sit on our own backdrop."""
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    # only treat it as a white-background shot if the corners really are white
    corners = [px[0,0], px[w-1,0], px[0,h-1], px[w-1,h-1]]
    if not all(c[0] > 255-tol and c[1] > 255-tol and c[2] > 255-tol for c in corners):
        return im  # already cut out, or a lifestyle shot: leave it alone
    bg = Image.new("RGB", im.size, (255,255,255))
    diff = ImageChops.difference(im.convert("RGB"), bg).convert("L")
    mask = diff.point(lambda v: 0 if v <= tol else 255)
    mask = mask.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(0.6))
    im.putalpha(mask)
    return im

def trim(im):
    bb = im.split()[-1].getbbox()
    return im.crop(bb) if bb else im

def backdrop():
    """Pale marble ledge + champagne gradient — the shared Beauty scene."""
    bgc = Image.new("RGB", (W, H), (247, 243, 236))
    d = ImageDraw.Draw(bgc)
    # vertical champagne wash
    for y in range(H):
        t = y / H
        r = int(250 - 26*t); g = int(244 - 30*t); b = int(233 - 40*t)
        d.line([(0,y),(W,y)], fill=(r,g,b))
    # ledge
    ledge_y = int(H*0.74)
    d.rectangle([0, ledge_y, W, H], fill=(238, 235, 230))
    d.line([(0,ledge_y),(W,ledge_y)], fill=(226, 221, 214), width=3)
    # soft warm light pooling from the left, matching the department shots
    glow = Image.new("L", (W,H), 0)
    gd = ImageDraw.Draw(glow)
    gd.ellipse([-int(W*0.35), -int(H*0.5), int(W*0.55), int(H*0.95)], fill=90)
    glow = glow.filter(ImageFilter.GaussianBlur(160))
    bgc = Image.composite(Image.new("RGB",(W,H),(255,252,245)), bgc, glow)
    # corner vignette so the tile's overlaid label stays legible
    vig = Image.new("L",(W,H),0)
    vd = ImageDraw.Draw(vig)
    vd.rectangle([0,int(H*0.55),W,H], fill=70)
    vig = vig.filter(ImageFilter.GaussianBlur(120))
    bgc = Image.composite(Image.new("RGB",(W,H),(214,203,188)), bgc, vig)
    return bgc.convert("RGBA")

items = []
for p in paths:
    try:
        im = trim(knockout_white(Image.open(p)))
        if im.width > 4 and im.height > 4:
            items.append(im)
    except Exception as e:
        print(f"  ! skipped {os.path.basename(p)}: {e}", file=sys.stderr)

if not items:
    print("NO_USABLE_ITEMS"); sys.exit(2)

items = items[:5]
n = len(items)
canvas = backdrop()
ledge_y = int(H*0.74)

# a common visual height, alternating slightly so the row looks styled
base_h = int(H * (0.50 if n >= 4 else 0.56))
scales = [1.0, 0.88, 1.06, 0.92, 1.0][:n]

# Scale to a common HEIGHT, but cap each item's width: supplier sets mix tall
# bottles with squat wide jars, and height-only scaling lets a wide item balloon
# out and swallow the frame.
max_w = int(W * (0.30 if n >= 4 else 0.38))
placed = []
for im, s in zip(items, scales):
    th = max(40, int(base_h * s))
    tw = max(20, int(im.width * (th / im.height)))
    if tw > max_w:                     # wide/squat item — fit by width instead
        tw = max_w
        th = max(40, int(im.height * (tw / im.width)))
    placed.append(im.resize((tw, th), Image.LANCZOS))

gap = int(W * 0.035)
total = sum(i.width for i in placed) + gap * (n - 1)
# if the row is too wide for the frame, shrink the whole group together
if total > W * 0.84:
    k = (W * 0.84) / total
    placed = [i.resize((max(12,int(i.width*k)), max(24,int(i.height*k))), Image.LANCZOS) for i in placed]
    total = sum(i.width for i in placed) + gap * (n - 1)

x = (W - total) // 2
for im in placed:
    y = ledge_y - im.height + int(H*0.02)   # stand on the ledge
    # contact shadow
    sh = Image.new("L", (im.width, max(10,int(im.height*0.10))), 0)
    ImageDraw.Draw(sh).ellipse([0,0,im.width,sh.height], fill=105)
    sh = sh.filter(ImageFilter.GaussianBlur(im.width*0.045))
    shadow = Image.new("RGBA", canvas.size, (0,0,0,0))
    shadow.paste(Image.new("RGBA",(im.width,sh.height),(120,102,80,255)),
                 (x, ledge_y - int(sh.height*0.45)), sh)
    canvas = Image.alpha_composite(canvas, shadow)
    canvas.alpha_composite(im, (x, y))
    x += im.width + gap

canvas.convert("RGB").save(out_path, "WEBP", quality=82, method=6)
print(f"OK {n}")
`;

// The manifest is derived from what is actually in public/beauty/categories/,
// NOT from what this run happened to composite. Tiles reach that folder two
// ways — composited here from supplier shots, or exported straight from the
// art-direction tool for groups we have no supplier cut-outs for yet — and
// both are equally real to the World page. Deriving from the output folder is
// also what makes a partial set safe: regenerating one tile can no longer drop
// the other 44 out of the manifest.
function writeManifest() {
  const slugs = existsSync(OUT_DIR)
    ? readdirSync(OUT_DIR).filter((f) => extname(f).toLowerCase() === ".webp").map((f) => basename(f, ".webp")).sort()
    : [];
  const body = `// lib/beauty/categoryImages.js
// GENERATED by scripts/build_category_tiles.mjs — do not edit by hand.
// Maps a category slug to its tile in public/beauty/categories/.
// An uploaded beauty_categories.image_url always takes precedence over this.
export const CATEGORY_IMG = {
${slugs.map((s) => `  ${JSON.stringify(s)}: "/beauty/categories/${s}.webp",`).join("\n")}
};
`;
  writeFileSync(MANIFEST, body);
  console.log(`\nwrote lib/beauty/categoryImages.js — ${slugs.length} tiles`);
  return slugs.length;
}

mkdirSync(OUT_DIR, { recursive: true });

// No sources to composite is not an error: it just means every tile currently
// in the output folder came from the art-direction tool. Refresh the manifest
// and stop, so `--manifest-only` runs and first-time checkouts both work.
const groups = existsSync(SRC_DIR)
  ? readdirSync(SRC_DIR).filter((d) => statSync(join(SRC_DIR, d)).isDirectory()).sort()
  : [];
if (!groups.length || process.argv.includes("--manifest-only")) {
  if (!groups.length) {
    console.log(`No group folders in assets/category-source/ — nothing to composite.`);
    console.log(`Drop 3-5 official product shots per group slug in there to composite tiles.`);
  }
  writeManifest();
  process.exit(0);
}

for (const slug of groups) {
  const dir = join(SRC_DIR, slug);
  const files = readdirSync(dir)
    .filter((f) => EXTS.has(extname(f).toLowerCase()))
    .sort()
    .map((f) => join(dir, f));
  if (!files.length) { console.warn(`- ${slug}: no images, skipped`); continue; }
  const out = join(OUT_DIR, `${slug}.webp`);
  try {
    const res = execFileSync("python3", ["-c", PY, out, ...files], { encoding: "utf8" });
    const kb = Math.round(statSync(out).size / 1024);
    console.log(`✓ ${slug}: ${res.trim()} items -> public/beauty/categories/${slug}.webp (${kb} KB)`);
  } catch (e) {
    console.error(`✗ ${slug}: ${e.stderr || e.message}`);
  }
}

// WorldGrid consults the manifest only when a category has no uploaded
// image_url of its own, so a panel upload always wins over anything here.
writeManifest();
