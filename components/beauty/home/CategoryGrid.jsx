// components/beauty/home/CategoryGrid.jsx — the Beauty worlds as an asymmetric
// editorial vitrine («Fil d'Or» season): the first world is a wide feature
// panel, the rest sit beside it — magazine rhythm instead of the symmetric
// Health grid. Second station of the copper thread (data-fil-node).
//
// This used to render three hard-coded cards — Skincare / Makeup / Tools — each
// labelled "soon" and pointing at an #collections anchor that no longer exists.
// It was written before the category tree did. The real taxonomy is now seven
// departments holding 45 groups and 141 subgroups, every one of them live and
// photographed, so the section reads from the tree and links into it. A card
// says how many sections are actually behind it instead of promising later.
import { getBeautyTranslations as getTranslations } from "@/components/beauty/i18n";
import { getBeautyCategoryTree, beautyImageUrl } from "@/lib/beauty/catalog";
import { nameOf, deptHref, worldsHref, DEPT_IMG, gradFor, copyFor } from "@/lib/beauty/worlds";
import { CATEGORY_IMG } from "@/lib/beauty/categoryImages";
import Icon from "@/components/shared/Icon";
import { Reveal, Stagger, StaggerItem } from "@/components/shared/Reveal";
import TiltCard from "@/components/shared/TiltCard";
import SpotlightCard from "@/components/shared/SpotlightCard";

export default async function CategoryGrid({ lang }) {
  const t = getTranslations(lang);
  const c = copyFor(lang);
  const tree = await getBeautyCategoryTree();

  // The tree is the entire section. If the database is unreachable it comes
  // back empty, and a heading sitting over nothing reads as broken — so drop
  // the section rather than render a hollow one.
  if (!tree.length) return null;

  return (
    <section id="worlds" className="py-14 md:py-20 bg-canvas-soft border-y border-line">
      <div className="container-x">
        <Reveal className="flex items-end justify-between mb-8 md:mb-10 gap-4">
          <div>
            <div className="section-tag mb-2.5" data-fil-node>{t.home.catTag}</div>
            <h2 className="section-h">{t.home.catH}</h2>
            <p className="section-sub">{t.home.catSub}</p>
          </div>
          <a href={worldsHref(lang)} className="hidden sm:inline-flex items-center gap-1 text-[13px] font-semibold text-brand-violet hover:opacity-80 whitespace-nowrap">
            {t.home.catAll} <Icon name={lang === "fa" ? "arrowL" : "arrow"} size={14} />
          </a>
        </Reveal>

        <Stagger className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 md:gap-4">
          {tree.map((dept, i) => {
            const feature = i === 0;
            const kids = dept.children?.length || 0;
            // Same resolution order the World grid uses, so a department wears
            // the identical photograph in both places.
            const img = beautyImageUrl(dept.image_url) || CATEGORY_IMG[dept.slug] || DEPT_IMG[dept.slug] || null;
            return (
              <StaggerItem key={dept.id} className={feature ? "sm:col-span-2 lg:col-span-6" : "lg:col-span-3"}>
                <TiltCard className="h-full rounded-2xl" max={feature ? 5 : 8}>
                  <SpotlightCard className="h-full rounded-2xl">
                    <a href={deptHref(lang, dept.slug)} className="card card-hover bv-sheen overflow-hidden group block h-full focus-ring">
                      <div className={`relative ${feature ? "aspect-[16/9]" : "aspect-[4/3]"}`}>
                        {img ? (
                          <img
                            src={img}
                            alt=""
                            loading={i < 2 ? "eager" : "lazy"}
                            decoding="async"
                            className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.05]"
                          />
                        ) : (
                          <div className="absolute inset-0 grid place-items-center transition-transform duration-700 group-hover:scale-[1.05]" style={{ background: gradFor(i) }}>
                            <Icon name={dept.icon || "sparkles"} size={feature ? 40 : 30} className="text-white/70" />
                          </div>
                        )}
                        <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(20,20,46,.62) 0%, rgba(20,20,46,.12) 42%, transparent 70%)" }} />
                        <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5 flex items-end justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className={`text-white font-bold drop-shadow bv-display ${feature ? "text-xl md:text-2xl" : "text-[15px]"}`}>
                              {nameOf(dept, lang)}
                            </h3>
                            {kids > 0 && <p className="text-white/75 text-[11px] mt-0.5">{kids} {c.items}</p>}
                          </div>
                          <span className="shrink-0 grid place-items-center w-9 h-9 rounded-full bg-white/20 backdrop-blur-sm text-white transition-colors group-hover:bg-white/30">
                            <Icon name="chevronRight" size={16} className="rtl:rotate-180" />
                          </span>
                        </div>
                      </div>
                    </a>
                  </SpotlightCard>
                </TiltCard>
              </StaggerItem>
            );
          })}
        </Stagger>

        <a href={worldsHref(lang)} className="sm:hidden flex items-center justify-center gap-1 mt-6 text-[13px] font-semibold text-primary">
          {t.home.catAll} <Icon name="arrow" size={14} />
        </a>
      </div>
    </section>
  );
}
