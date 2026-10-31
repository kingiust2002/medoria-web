"use client";
// BeautyViewTracker — bumps the product's popularity counter once per mount
// (client-side, so ISR-cached pages still count real views). Renders nothing.
import { useEffect } from "react";
import { recordBeautyProductView } from "@/lib/beauty/catalog";
import { usePreview } from "@/components/shared/PreviewContext";

export default function BeautyViewTracker({ id }) {
  const preview = usePreview();                       // a private preview of a draft is not a visit
  useEffect(() => {
    if (id && !preview) recordBeautyProductView(id);
  }, [id, preview]);
  return null;
}
