// lib/useIdleLogout.js — client-only inactivity auto-logout for the operator
// panels. "Working" is defined narrowly as clicking or typing (per the
// owner's request) — mouse movement/scrolling don't count, so a panel left
// open on a screen without input still logs out on schedule. Resets on any
// click or keydown anywhere in the panel; fires `onIdle` once the timeout
// elapses with no activity.
"use client";
import { useEffect, useRef } from "react";

export const IDLE_LOGOUT_MS = 20 * 60 * 1000; // 20 minutes of no click/keypress

export function useIdleLogout(onIdle, timeoutMs = IDLE_LOGOUT_MS) {
  const timer = useRef(null);
  const onIdleRef = useRef(onIdle);
  onIdleRef.current = onIdle;

  useEffect(() => {
    function reset() {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => onIdleRef.current(), timeoutMs);
    }
    reset();
    window.addEventListener("click", reset);
    window.addEventListener("keydown", reset);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      window.removeEventListener("click", reset);
      window.removeEventListener("keydown", reset);
    };
  }, [timeoutMs]);
}
