// lib/gateway/media.js — server-only detection of LUMEN GATE campaign media.
// The aperture needs the SAME still-life scene in two gradings:
//   /public/images/gateway/{lumen-cold|lumen-cool|mirror-cool|mirror-cold}.*
//     — glacial Health light (base layer, left of the aperture)
//   /public/images/gateway/{lumen-warm|mirror-warm}.*
//     — champagne Beauty light (clipped layer, right of the aperture)
// Everything beyond the image pair is an OPTIONAL enhancement, auto-detected
// when the owner uploads it and silently absent otherwise (see
// docs/gateway/lumen-assets.md):
//   lumen-cold.(webm|mp4) / lumen-warm.(webm|mp4)  — camera-locked cinemagraph
//     loops of the same scene; the images stay in place as posters/fallback.
//   lumen-health-macro.* / lumen-beauty-macro.*    — macro specimen details
//     staged inside each world's plaque.
// If even the image pair is missing the stage renders its built-in CSS
// grading placeholder, so the route never breaks on missing binaries.
import fs from "node:fs";
import path from "node:path";

const IMG_EXTS = ["avif", "webp", "jpg", "jpeg", "png"];
const VID_EXTS = ["webm", "mp4"];

function find(dir, names, exts) {
  for (const name of names) {
    for (const ext of exts) {
      if (fs.existsSync(path.join(dir, `${name}.${ext}`))) {
        return `/images/gateway/${name}.${ext}`;
      }
    }
  }
  return null;
}

export function gatewayLumenMedia() {
  const dir = path.join(process.cwd(), "public", "images", "gateway");
  // "mirror-*"/"mirror-cold" stay accepted — the live campaign pair uses those
  // names and re-uploading binaries to rename them helps no one.
  const cool = find(dir, ["lumen-cold", "lumen-cool", "mirror-cool", "mirror-cold"], IMG_EXTS);
  const warm = find(dir, ["lumen-warm", "mirror-warm"], IMG_EXTS);
  return {
    scene: cool && warm ? { cool, warm } : null,
    video: {
      cool: find(dir, ["lumen-cold", "lumen-cool"], VID_EXTS),
      warm: find(dir, ["lumen-warm"], VID_EXTS),
    },
    macro: {
      health: find(dir, ["lumen-health-macro"], IMG_EXTS),
      beauty: find(dir, ["lumen-beauty-macro"], IMG_EXTS),
    },
  };
}
