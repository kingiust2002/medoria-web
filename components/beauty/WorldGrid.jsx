// components/beauty/WorldGrid.jsx — the one shared layout for all three levels
// of the «World» browse (departments → groups → subgroups). A server component,
// so the three route segments stay thin: each one resolves its node from the
// category tree, then hands the list here.
//
// `hrefFor` is passed in rather than derived, because each level links somewhere
// different: a department opens its own page, a group with children opens its
// page, and a leaf goes straight into the filtered catalog.
import Link from "next/link";
import Icon from "@/components/shared/Icon";
import Breadcrumb from "@/components/shared/Breadcrumb";
import { beautyImageUrl } from "@/lib/beauty/catalog";
import { nameOf, hasKids, gradFor, DEPT_IMG, copyFor } from "@/lib/beauty/worlds";

export default function WorldGrid({
  lang,
  items = [],
  // "dept" = the seven top-level tiles (bigger, numbered, 2-up).
  // "sub"  = anything below that (smaller, 2/3-up).
  variant = "sub",
  heading,
  sub,
  crumbs,
  backHref,
  browseAllHref,
  hrefFor,
  // Fixes the gradient family for a whole subtree, so a department and its
  // descendants share one hue instead of restarting the palette per page.
  gradIndex,
}) {
  const c = copyFor(lang);
  const isDept = variant === "dept";
  const grad = gradIndex == null ? null : gradFor(gradIndex);

  return (
    <div className="pb-20">
      <div className="container-x pt-8 pb-6">
        <Breadcrumb lang={lang} crumbs={crumbs} />
        <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[12px] font-semibold tracking-[0.22em] uppercase text-[color:var(--v-accent)] mb-2">THE EDIT</p>
            <h1 className="bv-display text-4xl sm:text-5xl font-bold text-ink">{heading}</h1>
            {sub && <p className="mt-3 text-ink-muted max-w-xl leading-relaxed">{sub}</p>}
          </div>
          <div className="flex items-center gap-2">
            {backHref && (
              <Link href={backHref} className="btn-ghost size-md">
                <Icon name="arrow" size={16} className="rtl:rotate-180" /> {c.back}
              </Link>
            )}
            {browseAllHref && (
              <Link href={browseAllHref} className="btn-primary size-md">
                {c.browseAll} <Icon name="arrowUpRight" size={16} />
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="container-x">
        {items.length === 0 ? (
          <p className="text-ink-faint text-center py-16 rounded-2xl border border-dashed border-line">{c.empty}</p>
        ) : (
          <div className={`grid gap-4 sm:gap-5 ${isDept ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-2 lg:grid-cols-3"}`}>
            {items.map((node, i) => {
              const img = beautyImageUrl(node.image_url) || (isDept ? DEPT_IMG[node.slug] : null) || null;
              const g = grad || gradFor(i);
              const drills = hasKids(node) && !isDept;
              return (
                // CSS-only entrance (see .world-tile-in in globals.css). The
                // JS Reveal primitive used to wrap this, which meant the tiles
                // were served as inline opacity:0 and stayed invisible until
                // framer-motion hydrated — and its delay is Framer's, in
                // SECONDS, so the `i * 40` passed here staggered them FORTY
                // seconds apart (the seventh tile was four minutes late). That
                // is what made the page look like it opened one tile at a time,
                // and why only the first department ever seemed to exist.
                // animationDelay below is a real CSS time string, so ms is ms.
                <div key={node.id} className="world-tile-in" style={{ animationDelay: `${i * 45}ms` }}>
                  <Link href={hrefFor(node)} className="group block relative overflow-hidden rounded-2xl border border-line focus-ring">
                    <div className={`relative ${isDept ? "aspect-[16/10]" : "aspect-[4/3]"}`}>
                      {img ? (
                        <img
                          src={img}
                          alt=""
                          loading={i < 2 ? "eager" : "lazy"}
                          decoding="async"
                          className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.05]"
                        />
                      ) : (
                        <div className="absolute inset-0 grid place-items-center transition-transform duration-700 group-hover:scale-[1.05]" style={{ background: g }}>
                          <Icon name={node.icon || "sparkles"} size={isDept ? 40 : 30} className="text-white/70" />
                        </div>
                      )}
                      <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(20,20,46,.62) 0%, rgba(20,20,46,.12) 42%, transparent 70%)" }} />
                      {isDept && (
                        <span className="absolute top-3 start-3 sm:top-4 sm:start-4 inline-flex items-center justify-center min-w-7 h-7 px-2 rounded-full bg-white/20 backdrop-blur-sm text-white text-[11px] font-bold tracking-wide">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                      )}
                      <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5 flex items-end justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className={`text-white font-bold drop-shadow ${isDept ? "text-xl sm:text-2xl bv-display" : "text-[15px]"}`}>
                            {nameOf(node, lang)}
                          </h3>
                          {hasKids(node) && (
                            <p className="text-white/75 text-[11px] mt-0.5">{node.children.length} {c.items}</p>
                          )}
                        </div>
                        <span className="shrink-0 grid place-items-center w-9 h-9 rounded-full bg-white/20 backdrop-blur-sm text-white transition-colors group-hover:bg-white/30">
                          <Icon name={drills ? "chevronLeft" : "arrowUpRight"} size={16} className={drills ? "rtl:rotate-180" : ""} />
                        </span>
                      </div>
                    </div>
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
