// components/home/StatsBar.jsx
"use client";

import { useEffect, useState } from "react";
import { getTranslations } from "@/lib/i18n";
import { getCategories } from "@/lib/supabase";
import { buildHealthCategoryTree } from "@/lib/health/categories";
import Aurora from "@/components/shared/Aurora";
import CountUp from "@/components/shared/CountUp";

export default function StatsBar({ lang }) {
  const t = getTranslations(lang);
  const [rootCount, setRootCount] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getCategories().then((rows) => {
      if (!cancelled) setRootCount(buildHealthCategoryTree(rows, { activeOnly: true }).length);
    });
    return () => { cancelled = true; };
  }, []);

  const stats = [...t.home.stats];
  if (stats[0] && rootCount != null) stats[0] = [String(rootCount), stats[0][1]];
  if (stats[2]) stats[2] = ["3", stats[2][1]];

  return (
    <section className="py-10 md:py-14 bg-canvas">
      <div className="container-x">
        <div className="relative bg-navy rounded-[2rem] px-6 py-9 md:px-12 md:py-12 grid grid-cols-2 md:grid-cols-4 gap-y-7 gap-x-4 overflow-hidden noise">
          <Aurora variant="dark" className="opacity-60" />
          <div className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />
          {stats.map(([value, label], index) => (
            <div key={index} className={`relative ${index < 3 ? "md:border-e md:border-white/10" : ""} md:px-4`}>
              <div className="text-4xl md:text-5xl font-display font-extrabold leading-none mb-2 gradient-text-animated tabular"><CountUp value={value} /></div>
              <div className="text-[11px] md:text-[12px] font-medium text-white/60 tracking-wide">{label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
