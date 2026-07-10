// lib/gateway/media.js — server-only detection of the gateway mirror campaign
// pair. The Light Mirror needs the SAME scene in two gradings:
//   /public/images/gateway/mirror-cool.(webp|jpg|jpeg|png)  — glacial Health light
//   /public/images/gateway/mirror-warm.(webp|jpg|jpeg|png)  — champagne Beauty light
// Until both files exist the stage renders its built-in CSS grading placeholder,
// so the experience works end-to-end before photography lands (same pattern as
// lib/beauty/media.js).
import fs from "node:fs";
import path from "node:path";

const EXTS = ["webp", "jpg", "jpeg", "png"];

function find(dir, names) {
  for (const name of names) {
    for (const ext of EXTS) {
      if (fs.existsSync(path.join(dir, `${name}.${ext}`))) {
        return `/images/gateway/${name}.${ext}`;
      }
    }
  }
  return null;
}

export function gatewayMirrorImages() {
  const dir = path.join(process.cwd(), "public", "images", "gateway");
  // "mirror-cold" accepted as an alias — the first real campaign upload used
  // that name, and accepting it beats making the owner re-upload binaries.
  const cool = find(dir, ["mirror-cool", "mirror-cold"]);
  const warm = find(dir, ["mirror-warm"]);
  return cool && warm ? { cool, warm } : null;
}
