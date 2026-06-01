"use client";
import { useRef, useState } from "react";
import Icon from "@/components/shared/Icon";
import { imageUrl } from "@/lib/supabase";
import { uploadProductImage } from "@/lib/operator/actions";
import { Spinner } from "@/components/operator/ui";

const MAX = 5 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];

export default function ImageUploader({ value, onChange }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const preview = value ? imageUrl(value) : null;

  async function handleFile(file) {
    setErr("");
    if (!file) return;
    if (!TYPES.includes(file.type)) { setErr("فقط JPG / PNG / WEBP / AVIF مجاز است."); return; }
    if (file.size > MAX) { setErr("حداکثر حجم ۵ مگابایت است."); return; }
    setBusy(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await uploadProductImage(fd);
    setBusy(false);
    if (res.ok) onChange(res.path);
    else setErr(res.error || "آپلود ناموفق بود.");
  }

  return (
    <div className="flex items-start gap-4">
      <div className="img-ph relative w-28 h-28 rounded-xl overflow-hidden grid place-items-center text-ink-faint shrink-0 border border-line">
        {preview ? <img src={preview} alt="" className="w-full h-full object-cover" /> : <Icon name="image" size={26} />}
        {busy && <div className="absolute inset-0 grid place-items-center bg-surface/70 text-brand-violet"><Spinner size={22} /></div>}
      </div>
      <div className="flex-1 min-w-0">
        <input ref={inputRef} type="file" accept={TYPES.join(",")} className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className="btn-ghost size-sm">
            <Icon name="upload" size={16} /> {preview ? "تعویض تصویر" : "آپلود تصویر"}
          </button>
          {value && (
            <button type="button" onClick={() => onChange("")} className="btn-ghost size-sm !text-warn hover:!border-warn/40">
              <Icon name="trash" size={16} /> حذف
            </button>
          )}
        </div>
        <p className="text-[11px] text-ink-faint mt-2.5">یا آدرس مستقیم تصویر را وارد کنید:</p>
        <input value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder="https://…" dir="ltr" className="input w-full mt-1.5 text-xs" />
        {err && <p className="text-[11px] text-warn mt-1.5">{err}</p>}
      </div>
    </div>
  );
}
