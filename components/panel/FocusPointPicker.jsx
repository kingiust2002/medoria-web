"use client";
// components/panel/FocusPointPicker.jsx
// Dependency-free focal-point ("smart crop") picker, shared by both panels.
// A category tile shows its image cropped to a fixed box (object-fit: cover);
// this control lets the operator choose WHICH part of the image stays inside
// that box. It emits a CSS object-position string "NN% MM%" (two integers
// 0–100); `null`/empty means the centre. The image itself is never cut or
// re-encoded — the point is a non-destructive framing choice.
//
// Interaction: click or drag inside the frame, or focus it and use the arrow
// keys (±5, Home = centre). Fully keyboard-reachable and works at phone width.
import { useCallback, useRef, useState } from "react";
import Icon from "@/components/shared/Icon";
import { useT } from "@/components/panel/PanelI18n";

const clamp = (n) => Math.min(100, Math.max(0, Math.round(n)));

export function parseFocus(value) {
  const nums = String(value || "").match(/\d+(?:\.\d+)?/g);
  if (!nums || nums.length < 2) return { x: 50, y: 50 };
  return { x: clamp(Number(nums[0])), y: clamp(Number(nums[1])) };
}
export const formatFocus = (x, y) => `${clamp(x)}% ${clamp(y)}%`;

export default function FocusPointPicker({ src, value, onChange, disabled = false }) {
  const t = useT();
  const boxRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const { x, y } = parseFocus(value);
  const pos = formatFocus(x, y);

  const emit = useCallback((nx, ny) => onChange(formatFocus(nx, ny)), [onChange]);

  const setFromEvent = useCallback((clientX, clientY) => {
    const box = boxRef.current;
    if (!box) return;
    const r = box.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    emit(((clientX - r.left) / r.width) * 100, ((clientY - r.top) / r.height) * 100);
  }, [emit]);

  function onPointerDown(e) {
    if (disabled) return;
    e.preventDefault();
    boxRef.current?.focus();
    setDragging(true);
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
    setFromEvent(e.clientX, e.clientY);
  }
  function onPointerMove(e) {
    if (!dragging || disabled) return;
    setFromEvent(e.clientX, e.clientY);
  }
  function endDrag(e) {
    if (!dragging) return;
    setDragging(false);
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
  }
  function onKeyDown(e) {
    if (disabled) return;
    const step = e.shiftKey ? 1 : 5;
    const map = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (map[e.key]) { e.preventDefault(); emit(x + map[e.key][0], y + map[e.key][1]); }
    else if (e.key === "Home") { e.preventDefault(); emit(50, 50); }
  }

  return (
    <div className="w-full max-w-[280px]">
      <div
        ref={boxRef}
        data-testid="focus-point"
        data-focus={pos}
        role="application"
        aria-label={t("نقطهٔ کانونی تصویر — با کشیدن یا کلیدهای جهت‌نما تنظیم کنید")}
        tabIndex={disabled ? -1 : 0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
        className={`relative w-full overflow-hidden rounded-xl border border-line bg-line-soft outline-none ${disabled ? "opacity-60" : "cursor-crosshair focus-visible:ring-2 focus-visible:ring-brand-violet"}`}
        style={{ aspectRatio: "4 / 3", touchAction: "none" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" draggable={false} className="pointer-events-none absolute inset-0 h-full w-full object-cover" style={{ objectPosition: pos }} />
        <span aria-hidden className="pointer-events-none absolute inset-0 bg-navy/10" />
        {/* cross-hair handle */}
        <span
          aria-hidden
          className="pointer-events-none absolute h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1.5px_rgba(0,0,0,.35)] ring-1 ring-black/20"
          style={{ left: `${x}%`, top: `${y}%`, background: "rgba(255,255,255,.18)" }}
        >
          <span className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow" />
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-[11px] text-ink-faint tabular-nums" dir="ltr">{pos}</span>
        <button
          type="button"
          onClick={() => emit(50, 50)}
          disabled={disabled}
          className="btn-ghost size-sm !h-auto min-h-7 py-1 text-[11px] disabled:opacity-50"
        >
          <Icon name="refresh" size={13} /> {t("وسط")}
        </button>
      </div>
    </div>
  );
}
