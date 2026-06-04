// lib/wishlist.js
// Client-side wishlist (favourites). localStorage-backed, no account needed.
// Mirrors lib/compare.js and syncs across components via a custom event.
"use client";
import { useState, useEffect, useCallback } from "react";

const KEY = "medoria.wishlist.v1";

function read() {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function write(arr) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(arr));
  window.dispatchEvent(new CustomEvent("wishlist:change"));
}

export function useWishlist() {
  const [ids, setIds] = useState([]);

  useEffect(() => {
    setIds(read());
    const on = () => setIds(read());
    window.addEventListener("wishlist:change", on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener("wishlist:change", on);
      window.removeEventListener("storage", on);
    };
  }, []);

  const has = useCallback((id) => ids.includes(id), [ids]);
  const toggle = useCallback((id) => {
    const cur = read();
    write(cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
  }, []);
  const remove = useCallback((id) => write(read().filter((x) => x !== id)), []);
  const clear = useCallback(() => write([]), []);

  return { ids, count: ids.length, has, toggle, remove, clear };
}
