// lib/beauty/revalidate.js — purge the Beauty public caches after an operator edit or a scheduled change. Server-only (next/cache).
import { revalidatePath, revalidateTag } from "next/cache";
import { LOCALES } from "@/lib/i18n";

export function revalidateBeautyPublic(slug) {
  try {
    // Bust the persistent Data Cache (lib/beauty/catalog.js) alongside the
    // route revalidation below, so panel edits show up immediately instead of
    // waiting out each cache's own window.
    revalidateTag("beauty-categories");
    revalidateTag("beauty-brands");
    // The product count gates whether Beauty is indexable at all
    // (lib/beauty/seo.js), so adding the product that crosses the threshold
    // should open the vertical on the next request, not five minutes later.
    revalidateTag("beauty-products");
    for (const l of LOCALES) {
      revalidatePath(`/beauty/${l}`);
      revalidatePath(`/beauty/${l}/catalog`);
      revalidatePath(`/beauty/${l}/worlds`);
      revalidatePath(`/beauty/${l}/brands`);
      if (slug) revalidatePath(`/beauty/${l}/catalog/${slug}`);
    }
    if (!slug) revalidatePath("/beauty/[lang]/catalog/[slug]", "page");
  } catch { /* dynamic routes — no-op */ }
}
