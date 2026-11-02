"use client";
// Choose the focus point of an image (N7): the part that must stay visible when the site crops it into a tile. Shows the WHOLE picture with a marker
// (tap / click to move it; two sliders and the arrow keys do the same without a pointer), and two live tile previews exactly as the site crops it.
import { useRef } from "react";
import { useT } from "@/components/panel/PanelI18n";
import { FOCUS_CENTER } from "@/lib/imageFocus";

const clamp = (n) => Math.min(100, Math.max(0, Math.round(n)));

export default function FocusPicker({ src, value, onChange, disabled = false }) {
  const t = useT();
  const box = useRef(null);
  const f = value || FOCUS_CENTER;
  const move = (x, y) => onChange({ x: clamp(x), y: clamp(y) });
  function onPointer(e) {
    if (disabled) return;
    const r = box.current?.getBoundingClientRect();
    if (!r || !r.width || !r.height) return;
    move(((e.clientX - r.left) / r.width) * 100, ((e.clientY - r.top) / r.height) * 100);
  }
  function onKey(e) {
    const step = e.shiftKey ? 10 : 2;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!d || disabled) return;
    e.preventDefault();
    move(f.x + d[0], f.y + d[1]);
  }
  const pos = `${f.x}% ${f.y}%`;
  return (
    <div className="min-w-0" data-testid="focus-picker">
      <p className="text-xs text-ink-muted mb-1.5">{t("روی بخشی از تصویر که باید همیشه دیده شود بزنید:")}</p>
      <div
        ref={box} role="group" tabIndex={disabled ? -1 : 0} onClick={onPointer} onKeyDown={onKey}
        aria-label={t("نقطهٔ تمرکز تصویر: {x}٪ از چپ، {y}٪ از بالا", { x: f.x, y: f.y })}
        className="relative w-full max-w-sm cursor-crosshair overflow-hidden rounded-xl border border-line bg-line-soft focus-ring touch-manipulation"
      >
        <img src={src} alt="" draggable={false} className="block w-full h-auto select-none" />
        <span aria-hidden="true" data-testid="focus-marker" className="absolute w-6 h-6 -ms-3 -mt-3 rounded-full border-2 border-white bg-brand-violet/70 shadow ring-2 ring-brand-violet pointer-events-none" style={{ left: `${f.x}%`, top: `${f.y}%` }} />
      </div>
      <div className="mt-2 flex flex-col gap-1">
        <label className="flex items-center gap-3 text-sm text-ink min-w-0"><span className="w-24 shrink-0">{t("افقی")}</span><input type="range" min="0" max="100" value={f.x} onChange={(e) => move(Number(e.target.value), f.y)} dir="ltr" disabled={disabled} className="flex-1 min-w-0 h-8" data-testid="focus-x" /></label>
        <label className="flex items-center gap-3 text-sm text-ink min-w-0"><span className="w-24 shrink-0">{t("عمودی")}</span><input type="range" min="0" max="100" value={f.y} onChange={(e) => move(f.x, Number(e.target.value))} dir="ltr" disabled={disabled} className="flex-1 min-w-0 h-8" data-testid="focus-y" /></label>
      </div>
      <p className="text-xs text-ink-muted mt-2 mb-1">{t("نمایش در کاشی‌های سایت:")}</p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-32 aspect-[4/3] overflow-hidden rounded-lg border border-line"><img src={src} alt="" className="w-full h-full object-cover" style={{ objectPosition: pos }} data-testid="focus-preview" /></div>
        <div className="w-40 aspect-[16/9] overflow-hidden rounded-lg border border-line"><img src={src} alt="" className="w-full h-full object-cover" style={{ objectPosition: pos }} /></div>
        <button type="button" onClick={() => onChange(null)} disabled={disabled || !value} className="btn-ghost size-sm" data-testid="focus-reset">{t("مرکز تصویر")}</button>
      </div>
    </div>
  );
}
