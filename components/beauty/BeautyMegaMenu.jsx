"use client";
// components/beauty/BeautyMegaMenu.jsx
// The Beauty "World" browse dropdown for the desktop top bar — a luxury mega-menu
// over the 3-level category tree (migration 12). Right rail = departments; hover
// a department to reveal its groups + subgroups on the left. Every category is a
// real <Link> in the SSR HTML (crawlable, works before hydration); the panel is
// just shown/hidden on hover/focus. RTL-aware via logical properties.
import { useMemo, useRef, useState } from "react";
import Link from "next/link";

const nameOf = (c, lang) => c?.[`name_${lang}`] || c?.name_en || c?.name_tg || c?.name_fa || c?.slug || "";

export default function BeautyMegaMenu({ tree = [], lang, home, label, active, allLabel, viewAllLabel }) {
  const depts = tree;
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState(depts[0]?.id ?? null);
  const closeTimer = useRef(null);

  const openNow = () => { clearTimeout(closeTimer.current); setOpen(true); };
  const closeSoon = () => { closeTimer.current = setTimeout(() => setOpen(false), 140); };

  const activeDept = useMemo(() => depts.find((d) => d.id === activeId) || depts[0], [depts, activeId]);
  const catHref = (slug) => `${home}/catalog?cat=${encodeURIComponent(slug)}`;

  // If the dropdown has no data yet (migration not run), fall back to a plain link.
  if (!depts.length) {
    return (
      <Link href={`${home}/worlds`} className={navLinkClass(active)}>
        {label}
        <Underline active={active} />
      </Link>
    );
  }

  const grouped = (activeDept?.children || []).some((c) => c.children?.length);

  return (
    <div className="relative" onMouseEnter={openNow} onMouseLeave={closeSoon}>
      <Link
        href={`${home}/worlds`}
        aria-haspopup="true" aria-expanded={open}
        onFocus={openNow} onBlur={closeSoon}
        className={navLinkClass(active)}
      >
        {label}
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" className={`transition-transform ${open ? "rotate-180" : ""}`} aria-hidden>
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <Underline active={active} />
      </Link>

      {/* Panel */}
      <div
        className={[
          "absolute top-full mt-2 z-[70] transition-all duration-200 origin-top",
          open ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 -translate-y-1 pointer-events-none",
        ].join(" ")}
        style={{ insetInlineStart: "50%", transform: open ? "translateX(50%)" : "translateX(50%) translateY(-4px)" }}
      >
        <div className="w-[min(52rem,90vw)] rounded-2xl border border-line bg-canvas/95 backdrop-blur-xl shadow-2xl overflow-hidden"
          style={{ boxShadow: "0 24px 60px -20px rgba(20,20,46,.35)" }}>
          <div className="grid grid-cols-[13rem_1fr]">
            {/* Right rail — departments (RTL puts this visually on the right) */}
            <ul className="border-e border-line bg-surface/60 py-2 max-h-[70vh] overflow-y-auto">
              {depts.map((d) => {
                const on = d.id === activeDept?.id;
                return (
                  <li key={d.id}>
                    <Link
                      href={catHref(d.slug)}
                      onMouseEnter={() => setActiveId(d.id)}
                      onFocus={() => setActiveId(d.id)}
                      className={[
                        "flex items-center gap-2 px-4 py-2.5 text-[13.5px] transition-colors",
                        on ? "bg-canvas text-[color:var(--v-accent)] font-semibold" : "text-ink-soft hover:text-ink",
                      ].join(" ")}
                    >
                      <span className="truncate flex-1">{nameOf(d, lang)}</span>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="shrink-0 rtl:rotate-180 opacity-60" aria-hidden>
                        <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </Link>
                  </li>
                );
              })}
            </ul>

            {/* Active department content */}
            <div className="p-5 max-h-[70vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[15px] font-bold text-ink">{nameOf(activeDept, lang)}</h3>
                <Link href={catHref(activeDept.slug)} className="text-[12px] font-semibold text-[color:var(--v-accent)] hover:opacity-80">
                  {allLabel} ←
                </Link>
              </div>

              {grouped ? (
                <div className="columns-2 lg:columns-3 gap-5 [column-fill:balance]">
                  {(activeDept.children || []).map((g) => (
                    <div key={g.id} className="break-inside-avoid mb-4">
                      <Link href={catHref(g.slug)} className="block text-[13px] font-semibold text-ink hover:text-[color:var(--v-accent)] mb-1.5">
                        {nameOf(g, lang)}
                      </Link>
                      {g.children?.length > 0 && (
                        <ul className="space-y-1">
                          {g.children.map((leaf) => (
                            <li key={leaf.id}>
                              <Link href={catHref(leaf.slug)} className="block text-[12.5px] text-ink-muted hover:text-ink transition-colors truncate">
                                {nameOf(leaf, lang)}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-5 gap-y-1.5">
                  {(activeDept.children || []).map((leaf) => (
                    <Link key={leaf.id} href={catHref(leaf.slug)} className="block text-[12.5px] text-ink-muted hover:text-ink transition-colors truncate py-0.5">
                      {nameOf(leaf, lang)}
                    </Link>
                  ))}
                </div>
              )}

              <div className="mt-4 pt-3 border-t border-line">
                <Link href={`${home}/worlds`} className="text-[12.5px] font-semibold text-ink-soft hover:text-[color:var(--v-accent)]">
                  {viewAllLabel} →
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function navLinkClass(active) {
  return [
    "group relative inline-flex items-center gap-1 px-4 py-2.5 text-[14px] font-medium rounded-lg transition-colors",
    active ? "text-[color:var(--v-accent)]" : "text-ink-muted hover:text-[color:var(--v-accent)]",
  ].join(" ");
}

function Underline({ active }) {
  return (
    <span className={[
      "pointer-events-none absolute inset-x-3 bottom-1 h-[2px] rounded-full origin-center transition-transform duration-300",
      active ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100",
    ].join(" ")} style={{ background: "linear-gradient(90deg,var(--v-navy),var(--v-copper))" }} />
  );
}
