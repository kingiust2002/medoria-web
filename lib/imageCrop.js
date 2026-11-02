// lib/imageCrop.js — the geometry of the crop dialog (N7). Pure, so it is unit-tested.

// the part of a (nw × nh) picture that a frame of ratio `r` shows at `zoom`, positioned by cx / cy (0–100 %): {left, top, cw, ch} in picture pixels
export function cropRect(nw, nh, r, zoom, cx, cy) {
  let cw = nw / nh > r ? nh * r : nw;
  let ch = cw / r;
  cw /= zoom; ch /= zoom;
  return { cw, ch, left: (nw - cw) * (cx / 100), top: (nh - ch) * (cy / 100) };
}

