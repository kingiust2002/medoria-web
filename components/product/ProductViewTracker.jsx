// components/product/ProductViewTracker.jsx
// Tiny client child for the (server-rendered) product page. On mount it records
// the view (popularity counter) and pushes the id to localStorage history.
"use client";
import { useEffect } from "react";
import { recordProductView } from "@/lib/supabase";
import { pushRecentlyViewed } from "@/lib/recentlyViewed";
import { usePreview } from "@/components/shared/PreviewContext";

export default function ProductViewTracker({ id }) {
  const preview = usePreview();                       // a private preview of a draft is not a visit
  useEffect(() => {
    if (id == null || preview) return;
    pushRecentlyViewed(id);
    recordProductView(id);
  }, [id, preview]);
  return null;
}
