"use client";
// components/beauty/BeautyHeader.jsx — slim glass header, official brand lockup.
import { useEffect, useState } from "react";
import Link from "next/link";
import { BeautyWordLockup } from "./BeautyBrand";
import LanguageSwitcher from "@/components/layout/LanguageSwitcher";
import { beautyCopy } from "./copy";

export default function BeautyHeader({ lang }) {
  const t = beautyCopy(lang);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 24);
    fn();
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  return (
    <header
      className={[
        "fixed inset-x-0 top-0 z-[60] transition-all duration-500",
        scrolled ? "v-glass shadow-soft" : "bg-transparent border-transparent",
      ].join(" ")}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Link href={`/beauty/${lang}`} className="v-focus rounded-md" aria-label="Medoria Beauty">
          <BeautyWordLockup height={22} />
        </Link>
        <nav className="flex items-center gap-2.5" aria-label="Beauty">
          <Link
            href={`/health/${lang}`}
            className="v-focus hidden rounded-full px-3.5 py-2 text-[12px] font-semibold sm:block"
            style={{ color: "rgb(var(--v-ink-muted))", border: "1px solid rgb(var(--v-line))" }}
          >
            {t.nav.health}
          </Link>
          <LanguageSwitcher lang={lang} variant="dropdown" />
        </nav>
      </div>
    </header>
  );
}
