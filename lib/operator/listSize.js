// lib/operator/listSize.js — a person's own "rows per page" (N10, round 3). The address stays the whole state of a list: when it names no size, the
// person's default size is used; a size in the address always wins. The hrefs of the list leave the size out only when it equals the person's default
// (listQuery.js `overrides`), so choosing the standard size explicitly still works when a different default is saved. Plain module.
import { PAGE_SIZES, DEFAULT_PAGE_SIZE } from "./listQuery.js";

export const defaultSizeOf = (prefs, list) => {
  const n = Number(prefs?.pageSizes?.[list]);
  return PAGE_SIZES.includes(n) ? n : DEFAULT_PAGE_SIZE;
};
// the search params the reader should parse: the person's default size is added when the address has none
export const withDefaultSize = (sp, defaultSize) => {
  const base = sp && typeof sp === "object" ? sp : {};
  return base.size === undefined && defaultSize !== DEFAULT_PAGE_SIZE ? { ...base, size: String(defaultSize) } : base;
};
