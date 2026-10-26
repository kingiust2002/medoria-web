// lib/inquiryList.js — the visitor's inquiry list (several products, one request).
// localStorage-backed, no account; same shape as lib/wishlist.js and lib/compare.js, kept per house
// (Health and Beauty lists never mix). Holds only { id, qty }: names and prices are read again from the
// database when the list is shown or sent, and the server takes names/SKUs from its own tables.
"use client";
import { useState, useEffect, useCallback } from "react";

export const MAX_LIST = 30;
const MAX_QTY = 1_000_000;
const keyFor = (house) => `medoria.inquiry.${house}.v1`;
const EVENT = "inquiry:change";

const clampQty = (q) => { const n = Math.round(Number(q)); return Number.isFinite(n) && n >= 1 ? Math.min(n, MAX_QTY) : 1; };

function read(house) {
  if (typeof window === "undefined") return [];
  try {
    const arr = JSON.parse(localStorage.getItem(keyFor(house)) || "[]");
    if (!Array.isArray(arr)) return [];
    const seen = new Set();
    return arr
      .filter((x) => x && Number.isSafeInteger(Number(x.id)) && Number(x.id) > 0 && !seen.has(Number(x.id)) && seen.add(Number(x.id)))
      .map((x) => ({ id: Number(x.id), qty: clampQty(x.qty) }))
      .slice(0, MAX_LIST);
  } catch { return []; }
}

function write(house, items) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(keyFor(house), JSON.stringify(items)); } catch { /* private mode: the list lives for this page only */ }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: house }));
}

export function useInquiryList(house = "health") {
  const [items, setItems] = useState([]);

  useEffect(() => {
    setItems(read(house));
    const on = () => setItems(read(house));
    window.addEventListener(EVENT, on);
    window.addEventListener("storage", on);
    return () => { window.removeEventListener(EVENT, on); window.removeEventListener("storage", on); };
  }, [house]);

  const has = useCallback((id) => items.some((x) => x.id === Number(id)), [items]);
  // add() returns false when the list is full.
  const add = useCallback((id, qty = 1) => {
    const cur = read(house);
    const n = Number(id);
    if (cur.some((x) => x.id === n)) return true;
    if (cur.length >= MAX_LIST) return false;
    write(house, [...cur, { id: n, qty: clampQty(qty) }]);
    return true;
  }, [house]);
  const remove = useCallback((id) => write(house, read(house).filter((x) => x.id !== Number(id))), [house]);
  const setQty = useCallback((id, qty) => write(house, read(house).map((x) => (x.id === Number(id) ? { ...x, qty: clampQty(qty) } : x))), [house]);
  const clear = useCallback(() => write(house, []), [house]);

  return { items, count: items.length, has, add, remove, setQty, clear };
}
