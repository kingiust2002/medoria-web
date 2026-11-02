// lib/operator/focusScope.js — does this category table have the focus columns of migration 47 yet? The panel offers (and writes) a focus point only when
// it does, so saving a category works before and after the migration. Plain module: the client is passed in.
import { cleanFocus } from "../imageFocus.js";

const cache = new Map();                     // table → { ready, at }
const RECHECK_MS = 30_000;                   // "not yet" is asked again after a while (the migration may be applied while the server runs)

export async function focusReady(admin, table, now = Date.now()) {
  if (!admin) return false;
  const hit = cache.get(table);
  if (hit && (hit.ready || now - hit.at < RECHECK_MS)) return hit.ready;
  const { error } = await admin.from(table).select("image_focus_x").limit(1);
  const ready = !error;
  cache.set(table, { ready, at: now });
  return ready;
}
export const resetFocusScope = () => cache.clear();

// Lays the focus of a form over a row that is about to be written: only when the form sent one (`image_focus_x` / `_y` keys present), only when the
// column exists, and a value that is not a valid point is an error, never silently written. → { ok: true, row } | { ok: false }
export async function withFocus(admin, table, row, input) {
  if (!input || !("image_focus_x" in input || "image_focus_y" in input)) return { ok: true, row };
  const c = cleanFocus(input.image_focus_x, input.image_focus_y);
  if (!c.ok) return { ok: false };
  if (!(await focusReady(admin, table))) return { ok: true, row };            // before migration 47 the choice cannot be stored (the screen does not offer it)
  return { ok: true, row: { ...row, image_focus_x: c.focus ? c.focus.x : null, image_focus_y: c.focus ? c.focus.y : null } };
}
