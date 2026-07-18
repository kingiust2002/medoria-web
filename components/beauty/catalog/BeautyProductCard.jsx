// components/beauty/catalog/BeautyProductCard.jsx — server-rendered luxe
// product card for the Beauty collection grid. Editorial: image, brand in
// small caps, serif name, price or "request price" — all crawlable HTML.
import Link from "next/link";
import Icon from "@/components/shared/Icon";
import { beautyImageUrl } from "@/lib/beauty/catalog";
import { priceLabel, isOnRequest } from "@/lib/price";

const BADGE_FALLBACK = { NEW: "NEW", TOP: "TOP", SALE: "SALE" };

export default function BeautyProductCard({ product: p, lang, requestLabel }) {
  const name = p[`name_${lang}`] || p.name_en || p.name_ru || p.sku;
  const img = p.image_url ? beautyImageUrl(p.image_url) : null;
  const onRequest = isOnRequest(p);
  return (
    <Link
      href={`/beauty/${lang}/catalog/${p.slug || p.id}`}
      className="card card-hover bv-sheen overflow-hidden group flex flex-col"
    >
      <div className="img-ph relative aspect-[4/3] overflow-hidden">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt={name} loading="lazy"
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
        ) : (
          <span className="absolute inset-0 grid place-items-center text-ink-faint">
            <Icon name="sparkles" size={30} strokeWidth={1.2} />
          </span>
        )}
        {p.badge && (
          <span className="tag absolute top-2.5 start-2.5 text-white"
            style={{ background: "linear-gradient(120deg,var(--v-navy),var(--v-copper))" }}>
            {BADGE_FALLBACK[p.badge] || p.badge}
          </span>
        )}
      </div>
      <div className="p-4 flex flex-col flex-1">
        {p.brand && (
          <span className="text-[10px] font-semibold tracking-[0.18em] uppercase text-ink-faint mb-1" dir="ltr">
            {p.brand}
          </span>
        )}
        <h3 className="font-display text-[15px] font-semibold text-ink leading-snug group-hover:text-[color:var(--v-accent)] transition-colors line-clamp-2">
          {name}
        </h3>
        <div className="mt-auto pt-3 flex items-center justify-between gap-2">
          <span className={`font-bold ${onRequest ? "text-[color:var(--v-accent)] text-[13px]" : "text-ink text-[15px]"}`}>
            {onRequest ? requestLabel : priceLabel(p, lang)}
          </span>
          <Icon name={lang === "fa" ? "arrowL" : "arrow"} size={15}
            className="text-ink-faint group-hover:text-[color:var(--v-accent)] transition-colors shrink-0" />
        </div>
      </div>
    </Link>
  );
}
