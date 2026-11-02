// lib/documentServe.js — the one door to the BYTES of a product document (review R1). Plain module (the clients are passed in): unit-tested.
//
// The files live in private storage buckets (migration 54), so there is no address that works without this code. Two kinds of caller:
//   access "public" — an anonymous visitor: served only if the document is public RIGHT NOW (published, not expired, active parent, not a variant),
//                     judged by the database function public_*_product_document_visible at the moment of the request. Anything else — draft,
//                     hidden, expired, archived parent, variant, another house's id, an id that does not exist — gets the same 404, so the answer
//                     reveals nothing.
//   access "staff"  — the route has ALREADY checked the panel session and the right to see documents of that house; any state of a document of
//                     that house's own table is served. The other house's documents are not reachable through it (the table is the house's own).
// Nothing is cached anywhere ("no-store"): hiding, expiring or deleting a document takes effect on the next request, not after a cache lifetime.
// The response is always application/pdf with nosniff, and only if the stored bytes really start like a PDF.
export const DOC_HOUSES = { health: { table: "product_documents", bucket: "product-documents", visible: "public_product_document_visible" }, beauty: { table: "beauty_product_documents", bucket: "beauty-product-documents", visible: "public_beauty_product_document_visible" } };
const MAX_BYTES = 16 * 1024 * 1024;

export function parseDocRef(house, id) {
  if (!Object.hasOwn(DOC_HOUSES, house)) return null;
  const n = typeof id === "string" && /^[1-9]\d{0,15}$/.test(id) ? Number(id) : null;
  return n !== null && Number.isSafeInteger(n) ? { house, id: n } : null;
}

const BASE = { "Cache-Control": "private, no-store, max-age=0, must-revalidate", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" };
const plain = (status, text) => ({ status, headers: { ...BASE, "Content-Type": "text/plain; charset=utf-8" }, body: text });
export const notFound = () => plain(404, "Not found");

// the file name offered to the visitor: the document's title as ASCII fallback + the UTF-8 form
function dispositionFor(title, id) {
  const stem = String(title || "").normalize("NFC").replace(/[\u0000-\u001f\u007f"\\/:*?<>|;]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || `document-${id}`;
  const ascii = stem.replace(/[^\x20-\x7e]/g, "").replace(/\s+/g, " ").trim() || `document-${id}`;
  return `inline; filename="${ascii}.pdf"; filename*=UTF-8''${encodeURIComponent(stem)}.pdf`;
}

// → { status, headers, body } — the route turns it into a Response.
//   isVisible(house, id) → Promise<boolean>   (anonymous client + the database function; only used for access "public")
//   admin → the service-role client of the application (reads the row and downloads the object)
export async function serveDocument({ house, id, access, isVisible, admin }) {
  const ref = parseDocRef(house, String(id));
  if (!ref || (access !== "public" && access !== "staff")) return notFound();
  const cfg = DOC_HOUSES[ref.house];
  if (access === "public") {
    let visible = false;
    try { visible = (await isVisible(ref.house, ref.id)) === true; } catch { visible = false; }
    if (!visible) return notFound();                                               // a failing check is "no", never "yes"
  }
  if (!admin) return plain(503, "Unavailable");
  const row = await admin.from(cfg.table).select("id,title,file_path,file_size").eq("id", ref.id).maybeSingle();
  if (row.error) return plain(503, "Unavailable");
  if (!row.data || typeof row.data.file_path !== "string" || !/^documents\/[A-Za-z0-9._-]+$/.test(row.data.file_path)) return notFound();
  let file;
  try { file = await admin.storage.from(cfg.bucket).download(row.data.file_path); } catch { return plain(502, "Unavailable"); }
  if (file.error || !file.data) return notFound();
  const bytes = Buffer.from(await file.data.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_BYTES || bytes.subarray(0, 5).toString("latin1") !== "%PDF-") return plain(502, "Unavailable");   // never served as a PDF unless it is one
  return { status: 200, headers: { ...BASE, "Content-Type": "application/pdf", "Content-Length": String(bytes.length), "Content-Disposition": dispositionFor(row.data.title, ref.id) }, body: bytes };
}

export const toResponse = (r) => new Response(r.body, { status: r.status, headers: r.headers });
