// app/page.jsx — Reads localStorage and redirects to the user's saved language
"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LOCALES, DEFAULT_LOCALE } from "@/lib/i18n";

export default function Root() {
  const router = useRouter();

  useEffect(() => {
    let lang = DEFAULT_LOCALE;
    try {
      const saved = localStorage.getItem("lang");
      if (saved && LOCALES.includes(saved)) {
        lang = saved;
      } else {
        // Detect browser language
        const browser = (navigator.language || "").slice(0, 2);
        if (LOCALES.includes(browser)) lang = browser;
      }
    } catch {}
    router.replace(`/${lang}`);
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas-soft">
      <div className="text-center">
        <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-brand-gradient animate-pulse" />
        <p className="text-sm text-ink-muted">Medoria</p>
      </div>
    </div>
  );
}
