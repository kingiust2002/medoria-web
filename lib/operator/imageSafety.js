// lib/operator/imageSafety.js — SERVER ONLY. Every image that is uploaded from a panel (product, category, brand logo) goes through here before it is
// stored in a PUBLIC bucket:
//   * the real type is read from the bytes (never the client-declared one) and must be one of JPEG / PNG / WEBP / AVIF — never SVG, GIF, HTML;
//   * the file must decode (a damaged or disguised file is refused), must not be animated, must not be larger than MAX_SIDE px on a side or MAX_PIXELS
//     in total (a "decompression bomb" is refused before it is decoded);
//   * it is RE-ENCODED: the orientation is applied, colours go to sRGB, and ALL metadata (EXIF, GPS position, camera, ICC, XMP, comments) is dropped,
//     so a photo taken on a phone cannot publish where it was taken; a very large picture is scaled down to MAX_OUT px;
//   * the result must still fit the size limit.
// Fails CLOSED: if the image library cannot be loaded, nothing is uploaded. Plain module (the library can be injected) so it is unit-tested.
import { tr } from "../panel/i18n.js";
import { sniffImageType, MAX_IMAGE_BYTES, ALLOWED_IMAGE_TYPES } from "./validation.js";

export const IMAGE_LIMITS = { maxBytes: MAX_IMAGE_BYTES, maxSide: 8000, maxPixels: 36_000_000, maxOut: 4096 };

export const IMAGE_MESSAGES = {
  none: tr("فایلی انتخاب نشده است."),
  tooBig: tr("حجم تصویر بیش از ۵ مگابایت است."),
  type: tr("فقط تصویر JPG/PNG/WEBP/AVIF مجاز است."),
  notImage: tr("محتوای فایل یک تصویر معتبر نیست."),
  animated: tr("تصویر متحرک پشتیبانی نمی‌شود؛ یک تصویر ثابت بفرستید."),
  dimensions: tr("ابعاد تصویر بیش از حد بزرگ است (حداکثر ۸۰۰۰ پیکسل در هر ضلع)."),
  unavailable: tr("پردازش تصویر در دسترس نیست؛ چیزی آپلود نشد."),
  afterTooBig: tr("تصویر پس از پردازش هم بیش از ۵ مگابایت است؛ کوچک‌تر کنید."),
};

let sharpPromise = null;
async function loadSharp() {
  sharpPromise ??= import("sharp").then((m) => m.default || m).catch(() => null);
  return sharpPromise;
}

const ENCODE = {
  "image/jpeg": (s) => s.jpeg({ quality: 88, mozjpeg: true }),
  "image/png": (s) => s.png({ compressionLevel: 9 }),
  "image/webp": (s) => s.webp({ quality: 88 }),
  "image/avif": (s) => s.avif({ quality: 60 }),
};

// `file` is a File / Blob (size, type, arrayBuffer()). → { ok: true, buffer, contentType, width, height, resized } | { ok: false, error }
export async function prepareImageUpload(file, { limits = IMAGE_LIMITS, sharp: sharpImpl } = {}) {
  if (!file || typeof file === "string" || typeof file.arrayBuffer !== "function") return { ok: false, error: IMAGE_MESSAGES.none };
  if (file.size > limits.maxBytes) return { ok: false, error: IMAGE_MESSAGES.tooBig };
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) return { ok: false, error: IMAGE_MESSAGES.type };
  const input = Buffer.from(await file.arrayBuffer());
  const sniffed = sniffImageType(new Uint8Array(input.subarray(0, 16)));
  if (!sniffed) return { ok: false, error: IMAGE_MESSAGES.notImage };
  const sharp = sharpImpl === undefined ? await loadSharp() : sharpImpl;       // `null` = "the library is not available" (tests)
  if (!sharp) return { ok: false, error: IMAGE_MESSAGES.unavailable };
  try {
    const open = () => sharp(input, { limitInputPixels: limits.maxPixels, failOn: "error", animated: true });
    const meta = await open().metadata();
    if ((meta.pages || 1) > 1) return { ok: false, error: IMAGE_MESSAGES.animated };
    if (!meta.width || !meta.height) return { ok: false, error: IMAGE_MESSAGES.notImage };
    if (meta.width > limits.maxSide || meta.height > limits.maxSide || meta.width * meta.height > limits.maxPixels) return { ok: false, error: IMAGE_MESSAGES.dimensions };
    let pipeline = open().rotate().toColourspace("srgb");
    const resized = Math.max(meta.width, meta.height) > limits.maxOut;
    if (resized) pipeline = pipeline.resize({ width: limits.maxOut, height: limits.maxOut, fit: "inside", withoutEnlargement: true });
    const { data, info } = await ENCODE[sniffed](pipeline).toBuffer({ resolveWithObject: true });
    if (data.length > limits.maxBytes) return { ok: false, error: IMAGE_MESSAGES.afterTooBig };
    return { ok: true, buffer: data, contentType: sniffed, width: info.width, height: info.height, resized };
  } catch (e) {
    // sharp reports "Input image exceeds pixel limit" for a bomb and a decoder error for a damaged / disguised file
    if (/pixel limit/i.test(String(e?.message))) return { ok: false, error: IMAGE_MESSAGES.dimensions };
    return { ok: false, error: IMAGE_MESSAGES.notImage };
  }
}
