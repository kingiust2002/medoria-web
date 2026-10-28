// lib/operator/mediaLibrary.js — the image library of one house: every uploaded file of its buckets, where each one is used, and the
// removal of files nothing uses. Plain module (the admin client is passed in): unit-tested. Only this house's buckets and folders are
// ever listed or touched; a file that is still used is never removed (checked again at the moment of removal).
import { tr } from "../panel/i18n.js";

export const MEDIA_SOURCES = {
  health: {
    buckets: [{ bucket: "product-images", folders: ["products"] }],
    // [table, columns that hold an image path or URL, label column]
    usage: [
      { table: "products", kind: "product", cols: ["image_url", "gallery_urls"], label: ["sku", "name_en", "name_fa"] },
      { table: "categories", kind: "category", cols: ["image_url"], label: ["slug", "name_en", "name_fa"] },
    ],
  },
  beauty: {
    buckets: [{ bucket: "beauty-product-images", folders: ["products", "categories"] }, { bucket: "beauty-brand-logos", folders: ["logos"] }],
    usage: [
      { table: "beauty_products", kind: "product", cols: ["image_url", "gallery_urls"], label: ["sku", "name_en", "name_fa"] },
      { table: "beauty_categories", kind: "category", cols: ["image_url"], label: ["slug", "name_en", "name_fa"] },
      { table: "beauty_brands", kind: "brand", cols: ["logo_url"], label: ["slug", "name"] },        // beauty_brands has `name`, not name_en / name_fa (migration 11)
    ],
  },
};

export const MEDIA_MESSAGES = {
  unavailable: tr("کتابخانهٔ تصویر در دسترس نیست."),
  badFile: tr("فایل نامعتبر است."),
  inUse: tr("این تصویر هنوز استفاده می‌شود؛ ابتدا از جاهای زیر بردارید."),
  gone: tr("این فایل دیگر وجود ندارد."),
  failed: tr("حذف ناموفق بود. دوباره تلاش کنید."),
};

const PER_FOLDER = 200;
const sourceOf = (panel) => MEDIA_SOURCES[panel === "beauty" ? "beauty" : "health"];

// "https://x/storage/v1/object/public/<bucket>/<path>" | "<path>" → the path inside the bucket (or null)
export function pathOfRef(ref, bucket) {
  if (typeof ref !== "string" || !ref) return null;
  const marker = `/${bucket}/`;
  const i = ref.indexOf(marker);
  if (/^https?:\/\//i.test(ref)) return i >= 0 ? decodeURIComponent(ref.slice(i + marker.length).split("?")[0]) : null;
  return ref.replace(/^\/+/, "");
}

// Only the folders this house uploads to, no traversal.
export function isAllowedFile(panel, bucket, path) {
  if (typeof path !== "string" || path.length > 300 || /(^|\/)\.\.(\/|$)|[\\\0]/.test(path)) return false;
  const b = sourceOf(panel).buckets.find((x) => x.bucket === bucket);
  return Boolean(b) && b.folders.some((f) => path.startsWith(`${f}/`) && path.length > f.length + 1 && !path.slice(f.length + 1).includes("/"));
}

// Every scan below reads ALL rows of its table, page by page: the API returns at most a fixed number of rows per request (1000 by default), and a
// partial scan cannot prove that a file is unused. If a page cannot be read, or the table is larger than the ceiling, the answer is "cannot say".
const PAGE = 1000;
const MAX_PAGES = 200;
async function scanAll(admin, table, columns, filter = (q) => q) {
  const rows = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await filter(admin.from(table).select(columns)).order("id", { ascending: true }).range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) return { ok: false, error };
    rows.push(...(data || []));
    if (!data || data.length < PAGE) return { ok: true, rows };
  }
  return { ok: false, error: { code: "ceiling" } };
}

// the keys of a change request's proposal that hold an image reference (keys starting with "_" are an executor's own arguments)
const PROPOSAL_IMAGE_KEYS = ["image_url", "gallery_urls", "logo_url"];

