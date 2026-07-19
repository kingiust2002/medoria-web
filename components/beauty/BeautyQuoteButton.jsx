// components/beauty/BeautyQuoteButton.jsx — client trigger that opens the
// Beauty quotation modal from the (server-rendered) product page. Kept tiny so
// the page stays a server component and only this island ships JS.
"use client";
import { useState } from "react";
import Icon from "@/components/shared/Icon";
import BeautyQuoteModal from "./BeautyQuoteModal";

export default function BeautyQuoteButton({ product, lang, label }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn-primary size-lg w-full">
        <Icon name="invoice" size={17} /> {label}
      </button>
      {open && <BeautyQuoteModal product={product} lang={lang} onClose={() => setOpen(false)} />}
    </>
  );
}
