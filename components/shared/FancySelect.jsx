// components/shared/FancySelect.jsx — accessible custom dropdown (replaces ugly native <select>).
"use client";
import { useState, useRef, useEffect } from "react";
import Icon from "./Icon";

export default function FancySelect({ value, onChange, options, className = "", ariaLabel }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const current = options.find((o) => String(o.value) === String(value)) || options[0];

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="w-full h-12 ps-4 pe-3 flex items-center justify-between gap-2 rounded-xl bg-surface border border-line text-sm text-ink hover:border-brand-violet/40 focus:outline-none focus:border-brand-violet/60 focus:ring-2 focus:ring-brand-violet/15 transition-colors"
      >
        <span className="truncate">{current?.label}</span>
        <Icon name="chevronDown" size={16} className={`shrink-0 text-ink-faint transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div role="listbox" className="absolute z-40 mt-2 w-full min-w-[180px] end-0 rounded-xl border border-line bg-surface shadow-hover p-1.5 animate-fade-up max-h-72 overflow-auto">
          {options.map((o) => {
            const sel = String(o.value) === String(value);
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={sel}
                onClick={() => { onChange(o.value); setOpen(false); }}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-[13px] text-start transition-colors ${sel ? "bg-brand-violet/10 text-brand-violet font-semibold" : "text-ink-soft hover:bg-line-soft"}`}
              >
                <span className="truncate">{o.label}</span>
                {sel && <Icon name="check" size={15} className="shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
