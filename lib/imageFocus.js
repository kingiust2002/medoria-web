// lib/imageFocus.js — the focus point of an image (N7): the part of a picture (0–100 % from the left / from the top) that must stay in view when the
// site crops it into a tile. Pure; used by the panels (to choose it) and by the public pages (to show it, as CSS object-position).
// Stored as two whole numbers in image_focus_x / image_focus_y (migration 47); both missing = no choice = the centre.
export const FOCUS_CENTER = Object.freeze({ x: 50, y: 50 });

const whole = (v) => (typeof v === "number" ? v : typeof v === "string" && /^\s*-?\d{1,3}\s*$/.test(v) ? Number(v) : NaN);

// What a form sends → { ok: true, focus: { x, y } | null } (null = clear it) | { ok: false }
export function cleanFocus(x, y) {
  const blank = (v) => v === undefined || v === null || v === "";
  if (blank(x) && blank(y)) return { ok: true, focus: null };
  const nx = whole(x), ny = whole(y);
  if (!Number.isInteger(nx) || !Number.isInteger(ny) || nx < 0 || nx > 100 || ny < 0 || ny > 100) return { ok: false };
  return { ok: true, focus: { x: nx, y: ny } };
}

// A stored row → { x, y } or null
export function rowFocus(row) {
  const c = cleanFocus(row?.image_focus_x, row?.image_focus_y);
  return c.ok ? c.focus : null;
}

// CSS object-position of a stored row (the centre when nothing was chosen)
export function focusStyle(row) {
  const f = rowFocus(row) || FOCUS_CENTER;
  return `${f.x}% ${f.y}%`;
}
