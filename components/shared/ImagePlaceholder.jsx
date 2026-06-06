// components/shared/ImagePlaceholder.jsx
// Elegant, brand-tinted slot that marks exactly where a real photo goes.
// Drop a file at `src` and it appears automatically; until then (or if the file
// is missing / 404s) a premium gradient placeholder is shown instead of a
// broken-image icon. This is what makes the image strategy "drop-in".
"use client";
import { useState } from "react";
import Image from "next/image";
import Icon from "@/components/shared/Icon";

export default function ImagePlaceholder({
  src,
  srcDark,
  alt = "",
  icon = "image",
  label,
  className = "",
  rounded = "rounded-3xl",
  showHint = true,
}) {
  const [failed, setFailed] = useState(false);
  const showImg = src && !failed;

  return (
    <div className={`relative overflow-hidden ${rounded} ${className}`}>
      {showImg ? (
        <>
          <Image
            src={src}
            alt={alt}
            fill
            sizes="(max-width: 768px) 100vw, 50vw"
            onError={() => setFailed(true)}
            className={`object-cover ${srcDark ? "dark:hidden" : ""}`}
          />
          {srcDark && (
            <Image
              src={srcDark}
              alt={alt}
              fill
              sizes="(max-width: 768px) 100vw, 50vw"
              onError={() => setFailed(true)}
              className="object-cover hidden dark:block"
            />
          )}
        </>
      ) : (
        <div className="img-ph noise group absolute inset-0 flex flex-col items-center justify-center text-center border border-white/60">
          {/* dotted frame */}
          <div className="absolute inset-3 rounded-[inherit] border-2 border-dashed border-brand-violet/15 pointer-events-none" />

          <div className="relative w-14 h-14 rounded-2xl bg-surface/70 backdrop-blur flex items-center justify-center shadow-soft mb-3 transition-transform duration-300 group-hover:scale-105">
            <span className="absolute inset-0 rounded-2xl bg-brand-gradient opacity-15" />
            <Icon name={icon} size={26} className="relative text-brand-violet" strokeWidth={1.6} />
          </div>

          {label && (
            <div className="relative text-[12px] font-semibold text-ink/70 px-4 leading-tight">{label}</div>
          )}
          {showHint && (
            <div className="relative mt-1 text-[10px] font-medium tracking-wide text-ink-faint uppercase">
              Image slot
            </div>
          )}
        </div>
      )}
    </div>
  );
}
