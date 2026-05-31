// components/home/StatsBar.jsx
"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { getTranslations } from "@/lib/i18n";
import Aurora from "@/components/shared/Aurora";

export default function StatsBar({ lang }) {
  const t = getTranslations(lang);
  const [productCount, setProductCount] = useState(null);

  useEffect(() => {
    supabase
      .from("products")
      .select("*", { count: "exact", head: true })
      .then(({ count }) => setProductCount(count));
  }, []);

  // Use real count if available, else show default
  const stats = [...t.home.stats];
  if (productCount !== null && productCount > 0) {
    stats[0] = [`${productCount}+`, t.home.stats[0][1]];
  }

  return (
    <section className="py-10 md:py-14 bg-canvas">
      <div className="container-x">
        <div className="relative bg-navy rounded-[2rem] px-6 py-9 md:px-12 md:py-12 grid grid-cols-2 md:grid-cols-4 gap-y-7 gap-x-4 overflow-hidden noise">
          <Aurora variant="dark" className="opacity-60" />
          {/* top gradient hairline */}
          <div className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />

          {stats.map(([val, label], i) => (
            <div key={i} className={`relative ${i < 3 ? "md:border-e md:border-white/10" : ""} md:px-4`}>
              <div className="text-4xl md:text-5xl font-display font-extrabold leading-none mb-2 gradient-text-animated tabular">
                {val}
              </div>
              <div className="text-[11px] md:text-[12px] font-medium text-white/60 tracking-wide">
                {label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
