// app/health/[lang]/print-catalog/page.jsx — the catalog as a print-ready document (A4), one language.
// Server-rendered from the live database: active products only, grouped by category, optionally limited to
// one category branch with ?category=<slug>. "Save as PDF" in the browser's print dialog makes the PDF.
// Nothing is invented: a field that a product does not have is simply not printed, and a price that is
// "on request" prints as such. Contact details are printed only if they are configured (no placeholders).
import Link from "next/link";
import { notFound } from "next/navigation";
import { LOCALES, LANG_META, getTranslations } from "@/lib/i18n";
import { getCategories, getAllProducts, imageUrl } from "@/lib/supabase";
import { buildHealthCategoryTree, findHealthCategory, flattenHealthCategoryTree, getHealthDescendantIds, healthCategoryName } from "@/lib/health/categories";
import { isOnRequest, priceLabel, formatPrice } from "@/lib/price";
import PrintButton from "./PrintButton";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";   // a document made on demand reads the database now, not a 60-second-old copy

const MAX_PRODUCTS = 300;   // a printed document of thousands of pages helps nobody: narrow by category
const SPEC_ROWS = 8;
const DESC_CHARS = 320;

const COPY = {
  fa: { print: "چاپ / ذخیره PDF", back: "بازگشت به کاتالوگ", doc: "کاتالوگ محصولات", date: "تاریخ", count: "محصول", more: (n) => `فقط ${n} محصول اول چاپ شد؛ برای فهرست کامل‌تر دسته‌بندی را محدود کنید.`, empty: "محصولی برای چاپ نیست.", uncategorized: "سایر", scope: "دسته" },
  ru: { print: "Печать / сохранить PDF", back: "Назад в каталог", doc: "Каталог товаров", date: "Дата", count: "товаров", more: (n) => `Напечатаны только первые ${n} товаров; сузьте категорию, чтобы получить остальные.`, empty: "Нет товаров для печати.", uncategorized: "Прочее", scope: "Категория" },
  tg: { print: "Чоп / захира PDF", back: "Бозгашт ба каталог", doc: "Каталоги маҳсулот", date: "Сана", count: "маҳсулот", more: (n) => `Танҳо ${n} маҳсулоти аввал чоп шуд; барои рӯйхати пурра категорияро маҳдуд кунед.`, empty: "Маҳсулоти чопшаванда нест.", uncategorized: "Дигар", scope: "Категория" },
  en: { print: "Print / Save as PDF", back: "Back to catalog", doc: "Product catalog", date: "Date", count: "products", more: (n) => `Only the first ${n} products are printed; narrow the category for the rest.`, empty: "There are no products to print.", uncategorized: "Other", scope: "Category" },
};
const LOCALE = { fa: "fa-IR", ru: "ru-RU", tg: "tg-TJ", en: "en-GB" };

function today(lang) {
  const d = new Date();
  try { return d.toLocaleDateString(LOCALE[lang] || "en-GB", { year: "numeric", month: "long", day: "numeric" }); }
  catch { return d.toISOString().slice(0, 10); }
}
const clip = (s, n) => { const t = String(s || "").replace(/\s+/g, " ").trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };

export async function generateMetadata(props) {
  const { lang } = await props.params;
  return { robots: { index: false, follow: false }, title: (COPY[lang] || COPY.en).doc };
}

