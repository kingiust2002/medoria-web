"use client";

// Health Collection browse control for the desktop header. It mirrors Beauty's
// progressive World menu: department -> group -> detailed category. Every row
// is a real catalog link; hovering or focusing opens the next column without
// navigating away from the current page.
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

const nameOf = (node) => node?.name || node?.slug || "";
const hasChildren = (node) => (node?.children?.length || 0) > 0;

function Caret() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" className="shrink-0 opacity-50 rtl:-scale-x-100" aria-hidden>
      <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function HealthCollectionMegaMenu({
  tree = [],
  lang,
  home,
  label,
  active,
  allLabel,
  browseAllLabel,
}) {
  const [open, setOpen] = useState(false);
  const [departmentId, setDepartmentId] = useState(null);
  const [groupId, setGroupId] = useState(null);
  const closeTimer = useRef(null);

  const departments = tree;
  const department = useMemo(
    () => departments.find((node) => node.id === departmentId) || null,
    [departments, departmentId]
  );
  const group = useMemo(
    () => (department?.children || []).find((node) => node.id === groupId) || null,
    [department, groupId]
  );

  const catalogHref = (slug) => `${home}/catalog?category=${encodeURIComponent(slug)}`;
  const openNow = () => {
    clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const closeNow = () => {
    clearTimeout(closeTimer.current);
    setOpen(false);
    setDepartmentId(null);
    setGroupId(null);
  };
  const closeSoon = () => {
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(closeNow, 160);
  };

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") closeNow();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      clearTimeout(closeTimer.current);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  if (!departments.length) {
    return (
      <Link href={`${home}/catalog`} className={navLinkClass(active)}>
        {label}
        <Underline active={active} />
      </Link>
    );
  }

  const columnClass = "w-64 shrink-0 max-h-[70vh] overflow-y-auto py-2";
  const rowClass = "flex items-center gap-2 px-5 py-3 text-[14px] transition-colors";

  return (
    <div className="static" onMouseEnter={openNow} onMouseLeave={closeSoon}>
      <Link
        href={`${home}/catalog`}
        aria-haspopup="true"
        aria-expanded={open}
        onFocus={openNow}
        onBlur={closeSoon}
        className={navLinkClass(active)}
      >
        {label}
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" className={`transition-transform ${open ? "rotate-180" : ""}`} aria-hidden>
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <Underline active={active} />
      </Link>

      <div
        className={[
          "fixed left-1/2 top-[4.5rem] z-[70] -translate-x-1/2 transition-all duration-200",
          open ? "translate-y-0 opacity-100 pointer-events-auto" : "-translate-y-1 opacity-0 pointer-events-none",
        ].join(" ")}
      >
        <div
          className="max-w-[94vw] overflow-hidden rounded-2xl border border-line bg-canvas"
          style={{ boxShadow: "0 24px 70px -18px rgba(15,23,42,.38)" }}
        >
          <div className="flex divide-x divide-line rtl:divide-x-reverse">
            <ul className={columnClass} aria-label={label}>
              {departments.map((node) => {
                const selected = node.id === department?.id;
                return (
                  <li key={node.id || node.slug}>
                    <Link
                      href={catalogHref(node.slug)}
                      onClick={closeNow}
                      onMouseEnter={() => {
                        setDepartmentId(node.id);
                        setGroupId(null);
                      }}
                      onFocus={() => {
                        setDepartmentId(node.id);
                        setGroupId(null);
                      }}
                      className={`${rowClass} ${selected ? "bg-surface text-brand-violet font-semibold" : "text-ink-soft hover:bg-surface hover:text-ink"}`}
                    >
                      <span className="min-w-0 flex-1 truncate">{nameOf(node)}</span>
                      {hasChildren(node) && <Caret />}
                    </Link>
                  </li>
                );
              })}
            </ul>

            {department && hasChildren(department) && (
              <ul className={columnClass} aria-label={nameOf(department)}>
                <li className="flex items-center justify-between gap-3 px-5 pb-2 pt-1.5">
                  <span className="truncate text-[11px] font-bold text-ink-faint">{nameOf(department)}</span>
                  <Link href={catalogHref(department.slug)} onClick={closeNow} className="shrink-0 text-[11px] font-semibold text-brand-violet hover:opacity-80">
                    {allLabel}
                  </Link>
                </li>
                {department.children.map((node) => {
                  const selected = node.id === group?.id;
                  const expandable = hasChildren(node);
                  return (
                    <li key={node.id || node.slug}>
                      <Link
                        href={catalogHref(node.slug)}
                        onClick={closeNow}
                        onMouseEnter={() => setGroupId(expandable ? node.id : null)}
                        onFocus={() => setGroupId(expandable ? node.id : null)}
                        className={`${rowClass} ${selected ? "bg-surface text-brand-violet font-semibold" : "text-ink-soft hover:bg-surface hover:text-ink"}`}
                      >
                        <span className="min-w-0 flex-1 truncate">{nameOf(node)}</span>
                        {expandable && <Caret />}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}

            {group && hasChildren(group) && (
              <ul className={columnClass} aria-label={nameOf(group)}>
                <li className="flex items-center justify-between gap-3 px-5 pb-2 pt-1.5">
                  <span className="truncate text-[11px] font-bold text-ink-faint">{nameOf(group)}</span>
                  <Link href={catalogHref(group.slug)} onClick={closeNow} className="shrink-0 text-[11px] font-semibold text-brand-violet hover:opacity-80">
                    {allLabel}
                  </Link>
                </li>
                {group.children.map((node) => (
                  <li key={node.id || node.slug}>
                    <Link href={catalogHref(node.slug)} onClick={closeNow} className={`${rowClass} text-ink-muted hover:bg-surface hover:text-ink`}>
                      <span className="min-w-0 flex-1 truncate">{nameOf(node)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-t border-line bg-surface px-5 py-3">
            <Link href={`${home}/catalog`} onClick={closeNow} className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-ink-soft hover:text-brand-violet">
              {browseAllLabel}
              <span aria-hidden className="rtl:-scale-x-100">→</span>
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
    active ? "text-brand-violet" : "text-ink-muted hover:text-brand-violet",
  ].join(" ");
}

function Underline({ active }) {
  return (
    <span
      className={[
        "pointer-events-none absolute inset-x-3 bottom-1 h-[2px] rounded-full bg-brand-gradient origin-center transition-transform duration-300",
        active ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100",
      ].join(" ")}
    />
  );
}
