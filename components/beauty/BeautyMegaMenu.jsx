"use client";
// components/beauty/BeautyMegaMenu.jsx
// The Beauty "World" browse dropdown for the desktop top bar — a progressive,
// cascading drill-down over the 3-level category tree (migration 12):
//   column 1 = departments → hover one → column 2 = its groups → hover one →
//   column 3 = that group's subgroups. Only one narrow column per level opens
//   at a time (no giant scrolling panel, never overflows the viewport). Every
//   category is a real <Link> in the SSR HTML (crawlable, works pre-hydrate).
import { useMemo, useRef, useState } from "react";
import Link from "next/link";

const nameOf = (c, lang) => c?.[`name_${lang}`] || c?.name_en || c?.name_tg || c?.name_fa || c?.slug || "";
const hasKids = (c) => (c?.children?.length || 0) > 0;

function Caret() {
  // points toward the inline-end (where the next column opens); mirrored in RTL
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" className="shrink-0 opacity-50 rtl:-scale-x-100" aria-hidden>
      <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function BeautyMegaMenu({ tree = [], lang, home, label, active, allLabel, viewAllLabel }) {
  const depts = tree;
  const [open, setOpen] = useState(false);
  // Nothing pre-opened: the panel first shows just the departments; each one's
  // groups appear when you hover it (and a group's subgroups when you hover it).
  const [deptId, setDeptId] = useState(null);
  const [groupId, setGroupId] = useState(null);
  const closeTimer = useRef(null);

  const openNow = () => { clearTimeout(closeTimer.current); setOpen(true); };
  const closeSoon = () => { closeTimer.current = setTimeout(() => { setOpen(false); }, 160); };

  const dept = useMemo(() => depts.find((d) => d.id === deptId) || null, [depts, deptId]);
  const group = useMemo(() => (dept?.children || []).find((g) => g.id === groupId) || null, [dept, groupId]);
  const catHref = (slug) => `${home}/catalog?cat=${encodeURIComponent(slug)}`;

  if (!depts.length) {
    return (
      <Link href={`${home}/worlds`} className={navLinkClass(active)}>{label}<Underline active={active} /></Link>
    );
  }

  const col = "w-60 shrink-0 max-h-[70vh] overflow-y-auto py-2";
  const rowBase = "flex items-center gap-2 px-5 py-3 text-[14px] transition-colors";

  return (
    <div className="static" onMouseEnter={openNow} onMouseLeave={closeSoon}>
      <Link
        href={`${home}/worlds`} aria-haspopup="true" aria-expanded={open}
        onFocus={openNow} onBlur={closeSoon} className={navLinkClass(active)}
      >
        {label}
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" className={`transition-transform ${open ? "rotate-180" : ""}`} aria-hidden>
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <Underline active={active} />
      </Link>

      {/* Centered, fixed panel — never overflows regardless of nav position/direction */}
      <div
        className={[
          "fixed left-1/2 -translate-x-1/2 top-[4.5rem] z-[70] transition-all duration-200",
          open ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 -translate-y-1 pointer-events-none",
        ].join(" ")}
      >
        <div className="max-w-[92vw] rounded-2xl border border-line bg-canvas overflow-hidden"
          style={{ boxShadow: "0 24px 70px -18px rgba(20,20,46,.45)" }}>
          <div className="flex divide-x divide-line rtl:divide-x-reverse">
            {/* Column 1 — departments */}
            <ul className={col}>
              {depts.map((d) => {
                const on = d.id === dept?.id;
                return (
                  <li key={d.id}>
                    <Link href={catHref(d.slug)}
                      onMouseEnter={() => { setDeptId(d.id); setGroupId(null); }}
                      onFocus={() => { setDeptId(d.id); setGroupId(null); }}
                      className={`${rowBase} ${on ? "bg-surface text-[color:var(--v-accent)] font-semibold" : "text-ink-soft hover:text-ink hover:bg-surface"}`}>
                      <span className="truncate flex-1">{nameOf(d, lang)}</span>
                      {hasKids(d) && <Caret />}
                    </Link>
                  </li>
                );
              })}
            </ul>

            {/* Column 2 — the hovered department's groups (or its direct leaves) */}
            {dept && hasKids(dept) && (
              <ul className={col}>
                <li className="px-5 pt-1.5 pb-2 flex items-center justify-between">
                  <span className="text-[11px] font-bold text-ink-faint truncate">{nameOf(dept, lang)}</span>
                  <Link href={catHref(dept.slug)} className="text-[11px] font-semibold text-[color:var(--v-accent)] hover:opacity-80 shrink-0">{allLabel}</Link>
                </li>
                {dept.children.map((g) => {
                  const on = g.id === group?.id;
                  const groupNode = hasKids(g);
                  return (
                    <li key={g.id}>
                      <Link href={catHref(g.slug)}
                        onMouseEnter={() => setGroupId(groupNode ? g.id : null)}
                        onFocus={() => setGroupId(groupNode ? g.id : null)}
                        className={`${rowBase} ${on ? "bg-surface text-[color:var(--v-accent)] font-semibold" : "text-ink-soft hover:text-ink hover:bg-surface"}`}>
                        <span className="truncate flex-1">{nameOf(g, lang)}</span>
                        {groupNode && <Caret />}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}

            {/* Column 3 — the hovered group's subgroups */}
            {group && hasKids(group) && (
              <ul className={col}>
                <li className="px-5 pt-1.5 pb-2 flex items-center justify-between">
                  <span className="text-[11px] font-bold text-ink-faint truncate">{nameOf(group, lang)}</span>
                  <Link href={catHref(group.slug)} className="text-[11px] font-semibold text-[color:var(--v-accent)] hover:opacity-80 shrink-0">{allLabel}</Link>
                </li>
                {group.children.map((leaf) => (
                  <li key={leaf.id}>
                    <Link href={catHref(leaf.slug)} className={`${rowBase} text-ink-muted hover:text-ink hover:bg-surface`}>
                      <span className="truncate flex-1">{nameOf(leaf, lang)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-t border-line px-5 py-3 bg-surface">
            <Link href={`${home}/worlds`} className="text-[12.5px] font-semibold text-ink-soft hover:text-[color:var(--v-accent)]">
              {viewAllLabel} →
            </Link>
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
