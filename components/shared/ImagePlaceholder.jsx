// components/shared/ImagePlaceholder.jsx
// Elegant, brand-tinted placeholder that marks exactly where a real photo goes.
// Renders the real <img> the moment a `src` is provided, so dropping in
// production photography later is a one-prop change.

import Icon from "@/components/shared/Icon";

export default function ImagePlaceholder({
  src,
  alt = "",
  icon = "image",
  label,
  className = "",
  rounded = "rounded-3xl",
  showHint = true,
}) {
  if (src) {
    return (
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className={`object-cover w-full h-full ${rounded} ${className}`}
      />
    );
  }

  return (
    <div className={`img-ph noise group flex flex-col items-center justify-center text-center ${rounded} border border-white/60 shadow-soft ${className}`}>
      {/* dotted frame */}
      <div className="absolute inset-3 rounded-[inherit] border-2 border-dashed border-brand-violet/15 pointer-events-none" />

      <div className="relative w-14 h-14 rounded-2xl bg-white/70 backdrop-blur flex items-center justify-center shadow-soft mb-3 transition-transform duration-300 group-hover:scale-105">
        <span className="absolute inset-0 rounded-2xl bg-brand-gradient opacity-15" />
        <Icon name={icon} size={26} className="relative text-brand-violet" strokeWidth={1.6} />
      </div>

      {label && (
        <div className="relative text-[12px] font-semibold text-ink/70 px-4 leading-tight">{label}</div>
      )}
      {showHint && (
        <div className="relative mt-1 text-[10px] font-medium tracking-wide text-ink-faint uppercase">
          {label ? "" : "Image"} · جای عکس
        </div>
      )}
    </div>
  );
}
