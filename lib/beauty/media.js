// lib/beauty/media.js — SERVER ONLY. Detects the beauty hero banner in
// /public/beauty/hero so the (verbatim-copied) hero only renders its photo
// layer when the file actually exists. Showcase tiles use ImagePlaceholder,
// which handles missing files with its own premium fallback.
import "server-only";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(process.cwd(), "public", "beauty");
const EXTS = [".avif", ".webp", ".jpg", ".jpeg", ".png"];

export const BEAUTY_SLOTS = {
  "hero-banner": "hero/hero-banner-light",
};

export function getBeautyMedia() {
  const media = {};
  for (const [id, rel] of Object.entries(BEAUTY_SLOTS)) {
    media[id] = null;
    for (const ext of EXTS) {
      if (fs.existsSync(path.join(ROOT, rel + ext))) {
        media[id] = `/beauty/${rel}${ext}`;
        break;
      }
    }
  }
  return media;
}
