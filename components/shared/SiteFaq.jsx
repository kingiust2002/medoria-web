// components/shared/SiteFaq.jsx — the FAQ of a house (server component). Renders nothing unless at least one item is live. Server-rendered
// <details> (works with JS off, crawlable) plus schema.org FAQPage for exactly the items shown.
import { getLiveContent } from "@/lib/siteContentPublic";
import { pickFaq, faqJsonLd } from "@/lib/siteContent";
import { safeJsonLd } from "@/lib/seo";

const HEADING = { tg: "Саволҳои маъмул", ru: "Частые вопросы", en: "Frequently asked questions", fa: "پرسش‌های متداول" };

export default async function SiteFaq({ house, lang }) {
  const items = pickFaq(await getLiveContent(house, "faq"), lang);
  if (!items.length) return null;
  const ld = faqJsonLd(items);
  return (
    <section data-testid="site-faq" aria-labelledby="site-faq-h" className="py-12 sm:py-16 border-t border-line">
      <div className="container-x max-w-3xl">
        <h2 id="site-faq-h" className="text-xl sm:text-2xl font-bold text-ink mb-6">{HEADING[lang] || HEADING.en}</h2>
        <div className="divide-y divide-line border-y border-line">
          {items.map((i) => (
            <details key={i.id} className="group py-3" data-testid="site-faq-item">
              <summary className="cursor-pointer list-none flex items-start justify-between gap-4 font-medium text-ink [overflow-wrap:anywhere]">
                <span>{i.q}</span>
                <span aria-hidden="true" className="shrink-0 text-ink-muted transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft whitespace-pre-line [overflow-wrap:anywhere]">{i.a}</p>
            </details>
          ))}
        </div>
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(ld) }} />
    </section>
  );
}
