"use client";
// BeautyViewTracker — bumps the product's popularity counter once per mount
// (client-side, so ISR-cached pages still count real views). Renders nothing.
import { useEffect } from "react";
import { recordBeautyProductView } from "@/lib/beauty/catalog";

export default function BeautyViewTracker({ id }) {
  useEffect(() => {
    if (id) recordBeautyProductView(id);
  }, [id]);
  return null;
}
