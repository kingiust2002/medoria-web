"use client";
// The picture of a category, shared by both panels (N7): choose a file → crop it → upload (checked and cleaned on the server) → choose the focus point.
// Removing the picture never deletes the file (it may be used elsewhere); the media library removes unused files. Each panel passes its own upload action.
import { useRef, useState } from "react";
import Icon from "@/components/shared/Icon";
import { Spinner } from "@/components/operator/ui";
import { useT } from "@/components/panel/PanelI18n";
import ImageCropDialog from "@/components/operator/ImageCropDialog";
import FocusPicker from "@/components/operator/FocusPicker";

const TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];
const MAX = 5 * 1024 * 1024;

export default function CategoryImageField({ value, focus, focusAvailable, srcOf, upload, onChange, onError }) {
  const t = useT();
  const input = useRef(null);
  const [pending, setPending] = useState(null);          // the file waiting in the crop dialog
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const src = value ? srcOf(value) : null;
  const fail = (m) => { setErr(m); onError?.(m); };

  function pick(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    setErr("");
    if (!file) return;
    if (!TYPES.includes(file.type)) return fail(t("فقط JPG / PNG / WEBP / AVIF مجاز است."));
    if (file.size > MAX) return fail(t("حداکثر حجم ۵ مگابایت است."));
    setPending(file);
  }
  async function send(file) {
    setPending(null);
    setBusy(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await upload(fd).catch(() => null);
    setBusy(false);
    if (res?.ok) onChange({ image_url: res.path, focus: null });
    else fail(t(res?.error) || t("آپلود ناموفق بود."));
  }

  return (
    <div className="min-w-0" data-testid="category-image-field">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="relative w-20 h-20 rounded-xl overflow-hidden bg-line-soft grid place-items-center shrink-0 border border-line">
          {src ? <img src={src} alt="" className="w-full h-full object-cover" style={focus ? { objectPosition: `${focus.x}% ${focus.y}%` } : undefined} /> : <Icon name="image" size={22} className="text-ink-faint" />}
          {busy && <span className="absolute inset-0 grid place-items-center bg-surface/70 text-brand-violet"><Spinner size={20} /></span>}
        </span>
        <div className="flex flex-wrap gap-2 min-w-0">
          <input ref={input} type="file" accept={TYPES.join(",")} className="hidden" onChange={pick} data-testid="category-image-input" />
          <button type="button" onClick={() => input.current?.click()} disabled={busy} className="btn-ghost size-sm !h-auto min-h-9 py-1.5 whitespace-normal text-start"><Icon name="upload" size={15} /> {src ? t("تعویض تصویر") : t("آپلود تصویر")}</button>
          {value && <button type="button" onClick={() => onChange({ image_url: "", focus: null })} disabled={busy} className="btn-ghost size-sm !h-auto min-h-9 py-1.5 !text-warn" data-testid="category-image-remove"><Icon name="trash" size={15} /> {t("برداشتن تصویر")}</button>}
        </div>
      </div>
      {value && <p className="text-[11px] text-ink-faint mt-1.5 leading-relaxed">{t("برداشتن تصویر فایل را پاک نمی‌کند؛ فایل‌های بی‌استفاده را از «تصاویر» حذف کنید.")}</p>}
      {src && focusAvailable && <div className="mt-3"><FocusPicker src={src} value={focus} onChange={(f) => onChange({ image_url: value, focus: f })} disabled={busy} /></div>}
      {src && !focusAvailable && <p className="text-[11px] text-ink-faint mt-2" data-testid="focus-unavailable">{t("انتخاب نقطهٔ تمرکز تصویر پس از اجرای مایگریشن ۴۷ فعال می‌شود.")}</p>}
      {err && <p role="alert" className="text-[11px] text-warn mt-1.5 break-words">{err}</p>}
      {pending && <ImageCropDialog file={pending} onCancel={() => setPending(null)} onDone={send} title={t("برش تصویر دسته")} />}
    </div>
  );
}
