// lib/operator/importApproved.js — applying an APPROVED import request (N12). The rows were validated when the request was filed, but they are planned and
// written again NOW, in chunks, by the same engine and rules as a direct import (the engine is passed in: it is server-only). Plain module.
//   → { ok: true, counts: { total, create, update, skip, error }, createdCategories } | { ok: false }
import { MAX_ROWS_PER_CALL } from "./importCore.js";

const ZERO = () => ({ total: 0, create: 0, update: 0, skip: 0, error: 0 });

//   `run` = { authorize, bases, recordAs } from the executor: the REQUESTER's current rights (never the reviewer's), the versions the reviewer saw, who the history names.
//   A chunk that fails stops the run (what earlier chunks wrote stays and is reported: `done`), rows changed since the review are reported (`staleIds`), never overwritten.
export async function runApprovedImport({ rows, options = {}, fileName = null }, { processProductBatch, recordImportLog }, run = {}) {
  if (!Array.isArray(rows) || !rows.length) return { ok: false };
  const counts = ZERO();
  const created = new Set();
  const staleIds = [], failedRows = [];
  for (let i = 0; i < rows.length; i += MAX_ROWS_PER_CALL) {
    const chunk = rows.slice(i, i + MAX_ROWS_PER_CALL);
    const res = await processProductBatch(chunk, { ...options, dryRun: false, startRow: 1, authorize: run.authorize, requireBases: true, bases: run.bases, recordAs: run.recordAs });
    if (!res?.ok || res.aborted) return { ok: false, counts, done: { create: counts.create, update: counts.update }, staleIds, failedRows, reason: res?.denied ? "denied" : res?.needsApproval ? "approval" : "failed" };
    for (const k of Object.keys(counts)) counts[k] += Number(res.counts?.[k]) || 0;
    for (const c of res.createdCategories || []) created.add(c);
    for (const r of res.results || []) {
      if (r.stale && r.id != null) staleIds.push(r.id);
      else if (r.status === "error") failedRows.push(i + (Number(r.rowNum) || 0));
    }
  }
  try {
    await recordImportLog({
      source: "approval", fileName, mode: options.mode || "add", total: counts.total, create: counts.create, update: counts.update, skip: counts.skip, error: counts.error,
      categoriesCreated: created.size, summary: null,
    });
  } catch { /* the history is best effort, as for a direct import */ }
  return { ok: true, counts, createdCategories: [...created], staleIds, failedRows };
}
