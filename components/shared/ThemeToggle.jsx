// components/shared/ThemeToggle.jsx — light/dark switch (persists via next-themes).
"use client";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import Icon from "@/components/shared/Icon";

export default function ThemeToggle({ onDark = false, withLabel = false, lang = "en", className = "" }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === "dark";
  const toggle = () => setTheme(isDark ? "light" : "dark");

  const label = isDark
    ? (lang === "fa" ? "حالت روشن" : lang === "ru" ? "Светлая тема" : lang === "tg" ? "Равшан" : "Light mode")
    : (lang === "fa" ? "حالت تیره" : lang === "ru" ? "Тёмная тема" : lang === "tg" ? "Торик" : "Dark mode");

  const tone = onDark
    ? "border-white/15 text-white/80 hover:bg-white/10 hover:text-white"
    : "border-line text-ink-muted bg-surface hover:text-brand-violet hover:border-brand-violet/40";

  if (withLabel) {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-label={label}
        className={`inline-flex items-center gap-2.5 h-11 px-4 rounded-xl border transition-colors ${tone} ${className}`}
      >
        {mounted ? <Icon name={isDark ? "sun" : "moon"} size={17} /> : <span className="w-[17px] h-[17px]" />}
        <span className="text-[13px] font-semibold">{mounted ? label : ""}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className={`relative w-9 h-9 rounded-xl border flex items-center justify-center transition-all hover:scale-105 active:scale-95 ${tone} ${className}`}
    >
      {mounted ? (
        <Icon name={isDark ? "sun" : "moon"} size={16} />
      ) : (
        <span className="w-4 h-4" />
      )}
    </button>
  );
}
