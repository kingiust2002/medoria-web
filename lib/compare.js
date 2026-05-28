// lib/compare.js
"use client";
import { useState, useEffect, useCallback } from "react";

const KEY = "medoria.compare.v1";
const MAX = 4;

function read() {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function write(arr) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(arr));
  window.dispatchEvent(new CustomEvent("compare:change"));
}

export function useCompare() {
  const [ids, setIds] = useState([]);

  useEffect(() => {
    setIds(read());
    const onChange = () => setIds(read());
    window.addEventListener("compare:change", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("compare:change", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  const has = useCallback((id) => ids.includes(id), [ids]);

  const toggle = useCallback((id) => {
    const current = read();
    if (current.includes(id)) {
      write(current.filter((x) => x !== id));
    } else if (current.length < MAX) {
      write([...current, id]);
    } else {
      // Replace oldest
      write([...current.slice(1), id]);
    }
  }, []);

  const remove = useCallback((id) => {
    write(read().filter((x) => x !== id));
  }, []);

  const clear = useCallback(() => write([]), []);

  return { ids, count: ids.length, has, toggle, remove, clear, max: MAX };
}