// → { ok: true, map: Map "bucket/path" → [{ kind, id, label }] } | { ok: false }
// "kind" is product | category | brand | request (a PENDING change request that would put the file on a record). It fails CLOSED: any
// unreadable table, any unexpected error and any exception means "cannot say", never "unused". (A table this house does not have is not
// skipped: a wrong column name once made every Beauty brand logo look unused.)
export async function usageMap(admin, panel) {
  try {
    const src = sourceOf(panel);
    const map = new Map();
    const note = (ref, entry) => {
      for (const { bucket } of src.buckets) {
        const p = pathOfRef(ref, bucket);
        if (!p) continue;
        const key = `${bucket}/${p}`;
        const list = map.get(key) || [];
        if (!list.some((x) => x.kind === entry.kind && x.id === entry.id)) list.push(entry);
        map.set(key, list);
      }
    };
    for (const u of src.usage) {
      const got = await scanAll(admin, u.table, ["id", ...u.cols, ...u.label].join(","));
      if (!got.ok) return { ok: false };
      for (const row of got.rows) {
        const refs = u.cols.flatMap((c) => (Array.isArray(row[c]) ? row[c] : [row[c]]));
        for (const ref of refs) note(ref, { kind: u.kind, id: row.id, label: u.label.map((c) => row[c]).find(Boolean) || `#${row.id}` });
      }
    }
    // pending proposals: approving one would reference the file, so the file must still be there
    const pending = await scanAll(admin, "operator_change_requests", "id,entity,subject,proposed", (q) => q.eq("house", panel === "beauty" ? "beauty" : "health").eq("status", "pending"));
    if (!pending.ok) {
      if (["42P01", "PGRST205"].includes(pending.error?.code)) return { ok: true, map };        // migration 35 not applied: no proposal can exist
      return { ok: false };
    }
    for (const r of pending.rows) {
      for (const k of PROPOSAL_IMAGE_KEYS) {
        const v = r.proposed?.[k];
        for (const ref of Array.isArray(v) ? v : [v]) note(ref, { kind: "request", id: r.id, label: r.subject || `#${r.id}` });
      }
    }
    return { ok: true, map };
  } catch {
    return { ok: false };
  }
}

export async function listMedia(admin, panel) {
  const src = sourceOf(panel);
  const used = await usageMap(admin, panel);
  if (!used.ok) return { ok: false, error: MEDIA_MESSAGES.unavailable };
  const items = [];
  let truncated = false;
  for (const { bucket, folders } of src.buckets) {
    for (const folder of folders) {
      const { data, error } = await admin.storage.from(bucket).list(folder, { limit: PER_FOLDER, offset: 0, sortBy: { column: "created_at", order: "desc" } });
      if (error) return { ok: false, error: MEDIA_MESSAGES.unavailable };
      if ((data || []).length >= PER_FOLDER) truncated = true;
      for (const o of data || []) {
        if (!o.name || o.id == null) continue;                                       // a folder placeholder
        const path = `${folder}/${o.name}`;
        items.push({
          bucket, path, name: o.name, size: Number(o.metadata?.size) || null, created_at: o.created_at || null,
          url: admin.storage.from(bucket).getPublicUrl(path).data.publicUrl, usedBy: used.map.get(`${bucket}/${path}`) || [],
        });
      }
    }
  }
  items.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  return { ok: true, items, truncated };
}

// Removes one unused file. The usage is read AGAIN here (a screen may be minutes old).
export async function deleteMedia(admin, panel, { bucket, path }) {
  if (!isAllowedFile(panel, bucket, path)) return { ok: false, error: MEDIA_MESSAGES.badFile };
  const used = await usageMap(admin, panel);
  if (!used.ok) return { ok: false, error: MEDIA_MESSAGES.unavailable };
  const by = used.map.get(`${bucket}/${path}`) || [];
  if (by.length) return { ok: false, inUse: true, usedBy: by, error: MEDIA_MESSAGES.inUse };
  const { data, error } = await admin.storage.from(bucket).remove([path]);
  if (error) return { ok: false, error: MEDIA_MESSAGES.failed };
  if (Array.isArray(data) && data.length === 0) return { ok: false, error: MEDIA_MESSAGES.gone };
  return { ok: true };
}

// how an APPROVED media removal is applied (the person who asked may not delete directly): same checks, now
export function makeMediaExecutors({ panel }) {
  return {
    "media.delete": async ({ admin, request }) => {
      const res = await deleteMedia(admin, panel, { bucket: request.proposed?._bucket, path: request.proposed?._path });
      return res.ok ? { ok: true } : { ok: false, error: res.inUse ? "stale" : res.error === MEDIA_MESSAGES.gone ? "notFound" : "failed" };
    },
  };
}
