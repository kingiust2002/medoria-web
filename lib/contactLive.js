// lib/contactLive.js — SERVER ONLY. The contact details a house shows right now: the live "contact" row of the site content (migration 51) over the
// built-in defaults. A failed read, a missing migration or no row at all gives the defaults — a content outage never breaks a public page.
// React's cache() reads it once per request however many components ask.
import "server-only";
import { cache } from "react";
import { getLiveContent } from "@/lib/siteContentPublic";
import { pickContact } from "@/lib/siteContent";
import { EMAIL_HEALTH, EMAIL_BEAUTY } from "@/lib/contact";
import { defaultContact } from "@/lib/contactLinks";

export const getHouseContact = cache(async (house) => {
  const h = house === "beauty" ? "beauty" : "health";
  const rows = await getLiveContent(h, "contact");
  return pickContact(rows, defaultContact(h === "beauty" ? EMAIL_BEAUTY : EMAIL_HEALTH));
});
