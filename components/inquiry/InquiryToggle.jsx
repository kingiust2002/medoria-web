// components/inquiry/InquiryToggle.jsx — "Add to inquiry list" / "In your inquiry list" for one product.
"use client";
import { useState } from "react";
import Link from "next/link";
import Icon from "@/components/shared/Icon";
import { useInquiryList } from "@/lib/inquiryList";
import { copyFor } from "@/lib/inquiry/copy";

export default function InquiryToggle({ productId, lang, house = "health", className = "" }) {
  const c = copyFor(lang);
  const { has, add, remove } = useInquiryList(house);
  const [full, setFull] = useState(false);
  const inList = has(productId);

  if (inList) {
    return (
      <div className={`flex items-stretch gap-1.5 ${className}`}>
        <Link href={`/${house}/${lang}/inquiry`} className="btn h-9 flex-1 min-w-0 text-[11px] rounded-lg bg-ok/10 text-ok border border-ok/25 hover:bg-ok/15">
          <Icon name="check" size={13} /> <span className="truncate">{c.inList}</span>
        </Link>
        <button type="button" onClick={() => remove(productId)} aria-label={c.remove} title={c.remove}
          className="btn-ghost h-9 w-9 shrink-0 rounded-lg grid place-items-center"><Icon name="close" size={14} /></button>
      </div>
    );
  }
  return (
    <div className={className}>
      <button type="button" onClick={() => setFull(!add(productId, 1))}
        className="btn h-9 w-full text-[11px] rounded-lg bg-surface text-ink-muted border border-line hover:border-brand-violet/40 hover:text-brand-violet">
        <Icon name="invoice" size={13} /> <span className="truncate">{c.add}</span>
      </button>
      {full && <p role="alert" className="text-[11px] text-warn mt-1">{c.full}</p>}
    </div>
  );
}
