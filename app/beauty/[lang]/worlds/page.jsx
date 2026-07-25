// app/beauty/[lang]/worlds/page.jsx — «World»: the image-driven browse over the
// migration-12 category tree. Server-rendered and crawlable, drills in via GET
// query params (works JS-off):
//   /worlds                    → the 7 departments, two across
//   /worlds?dept=makeup        → that department's groups (or direct leaves)
//   /worlds?dept=personal-care&group=face-care → that group's subgroups
// Each tile shows the category's uploaded image (beauty_categories.image_url)
// or, until one exists, an on-brand champagne/copper gradient placeholder with
// the category's icon — never an empty box. Leaves link into the filtered
// catalog. No fake claims, no baked-in text (brand law).
import Link from "next/link";
import Icon from "@/components/shared/Icon";
import Breadcrumb from "@/components/shared/Breadcrumb";
import { Reveal } from "@/components/shared/Reveal";
import { LOCALES } from "@/lib/i18n";
import { getBeautyCategoryTree, beautyImageUrl } from "@/lib/beauty/catalog";
import { getBeautyTranslations } from "@/components/beauty/i18n";

export const dynamic = "force-dynamic";

const nameOf = (c, lang) => c?.[`name_${lang}`] || c?.name_en || c?.name_tg || c?.name_fa || c?.slug || "";
const hasKids = (c) => (c?.children?.length || 0) > 0;

// On-brand placeholder gradients (warm ivory→champagne→copper family, subtle
// per-department hue shift so tiles read as distinct without leaving the palette).
const GRADS = [
  "linear-gradient(135deg,#e9dcc8,#c8a06f)",
  "linear-gradient(135deg,#e6dccf,#a9b7c6)",
  "linear-gradient(135deg,#efd9d2,#c98a86)",
  "linear-gradient(135deg,#ece0cf,#c2a06a)",
  "linear-gradient(135deg,#e3e0d8,#9fa3ad)",
  "linear-gradient(135deg,#e8dcd0,#b79bb0)",
  "linear-gradient(135deg,#e2e2d2,#9cbfae)",
];
const gradFor = (i) => GRADS[((i % GRADS.length) + GRADS.length) % GRADS.length];

// Static department imagery (reuses the existing brand-safe Edit mood shots
// where they fit; the rest fall back to gradient until an image is uploaded in
// the panel). An uploaded beauty_categories.image_url always wins over these.
const DEPT_IMG = {
  perfume: "/beauty/edit/edit-perfume.webp",
  "personal-care": "/beauty/edit/edit-skincare.webp",
  makeup: "/beauty/edit/edit-makeup.webp",
  hair: "/beauty/edit/edit-hair.webp",
  electrical: "/beauty/edit/edit-electrical.webp",
  fashion: "/beauty/edit/edit-fashion.webp",
  supplements: "/beauty/edit/edit-supplements.webp",
};

const COPY = {
  tg: { root: "Ҷаҳонҳо", rootSub: "Ҳафт ҷаҳони зебоӣ — яке-якеро кушоед.", back: "Бозгашт", browseAll: "Ҳамаи маҳсулот", empty: "Ин бахш ҳоло холист.", items: "бахш", worlds: "Ҷаҳонҳо" },
  ru: { root: "Миры", rootSub: "Семь миров красоты — откройте каждый.", back: "Назад", browseAll: "Все товары", empty: "Этот раздел пока пуст.", items: "разделов", worlds: "Миры" },
  en: { root: "Worlds", rootSub: "Seven worlds of beauty — step into each.", back: "Back", browseAll: "All products", empty: "This section is empty for now.", items: "sections", worlds: "Worlds" },
  fa: { root: "دنیاها", rootSub: "هفت دنیای زیبایی — هرکدام را باز کنید.", back: "بازگشت", browseAll: "همه‌ی محصولات", empty: "این بخش فعلاً خالی است.", items: "بخش", worlds: "دنیاها" },
};

