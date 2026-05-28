// components/layout/LanguageSwitcher.jsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LANG_META, LOCALES } from "@/lib/i18n";

export default function LanguageSwitcher({ lang, white = false }) {
  const pathname = usePathname() || "/";

  const buildHref = (newLang) => {
    const parts = pathname.split("/");
    if (LOCALES.includes(parts[1])) parts[1] = newLang;
    else parts.splice(1, 0, newLang);
    return parts.join("/") || `/${newLang}`;
  };

  const handleClick = (code) => {
    try { localStorage.setItem("lang", code); } catch {}
  };

  return (
    <div className="flex items-center gap-1">
      {LOCALES.map((code) => {
        const active = lang === code;
        return (
          <Link
            key={code}
            href={buildHref(code)}
            onClick={() => handleClick(code)}
            className={[
              "px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors",
              active
                ? white
                  ? "bg-white/15 text-white border border-white/25"
                  : "bg-primary/10 text-primary border border-primary/20"
                : white
                  ? "text-white/45 hover:text-white border border-transparent"
                  : "text-ink-faint hover:text-primary border border-transparent",
            ].join(" ")}
          >
            {LANG_META[code].label}
          </Link>
        );
      })}
    </div>
  );
}
