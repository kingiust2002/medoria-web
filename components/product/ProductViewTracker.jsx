// components/product/ProductViewTracker.jsx
// Tiny client child for the (server-rendered) product page. On mount it records
// the view (popularity counter) and pushes the id to localStorage history.
"use client";
import { useEffect } from "react";
import { recordProductView } from "@/lib/supabase";
import { pushRecentlyViewed } from "@/lib/recentlyViewed";

export default function ProductViewTracker({ id }) {
  useEffect(() => {
    if (id == null) return;
    pushRecentlyViewed(id);
    recordProductView(id);
  }, [id]);
  return null;
}
