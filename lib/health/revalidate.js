// lib/health/revalidate.js — purge the Health public caches after an operator edit.
// Server-only (next/cache). The route list lives in revalidateTargets.js.
import { revalidatePath } from "next/cache";
import { LOCALES } from "@/lib/i18n";
import { healthRevalidationTargets } from "@/lib/health/revalidateTargets";

export function revalidateHealthPublic({ slug } = {}) {
  for (const { path, type } of healthRevalidationTargets(LOCALES, slug)) {
    try {
      revalidatePath(path, type);
    } catch {
      /* a path that is not a known route must never fail the save itself */
    }
  }
}
