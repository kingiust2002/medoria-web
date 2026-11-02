// components/beauty/BeautyVariantBuy.jsx — the price / inquiry card of a Beauty product that has variants: the visitor picks one and the
// price, SKU, stock, picture and every request (WhatsApp, Telegram, quotation) follow that variant. Products without variants keep the
// server-rendered card of the page; this island exists only when there is something to choose.
"use client";
import { useMemo, useState } from "react";
import Icon from "@/components/shared/Icon";
import VariantPicker from "@/components/product/VariantPicker";
import BeautyQuoteButton from "@/components/beauty/BeautyQuoteButton";
import { beautyImageUrl } from "@/lib/beauty/catalog";
import { productInquiryMessage } from "@/lib/whatsapp";
import { isOnRequest, formatPrice } from "@/lib/price";
import { defaultVariant, variantView } from "@/lib/operator/variants";
import { useContact } from "@/components/shared/ContactContext";

export default function BeautyVariantBuy({ product: parent, variants, lang, pageUrl, copy: c }) {
  const { waLink, tgLink } = useContact();
  const [chosen, setChosen] = useState(() => defaultVariant(variants));
  const product = useMemo(() => variantView(parent, chosen), [parent, chosen]);
  const onRequest = isOnRequest(product);
  const inquiry = productInquiryMessage(product, lang, { url: pageUrl });
  const ownImage = chosen?.image_url && chosen.image_url !== parent.image_url ? beautyImageUrl(chosen.image_url) : null;
  return (
    <div className="card p-5 mb-6" data-testid="variant-buy">
      <VariantPicker variants={variants} selected={chosen} onSelect={setChosen} lang={lang} className="mb-5" />
      <div className="flex items-end justify-between gap-4 mb-4">
        <div className="min-w-0">
          <div className={`font-bold ${onRequest ? "text-[color:var(--v-accent)] text-xl" : "text-ink text-3xl"}`}>
            {onRequest ? c.requestPrice : formatPrice(product.price)}
          </div>
          {!onRequest && product.unit && <div className="text-[12px] text-ink-faint mt-1">/ {product.unit}</div>}
          <div className="text-[12px] text-ink-faint mt-1 break-all" dir="ltr">{c.sku}: <b className="text-ink-muted">{product.sku}</b></div>
          <span className={`tag mt-2 inline-block ${product.in_stock ? "bg-ok/10 text-ok" : "bg-line-soft text-ink-faint"}`}>{product.in_stock ? c.inStock : c.outStock}</span>
        </div>
        {ownImage && <img src={ownImage} alt="" className="w-16 h-16 rounded-lg object-cover border border-line shrink-0" />}
      </div>
      <div className="flex flex-col sm:flex-row gap-2.5">
        <a href={waLink(inquiry)} target="_blank" rel="noopener noreferrer" className="btn-wa size-lg flex-1"><Icon name="chat" size={17} /> {c.ask}</a>
        <a href={tgLink(inquiry)} target="_blank" rel="noopener noreferrer" className="btn-tg size-lg flex-1"><Icon name="send" size={17} /> {c.askTg}</a>
      </div>
      <div className="mt-2.5"><BeautyQuoteButton key={product.id} product={product} lang={lang} label={c.requestQuote} /></div>
    </div>
  );
}
