// lib/brandFluid.js — how wide the header lockups are, and how they shrink on
// phones. Plain JS (no JSX) so tests/mobile-width.test.mjs can verify the math:
// a lockup must never be wider than the room its header row leaves for it.

// ── Health: mark + "Medoria" wordmark + "Health" wordmark ─────────────────────
export const HEALTH_RATIO = 682 / 2048;   // Health.png intrinsic aspect ratio (h / w)
export const MEDORIA_RATIO = 5.03;        // "Medoria" wordmark width ÷ its height
// width ≈ HEALTH_WIDTH_PER_H × height + HEALTH_GAPS   (mark 1.18h, wordmark 5.03h,
// "Health" 0.6h ÷ HEALTH_RATIO; gaps 10px + 8px)
export const HEALTH_WIDTH_PER_H = 1.18 + MEDORIA_RATIO + 0.6 / HEALTH_RATIO;
export const HEALTH_GAPS = 18;

// ── Beauty: two clipped official wordmarks ────────────────────────────────────
// Measured glyph coverage of the official PNGs (opaque-pixel bounds); see
// components/beauty/BeautyBrand.jsx for what each field means.
export const MED = { aspect: 702 / 355, fillY: 0.2845, leftX: 0.1083, fillX: 0.8219, botFrac: 0.6169 };
export const BTY = { aspect: 866 / 288, fillY: 0.6493, leftX: 0.0912, fillX: 0.8418, botFrac: 0.8403 };
export const K_MEDORIA = 0.867;           // visible "Medoria" glyph height ÷ lockup height
export const K_BEAUTY = K_MEDORIA * 0.62; // "Beauty", a touch smaller on the same baseline
const boxWidthPerCap = (m) => (m.aspect / m.fillY) * m.fillX;
export const BEAUTY_WIDTH_PER_H = K_MEDORIA * boxWidthPerCap(MED) + K_BEAUTY * boxWidthPerCap(BTY);
export const BEAUTY_GAPS = 8;

// CSS height of a lockup. Without `reserved` it is the fixed `height` px. With
// `reserved` (px the rest of the row needs: sibling controls + container padding)
// it is `clamp(minHeight, (100vw − reserved − gaps) ÷ widthPerH, height)`, so the
// lockup shrinks with the screen and can never push the page sideways.
export function fluidLockupHeight({ height, reserved = 0, minHeight, widthPerH, gaps }) {
  if (!reserved) return `${height}px`;
  return `clamp(${minHeight}px, calc((100vw - ${reserved + gaps}px) * ${(1 / widthPerH).toFixed(4)}), ${height}px)`;
}

// The same formula in plain numbers, for tests.
export function lockupWidthAt(viewport, { height, reserved, minHeight, widthPerH, gaps }) {
  const h = Math.min(height, Math.max(minHeight, (viewport - reserved - gaps) / widthPerH));
  return { height: h, width: widthPerH * h + gaps };
}
