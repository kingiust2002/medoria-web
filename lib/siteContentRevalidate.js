// lib/siteContentRevalidate.js — purge the public pages that show the site content after an operator edit. Server-only (next/cache).
// A path that is not a known route must never fail the save itself; the pages also expire by themselves within a few minutes.
import { revalidatePath } from "next/cache";
import { LOCALES } from "@/lib/i18n";

export function revalidateSiteContent(house) {
  const paths = [[`/${house}/[lang]`, "layout"], ...LOCALES.map((l) => [`/${house}/${l}/contact`, undefined])];
  for (const [path, type] of paths) {
    try { type ? revalidatePath(path, type) : revalidatePath(path); } catch { /* see above */ }
  }
}
