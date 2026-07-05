// lib/beauty/media.js — SERVER ONLY. Scans /public/beauty at render/build time
// so sections know which campaign assets exist. Dropping a correctly named
// file into public/beauty/<section>/ replaces its fallback automatically on
// the next build — no code change needed. See docs/beauty/asset-manifest.md.
import "server-only";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(process.cwd(), "public", "beauty");
const EXTS = [".avif", ".webp", ".jpg", ".jpeg", ".png"];

// Manifest slot ids → expected basename (extension may be any of EXTS).
export const BEAUTY_SLOTS = {
  "hero-banner": "hero/hero-banner",
  "world-skincare": "collections/world-skincare",
  "world-makeup": "collections/world-makeup",
  "world-tools": "collections/world-tools",
  "featured-01": "featured/featured-01",
  "featured-02": "featured/featured-02",
  "featured-03": "featured/featured-03",
  "showcase-01": "showcase/showcase-01",
  "showcase-02": "showcase/showcase-02",
  "showcase-03": "showcase/showcase-03",
  "showcase-04": "showcase/showcase-04",
};

export function getBeautyMedia() {
  const media = {};
  for (const [id, rel] of Object.entries(BEAUTY_SLOTS)) {
    media[id] = null;
    for (const ext of EXTS) {
      const abs = path.join(ROOT, rel + ext);
      if (fs.existsSync(abs)) {
        media[id] = `/beauty/${rel}${ext}`;
        break;
      }
    }
  }
  return media;
}
