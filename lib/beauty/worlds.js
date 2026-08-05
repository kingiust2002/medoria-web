// lib/beauty/worlds.js — shared constants + copy for the «World» browse.
// Pure data and pure functions only (no React, no DB), so the three World route
// segments can each stay a thin file that just fetches its node and renders.
import { LOCALES } from "@/lib/i18n";
import { getBeautyCategoryTree } from "@/lib/beauty/catalog";

export const nameOf = (c, lang) =>
  c?.[`name_${lang}`] || c?.name_en || c?.name_tg || c?.name_fa || c?.slug || "";

export const hasKids = (c) => (c?.children?.length || 0) > 0;

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
export const gradFor = (i) => GRADS[((i % GRADS.length) + GRADS.length) % GRADS.length];

// Static department imagery (brand-safe Edit mood shots). An uploaded
// beauty_categories.image_url always wins over these.
export const DEPT_IMG = {
  perfume: "/beauty/edit/edit-perfume.webp",
  "personal-care": "/beauty/edit/edit-skincare.webp",
  makeup: "/beauty/edit/edit-makeup.webp",
  hair: "/beauty/edit/edit-hair.webp",
  electrical: "/beauty/edit/edit-electrical.webp",
  fashion: "/beauty/edit/edit-fashion.webp",
  supplements: "/beauty/edit/edit-supplements.webp",
};

export const COPY = {
  tg: { tag: "ИНТИХОБ", root: "Ҷаҳонҳо", rootSub: "Ҳафт ҷаҳони зебоӣ — яке-якеро кушоед.", back: "Бозгашт", browseAll: "Ҳамаи маҳсулот", empty: "Ин бахш ҳоло холист.", items: "бахш", worlds: "Ҷаҳонҳо" },
  ru: { tag: "ОТБОР", root: "Миры", rootSub: "Семь миров красоты — откройте каждый.", back: "Назад", browseAll: "Все товары", empty: "Этот раздел пока пуст.", items: "разделов", worlds: "Миры" },
  en: { tag: "THE EDIT", root: "Worlds", rootSub: "Seven worlds of beauty — step into each.", back: "Back", browseAll: "All products", empty: "This section is empty for now.", items: "sections", worlds: "Worlds" },
  fa: { tag: "منتخب", root: "دنیاها", rootSub: "هفت دنیای زیبایی — هرکدام را باز کنید.", back: "بازگشت", browseAll: "همه‌ی محصولات", empty: "این بخش فعلاً خالی است.", items: "بخش", worlds: "دنیاها" },
};
export const copyFor = (lang) => COPY[lang] || COPY.tg;

// URL builders — one place, so the segment shape can never drift between the
// pages that link to each other.
export const worldsHref = (lang) => `/beauty/${lang}/worlds`;
export const deptHref = (lang, dept) => `${worldsHref(lang)}/${encodeURIComponent(dept)}`;
export const groupHref = (lang, dept, group) => `${deptHref(lang, dept)}/${encodeURIComponent(group)}`;
export const catalogHref = (lang, slug) => `/beauty/${lang}/catalog?cat=${encodeURIComponent(slug)}`;

// ── static params ───────────────────────────────────────────────────────────
// These run at BUILD time so every World page is prerendered and served from
// the CDN edge. If the DB is unreachable during a build they return a smaller
// set (or just the locales) and the missing paths are generated on first
// request instead, then cached — never an error.
export async function worldsLangParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export async function worldsDeptParams() {
  const tree = await getBeautyCategoryTree().catch(() => []);
  return LOCALES.flatMap((lang) => tree.map((d) => ({ lang, dept: d.slug })));
}

export async function worldsGroupParams() {
  const tree = await getBeautyCategoryTree().catch(() => []);
  return LOCALES.flatMap((lang) =>
    tree.flatMap((d) =>
      (d.children || [])
        .filter(hasKids) // only groups that actually have a third level
        .map((g) => ({ lang, dept: d.slug, group: g.slug }))
    )
  );
}
