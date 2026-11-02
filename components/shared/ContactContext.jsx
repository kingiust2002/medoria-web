"use client";
// The contact details of the house a page belongs to, for client components (WhatsApp / Telegram buttons, quote forms, the floating contact menu).
// The house layout reads them once on the server (lib/contactLive.js) and provides them here; outside a layout the built-in defaults apply.
import { createContext, useContext, useMemo } from "react";
import { contactApi } from "@/lib/contactLinks";

const Ctx = createContext(null);

export function ContactProvider({ value, children }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// → { phone, email, whatsapp, telegram, PHONE, EMAIL, WA_NUMBER, TG_USER, waLink(message), tgLink(message) }
export function useContact() {
  const c = useContext(Ctx);
  return useMemo(() => contactApi(c), [c]);
}
