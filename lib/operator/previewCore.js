// lib/operator/previewCore.js — "show me this on the real site" (N5): the work behind the preview server actions of BOTH panels. Plain module: the
// action files own the session and pass it in. Checks the right to see products, cleans the form's values with the same function a save uses,
// parks them in the server's short-lived store for THIS session and house, and returns the private address. Nothing is saved.
import { mayView } from "./access.js";
import { cleanDraft, previewStore } from "./previewDraft.js";
import { tr } from "../panel/i18n.js";

export const PREVIEW_MESSAGES = {
  denied: tr("برای دیدن پیش‌نمایش دسترسی ندارید."),
  badId: tr("شناسه محصول نامعتبر است."),
  tooBig: tr("اطلاعات فرم برای پیش‌نمایش زیادی بزرگ است."),
  bad: tr("اطلاعات فرم برای پیش‌نمایش معتبر نیست."),
};
const TABLE = { health: "products", beauty: "beauty_products" };

// id: null / "new" (a product not saved yet) or a product number. → { ok, token, path } | { ok: false, error }
export function createPreview({ house, session, id, input, audit, store = previewStore }) {
  if (!session || !mayView(session, house, "products.view")) return { ok: false, error: PREVIEW_MESSAGES.denied };
  const isNew = id == null || id === "new" || id === "";
  const pid = isNew ? null : Number(id);
  if (!isNew && !(Number.isSafeInteger(pid) && pid > 0)) return { ok: false, error: PREVIEW_MESSAGES.badId };
  const c = cleanDraft(input);
  if (!c.ok) return { ok: false, error: c.error === "too_big" ? PREVIEW_MESSAGES.tooBig : PREVIEW_MESSAGES.bad };
  const token = store.put({ sid: session.sid, house }, pid, c.draft);
  try { audit?.("product.preview", { entity: TABLE[house], ids: pid ? [pid] : undefined }); } catch { /* the preview itself is harmless */ }      // the history says WHO looked, never what was typed
  return { ok: true, token, path: `/${house}/tg/preview/${pid ?? "new"}?token=${token}` };
}
