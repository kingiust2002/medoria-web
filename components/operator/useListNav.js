"use client";
// Navigation of a server-paged list: the whole state of the list (page, size, text, filters, sort) lives in the address, so every change is a
// navigation. A text box is debounced; a page change pushes a history entry, a filter change replaces the current one.
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function useListNav(basePath, hrefFn, params) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const href = (change, resetPage) => hrefFn(basePath, params, change, resetPage);
  const go = (change, { replace = true, resetPage = true } = {}) => start(() => { const h = href(change, resetPage); if (replace) router.replace(h); else router.push(h); });
  return { go, href, pending };
}

// A search box whose text goes into the address 350 ms after the last key; the box follows the address when it changes from outside.
export function useDebouncedQuery(value, onCommit, delay = 350) {
  const [text, setText] = useState(value);
  const timer = useRef(null);
  const last = useRef(value);
  useEffect(() => { if (value !== last.current) { last.current = value; setText(value); } }, [value]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const change = (next) => {
    setText(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { last.current = next.trim(); onCommit(next.trim()); }, delay);
  };
  const commitNow = () => { clearTimeout(timer.current); last.current = text.trim(); onCommit(text.trim()); };
  return { text, change, commitNow };
}
