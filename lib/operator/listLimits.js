// lib/operator/listLimits.js — how many rows the list screens of the panels load at once (S5a). The lists filter and sort in the browser, so
// they need their rows in memory: this bounds that, newest first. A list that reaches its bound says so (the quick search at the top of the
// panel searches the whole catalogue on the server, so nothing becomes unreachable). Plain module: shared by the readers and the screens.
export const PRODUCT_LIST_LIMIT = 2000;       // most recently updated products
export const QUOTE_LIST_LIMIT = 1500;         // newest customer requests

// A list that came back with exactly its limit may have more behind it (the notice is shown; at worst it is shown once for a list of exactly that size).
export const mayBeTruncated = (rows, limit) => Array.isArray(rows) && rows.length >= limit;
