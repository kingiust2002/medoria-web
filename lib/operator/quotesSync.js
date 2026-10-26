// lib/operator/quotesSync.js — keeps the Quotes screen's local copy of the list in step with fresh rows from
// the server. The screen edits its copy optimistically (a status changes at once, the server call follows);
// when the server sends new rows (router.refresh(), another session added, changed or removed a request)
// they must reach the screen without undoing an edit that is still on its way.
// Plain module (no React) so it is unit-tested directly.

// local: the screen's rows · server: fresh rows from the server (its order wins) · inflight: Set of ids whose
// own edit/bulk action has not finished. Returns `local` itself when nothing differs (no pointless render).
export function reconcileQuotes(local, server, inflight) {
  const mine = Array.isArray(local) ? local : [];
  const fresh = Array.isArray(server) ? server : [];
  const busy = inflight instanceof Set ? inflight : new Set();
  const localById = new Map(mine.map((r) => [r.id, r]));
  const next = fresh.map((row) => (busy.has(row.id) && localById.has(row.id) ? localById.get(row.id) : row));
  // a row someone else deleted, whose own request is still running, stays until that request ends
  const have = new Set(next.map((r) => r.id));
  for (const r of mine) if (busy.has(r.id) && !have.has(r.id)) next.push(r);
  const same = next.length === mine.length && next.every((r, i) => r === mine[i] || shallowEqual(r, mine[i]));
  return same ? mine : next;
}

// The ticked rows that still exist (same Set back when none were lost).
export function pruneSelection(selected, rows) {
  const ids = new Set((rows || []).map((r) => r.id));
  const keep = [...selected].filter((id) => ids.has(id));
  return keep.length === selected.size ? selected : new Set(keep);
}

function shallowEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => a[k] === b[k] || JSON.stringify(a[k]) === JSON.stringify(b[k]));
}
