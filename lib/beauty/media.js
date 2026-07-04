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
  "hero-editorial": "hero/hero-editorial",
  "world-skincare": "collections/world-skincare",
  "world-makeup": "collections/world-makeup",
  "world-tools": "collections/world-tools",
  "signature-product": "signature/signature-product",
  "story-texture": "story/story-texture",
  "lookbook-01": "lookbook/lookbook-01",
  "lookbook-02": "lookbook/lookbook-02",
  "lookbook-03": "lookbook/lookbook-03",
  "lookbook-04": "lookbook/lookbook-04",
  "lookbook-05": "lookbook/lookbook-05",
  "cta-backdrop": "cta/cta-backdrop",
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
