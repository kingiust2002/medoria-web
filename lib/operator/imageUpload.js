// lib/operator/imageUpload.js — SERVER ONLY. Stores one image into a PUBLIC storage bucket after lib/operator/imageSafety.js has checked and cleaned it.
// The permission check belongs to the calling action (it must come first); the admin client is passed in. → { ok, path, url, width, height } | { ok: false, error }
import { tr } from "../panel/i18n.js";
import { safeFileName } from "./validation.js";
import { prepareImageUpload, IMAGE_MESSAGES } from "./imageSafety.js";

export async function storeImage(admin, { bucket, folder, file, bucketMissing = null, prepare = prepareImageUpload }) {
  const img = await prepare(file);
  if (!img.ok) return img;
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeFileName(file.name)}`;
  const { error } = await admin.storage.from(bucket).upload(path, img.buffer, { contentType: img.contentType, upsert: false });
  if (error) return { ok: false, error: bucketMissing && /bucket/i.test(String(error.message)) ? bucketMissing : tr("آپلود ناموفق بود.") };
  const { data } = admin.storage.from(bucket).getPublicUrl(path);
  return { ok: true, path, url: data.publicUrl, width: img.width, height: img.height };
}

export { IMAGE_MESSAGES };