export default async function WorldPage({ params, searchParams }) {
  const { lang } = params;
  if (!LOCALES.includes(lang)) return null;
  const t = getBeautyTranslations(lang);
  const c = COPY[lang] || COPY.tg;
  const home = `/beauty/${lang}`;
  const sp = searchParams || {};

  const tree = await getBeautyCategoryTree();
  const deptIndex = tree.findIndex((d) => d.slug === sp.dept);
  const dept = deptIndex >= 0 ? tree[deptIndex] : null;
  const group = dept ? (dept.children || []).find((g) => g.slug === sp.group) : null;

  const catHref = (slug) => `${home}/catalog?cat=${encodeURIComponent(slug)}`;

  let items, heading, sub, grad, backHref, crumbs;
  if (!dept) {
    items = tree;
    heading = c.root; sub = c.rootSub; grad = null; backHref = null;
    crumbs = [{ label: t.nav.home, href: home }, { label: c.worlds }];
  } else if (!group) {
    items = dept.children || [];
    heading = nameOf(dept, lang); sub = null; grad = gradFor(deptIndex); backHref = `${home}/worlds`;
    crumbs = [{ label: t.nav.home, href: home }, { label: c.worlds, href: `${home}/worlds` }, { label: heading }];
  } else {
    items = group.children || [];
    heading = nameOf(group, lang); sub = null; grad = gradFor(deptIndex);
    backHref = `${home}/worlds?dept=${encodeURIComponent(dept.slug)}`;
    crumbs = [{ label: t.nav.home, href: home }, { label: c.worlds, href: `${home}/worlds` }, { label: nameOf(dept, lang), href: backHref }, { label: heading }];
  }

  const tileHref = (node) => {
    if (!dept) return `${home}/worlds?dept=${encodeURIComponent(node.slug)}`;
    if (!group && hasKids(node)) return `${home}/worlds?dept=${encodeURIComponent(dept.slug)}&group=${encodeURIComponent(node.slug)}`;
    return catHref(node.slug);
  };

  const twoWide = !dept;

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
              <Link href={backHref} className="btn-ghost size-md"><Icon name="arrow" size={16} className="rtl:rotate-180" /> {c.back}</Link>
            )}
            {dept && (
              <Link href={catHref((group || dept).slug)} className="btn-primary size-md">
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
          <div className={`grid gap-4 sm:gap-5 ${twoWide ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-2 lg:grid-cols-3"}`}>
            {items.map((node, i) => {
              const img = beautyImageUrl(node.image_url) || (!dept ? DEPT_IMG[node.slug] : null) || null;
              const g = grad || gradFor(i);
              const drill = !group && hasKids(node) && dept;
              const isDept = !dept;
              return (
                <Reveal key={node.id} delay={i * 40}>
                  <Link href={tileHref(node)} className="group block relative overflow-hidden rounded-2xl border border-line focus-ring">
                    <div className={`relative ${isDept ? "aspect-[16/10]" : "aspect-[4/3]"}`}>
                      {img ? (
                        <img src={img} alt="" className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.05]" />
                      ) : (
                        <div className="absolute inset-0 grid place-items-center transition-transform duration-700 group-hover:scale-[1.05]" style={{ background: g }}>
                          <Icon name={node.icon || "sparkles"} size={isDept ? 40 : 30} className="text-white/70" />
                        </div>
                      )}
                      <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(20,20,46,.62) 0%, rgba(20,20,46,.12) 42%, transparent 70%)" }} />
                      <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5 flex items-end justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className={`text-white font-bold drop-shadow ${isDept ? "text-xl sm:text-2xl bv-display" : "text-[15px]"}`}>{nameOf(node, lang)}</h3>
                          {hasKids(node) && <p className="text-white/75 text-[11px] mt-0.5">{node.children.length} {c.items}</p>}
                        </div>
                        <span className="shrink-0 grid place-items-center w-9 h-9 rounded-full bg-white/20 backdrop-blur-sm text-white transition-colors group-hover:bg-white/30">
                          <Icon name={drill ? "chevronLeft" : "arrowUpRight"} size={16} className={drill ? "rtl:rotate-180" : ""} />
                        </span>
                      </div>
                    </div>
                  </Link>
                </Reveal>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
