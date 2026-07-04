"use client";
// components/beauty/BeautyHeader.jsx — slim glass header for the Beauty world.
import { useEffect, useState } from "react";
import Link from "next/link";
import BeautyMark from "./BeautyMark";
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
        <Link href={`/beauty/${lang}`} aria-label="Medoria Beauty" className="v-focus flex items-center gap-2.5">
          <BeautyMark size={30} />
          <span className="font-beauty text-[19px] leading-none tracking-tight">
            <span style={{ color: "var(--v-navy)" }} className="font-bold">Medoria</span>
            <span style={{ color: "var(--v-accent)" }} className="ms-1.5 italic">Beauty</span>
          </span>
        </Link>
        <nav className="flex items-center gap-2.5">
          <Link
            href={`/health/${lang}`}
            className="v-focus hidden rounded-full px-3.5 py-1.5 text-[12px] font-semibold sm:block"
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
