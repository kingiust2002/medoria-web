// components/product/ProductDocuments.jsx — the documents of a product on its PUBLIC page (N8). Server-safe markup; the list comes prepared from
// lib/productDocuments.js (published, still valid documents of an active product only).
import Icon from "@/components/shared/Icon";
import { docCopy } from "@/lib/productDocuments";

export default function ProductDocuments({ items, lang }) {
  if (!items?.length) return null;
  const c = docCopy(lang);
  return (
    <section className="mt-6" aria-label={c.heading} data-testid="product-documents">
      <h2 className="font-display text-lg font-bold text-ink mb-3">{c.heading}</h2>
      <ul className="card overflow-hidden divide-y divide-line">
        {items.map((d) => (
          <li key={d.id}>
            <a href={d.href} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 px-4 py-3 min-h-[52px] hover:bg-line-soft focus-ring min-w-0" data-testid="product-document-link">
              <span className="shrink-0 grid place-items-center w-9 h-9 rounded-lg bg-brand-violet/10 text-brand-violet"><Icon name="download" size={16} /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold text-ink break-words">{d.title}</span>
                <span className="block text-[11px] text-ink-muted break-words">{[d.kindLabel, d.meta].filter(Boolean).join(" · ")}</span>
              </span>
              <span className="shrink-0 text-[12px] font-semibold text-brand-violet">{c.open}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
