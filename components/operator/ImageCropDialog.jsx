"use client";
// Crop an image BEFORE it is uploaded (N7). Works on the person's own device: the chosen file is drawn into a canvas at the chosen frame and handed back
// as a new File — which also drops everything hidden in the original (GPS position, camera, comments). Every control is a plain slider or button
// (keyboard and touch friendly, no dragging needed), the preview is exactly the frame that will be uploaded, and "use the original" skips the crop.
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "@/components/shared/Icon";
import { Spinner } from "@/components/operator/ui";
import { useT } from "@/components/panel/PanelI18n";
import { cropRect } from "@/lib/imageCrop";

export const CROP_ASPECTS = [
  { key: "4:3", w: 4, h: 3 }, { key: "16:9", w: 16, h: 9 }, { key: "1:1", w: 1, h: 1 }, { key: "3:4", w: 3, h: 4 },
];
const OUT_TYPES = ["image/jpeg", "image/png", "image/webp"];

export default function ImageCropDialog({ file, aspects = CROP_ASPECTS, defaultAspect = "4:3", maxOut = 1600, title, onCancel, onDone }) {
  const t = useT();
  const [src, setSrc] = useState(null);
  const [size, setSize] = useState(null);
  const [aspect, setAspect] = useState(aspects.find((a) => a.key === defaultAspect)?.key || aspects[0].key);
  const [zoom, setZoom] = useState(1);
  const [cx, setCx] = useState(50);
  const [cy, setCy] = useState(50);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const imgRef = useRef(null);
  const closeRef = useRef(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => { closeRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const a = aspects.find((x) => x.key === aspect) || aspects[0];
  const r = a.w / a.h;
  const rect = useMemo(() => (size ? cropRect(size.w, size.h, r, zoom, cx, cy) : null), [size, r, zoom, cx, cy]);

  async function crop() {
    if (!rect || !imgRef.current) return;
    setBusy(true); setErr("");
    try {
      const W = Math.max(1, Math.round(Math.min(rect.cw, maxOut)));
      const H = Math.max(1, Math.round(W / r));
      const canvas = document.createElement("canvas");
      canvas.width = W; canvas.height = H;
      canvas.getContext("2d").drawImage(imgRef.current, rect.left, rect.top, rect.cw, rect.ch, 0, 0, W, H);
      const type = OUT_TYPES.includes(file.type) ? file.type : "image/jpeg";
      const blob = await new Promise((res) => canvas.toBlob(res, type, 0.9));
      if (!blob) throw new Error("no blob");
      const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
      onDone(new File([blob], `${(file.name || "image").replace(/\.[^.]+$/, "")}-crop.${ext}`, { type }));
    } catch {
      setErr(t("بریدن تصویر ناموفق بود. تصویر اصلی را بدون برش بفرستید."));
      setBusy(false);
    }
  }

  const slider = (id, label, value, set, min, max, step = 1) => (
    <label className="flex items-center gap-3 text-sm text-ink min-w-0" htmlFor={id}>
      <span className="w-24 shrink-0">{label}</span>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => set(Number(e.target.value))} dir="ltr" className="flex-1 min-w-0 h-8" disabled={busy} />
    </label>
  );

  // rendered on <body>: a dialog inside another dialog's animated card would be positioned against that card, not the screen
  const [host, setHost] = useState(null);
  useEffect(() => { setHost(document.body); }, []);
  if (!host) return null;
  return createPortal(
    <div className="fixed inset-0 z-[60] grid place-items-center p-3" role="dialog" aria-modal="true" aria-label={title || t("برش تصویر")} data-testid="crop-dialog">
      <div className="absolute inset-0 bg-navy/50 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative card w-full max-w-lg max-h-[94vh] overflow-auto p-4 sm:p-5 min-w-0">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="font-bold text-ink">{title || t("برش تصویر")}</h2>
          <button ref={closeRef} type="button" onClick={onCancel} aria-label={t("بستن")} className="grid place-items-center w-9 h-9 rounded-lg hover:bg-line-soft text-ink-muted"><Icon name="close" size={18} /></button>
        </div>
        {/* the frame: exactly what will be uploaded */}
        <div className="relative w-full overflow-hidden rounded-xl bg-line-soft border border-line" style={{ aspectRatio: String(r) }} data-testid="crop-frame">
          {src && (
            <img
              ref={imgRef} src={src} alt="" draggable={false}
              onLoad={(e) => setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
              style={rect ? { position: "absolute", maxWidth: "none", width: `${(size.w / rect.cw) * 100}%`, left: `${-(rect.left / rect.cw) * 100}%`, top: `${-(rect.top / rect.ch) * 100}%` } : { visibility: "hidden" }}
            />
          )}
        </div>
        <div className="flex flex-wrap gap-1.5 mt-3" role="group" aria-label={t("نسبت قاب")}>
          {aspects.map((x) => (
            <button key={x.key} type="button" onClick={() => setAspect(x.key)} aria-pressed={x.key === aspect} data-testid={`crop-aspect-${x.key.replace(":", "x")}`}
              className={`pill !text-xs font-semibold min-h-9 px-3 ${x.key === aspect ? "bg-brand-violet text-white" : "bg-line-soft text-ink-muted"}`} dir="ltr">{x.key}</button>
          ))}
        </div>
        <div className="mt-3 flex flex-col gap-1">
          {slider("crop-zoom", t("بزرگ‌نمایی"), zoom, setZoom, 1, 4, 0.05)}
          {slider("crop-x", t("جابه‌جایی افقی"), cx, setCx, 0, 100)}
          {slider("crop-y", t("جابه‌جایی عمودی"), cy, setCy, 0, 100)}
        </div>
        {err && <p role="alert" className="mt-3 text-sm text-warn break-words">{err}</p>}
        <div className="flex flex-wrap gap-2 mt-4">
          <button type="button" onClick={crop} disabled={busy || !rect} className="btn-primary size-md disabled:opacity-60" data-testid="crop-apply">{busy ? <Spinner /> : <Icon name="check" size={16} />} {t("برش و آپلود")}</button>
          <button type="button" onClick={() => onDone(file)} disabled={busy} className="btn-ghost size-md" data-testid="crop-skip">{t("آپلود تصویر اصلی (بدون برش)")}</button>
          <button type="button" onClick={onCancel} disabled={busy} className="btn-ghost size-md">{t("انصراف")}</button>
        </div>
        <p className="mt-3 text-[11px] text-ink-faint leading-relaxed">{t("اطلاعات پنهان عکس (مثل مکان و دوربین) پیش از انتشار حذف می‌شود.")}</p>
      </div>
    </div>,
    host
  );
}