export default async function PrintCatalogPage(props) {
  const { lang } = await props.params;
  if (!LOCALES.includes(lang)) notFound();
  const sp = (await props.searchParams) || {};
  const slug = typeof sp.category === "string" ? sp.category.slice(0, 80) : "";
  const t = getTranslations(lang);
  const c = COPY[lang] || COPY.en;
  const dir = LANG_META[lang]?.dir || "ltr";

  const [categories, all] = await Promise.all([getCategories(), getAllProducts()]);
  const tree = buildHealthCategoryTree(categories, { activeOnly: true });
  const flat = flattenHealthCategoryTree(tree).map(({ node }) => node);
  const chosen = slug ? findHealthCategory(tree, slug) : null;
  if (slug && !chosen) notFound();

  const visibleIds = new Set(flat.map((n) => n.id).filter((id) => id != null));
  const wantIds = chosen ? getHealthDescendantIds(chosen) : null;
  let products = all.filter((p) => (wantIds ? wantIds.has(p.category_id) : p.category_id == null || visibleIds.has(p.category_id)));
  const total = products.length;
  products = products.slice(0, MAX_PRODUCTS);

  // group by category (tree order), products without a category last
  const order = new Map(flat.map((n, i) => [n.id, i]));
  const groups = new Map();
  for (const p of products) {
    const key = p.category_id != null && order.has(p.category_id) ? p.category_id : "other";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }
  const sections = [...groups.entries()]
    .sort(([a], [b]) => (a === "other") - (b === "other") || (order.get(a) ?? 0) - (order.get(b) ?? 0))
    .map(([key, list]) => ({ key, title: key === "other" ? c.uncategorized : healthCategoryName(flat.find((n) => n.id === key), lang), list }));

  const phone = process.env.NEXT_PUBLIC_PHONE || "";
  const email = process.env.NEXT_PUBLIC_EMAIL_HEALTH || process.env.NEXT_PUBLIC_EMAIL || "";
  const site = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/+$/, "");
  const nameOf = (p) => p[`name_${lang}`] || p.name_en || p.name_ru || "";

  return (
    <div dir={dir} className="print-doc bg-surface text-ink">
      <style>{`
        @page { size: A4; margin: 14mm; }
        @media print {
          header, footer, nav, .fixed, [data-print-hide] { display: none !important; }
          html, body { background: #fff !important; }
          .print-doc { padding: 0 !important; }
          .print-product { break-inside: avoid; }
          .print-section h2 { break-after: avoid; }
          a { color: inherit; text-decoration: none; }
        }
      `}</style>

      <div data-print-hide className="container-x pt-6 flex flex-wrap items-center gap-3">
        <PrintButton label={c.print} />
        <Link href={`/health/${lang}/catalog`} className="btn-ghost size-md">{c.back}</Link>
      </div>

      <div className="container-x py-6 print:py-0 max-w-[190mm]">
        <div className="flex items-start justify-between gap-6 border-b border-line pb-4 mb-6">
          <div className="min-w-0">
            <p className="font-display text-[22px] font-extrabold tracking-tight leading-none" dir="ltr">Medoria <span className="text-primary">Health</span></p>
            <h1 className="font-display text-xl font-bold mt-2">{c.doc}{chosen ? ` — ${healthCategoryName(chosen, lang)}` : ""}</h1>
            <p className="text-[12px] text-ink-muted mt-1">{c.date}: {today(lang)} · <span className="tabular">{total}</span> {c.count}</p>
          </div>
          <div className="text-[11px] text-ink-muted leading-relaxed text-end shrink-0 max-w-[60mm]" dir="ltr">
            {site && <div>{site.replace(/^https?:\/\//, "")}</div>}
            {email && <div className="break-all">{email}</div>}
            {phone && <div className="tabular">{phone}</div>}
          </div>
        </div>

        {total > MAX_PRODUCTS && <p className="text-[12px] text-warn mb-4">{c.more(MAX_PRODUCTS)}</p>}
        {sections.length === 0 && <p className="text-ink-muted py-10 text-center">{c.empty}</p>}

        {sections.map((s) => (
          <section key={s.key} className="print-section mb-8">
            <h2 className="font-display text-[15px] font-bold uppercase tracking-wide text-primary border-b border-line pb-1.5 mb-3">{s.title}</h2>
            <div className="space-y-3">
              {s.list.map((p) => {
                const specs = p.specs && typeof p.specs === "object" && !Array.isArray(p.specs) ? Object.entries(p.specs).filter(([, v]) => v != null && String(v).trim() !== "") : [];
                const desc = clip(p[`description_${lang}`] || p.description_en, DESC_CHARS);
                return (
                  <article key={p.id} className="print-product flex gap-4 rounded-xl border border-line p-3">
                    <div className="w-[28mm] h-[28mm] shrink-0 rounded-lg bg-canvas-soft border border-line overflow-hidden">
                      {p.image_url ? <img src={imageUrl(p.image_url)} alt="" className="w-full h-full object-contain" /> : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-[14px] font-bold leading-snug break-words">{nameOf(p)}</h3>
                      <p className="text-[11px] text-ink-muted mt-0.5 break-words" dir="ltr">
                        {[p.sku && `${t.product.sku}: ${p.sku}`, p.brand].filter(Boolean).join("  ·  ")}
                      </p>
                      {desc && <p className="text-[11.5px] leading-relaxed mt-1.5 break-words">{desc}</p>}
                      {specs.length > 0 && (
                        <dl className="mt-1.5 grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-x-3 gap-y-0.5 text-[11px]">
                          {specs.slice(0, SPEC_ROWS).map(([k, v]) => (<div key={k} className="contents"><dt className="text-ink-muted break-words">{k}</dt><dd className="font-semibold break-words">{String(v)}</dd></div>))}
                        </dl>
                      )}
                      <p className="text-[11.5px] mt-1.5 tabular">
                        <span className="font-bold">{isOnRequest(p) ? priceLabel(p, lang) : `${formatPrice(p.price)}${p.currency ? ` ${p.currency}` : ""} / ${p.unit}`}</span>
                        {p.min_order_qty > 1 ? <span className="text-ink-muted"> · {t.product.minOrder}: {p.min_order_qty}{p.unit ? ` ${p.unit}` : ""}</span> : null}
                      </p>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
