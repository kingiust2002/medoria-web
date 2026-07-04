// components/beauty/MediaSlot.jsx — production-ready campaign image slot.
// Given a real `src` (resolved server-side from /public/beauty) it renders a
// properly sized next/image; otherwise an elegant satin fallback with the
// official mark as a quiet watermark — never a broken-image state.
import Image from "next/image";
import { BeautyMarkImg } from "./BeautyBrand";

export default function MediaSlot({
  src,
  alt = "",
  sizes = "100vw",
  priority = false,
  objectPosition = "50% 50%",
  markSize = 88,
  className = "",
}) {
  return (
    <div className={`v-satin relative overflow-hidden ${className}`}>
      {src ? (
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          priority={priority}
          className="object-cover"
          style={{ objectPosition }}
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center">
          <BeautyMarkImg size={markSize} opacity={0.14} />
        </div>
      )}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{ background: "linear-gradient(90deg, transparent, var(--v-sheen), transparent)" }}
      />
    </div>
  );
}
