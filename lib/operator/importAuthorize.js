// lib/operator/importAuthorize.js — who may let an import / bulk-add batch change WHAT (review R5). The engine (importRun.js) works out the operations the rows really
// need (products.create, products.content, products.price, products.publish, products.archive, products.stock_flag, categories.create) and asks the function made here
// before it writes anything. Plain module.
//   direct import      — the signed-in person: every operation must be "direct"; one that needs approval makes the whole file an approval request
//                        (nothing is written), one that is denied refuses the file;
//   approved import    — the REQUESTER as they are now: an operation that needed approval is satisfied by this approval, an operation they may no longer
//                        do at all (a right taken away since) refuses the run. The reviewer's own rights are never borrowed.
import { actorOf } from "./access.js";
import { decide } from "./authz.js";

// → async (ops) => { ok: true } | { ok: false, kind: "approval" | "denied", ops: [the operations in question] }
export function makeImportAuthorizer({ session = null, panel, requester = null, audit = null }) {
  const approved = Boolean(requester);
  return async (ops) => {
    const actor = approved ? (requester.status === "active" && requester.houses?.includes(panel) ? requester : null) : actorOf(session, panel);
    const modes = (ops || []).map((op) => [op, decide(actor, panel, op).mode]);
    const denied = modes.filter(([, m]) => m === "denied").map(([op]) => op);
    if (denied.length) {
      try { await audit?.("access.denied", { result: "rejected", detail: { reason: denied.join(","), method: "denied" } }); } catch { /* the refusal stands */ }
      return { ok: false, kind: "denied", ops: denied };
    }
    const waiting = modes.filter(([, m]) => m === "approval").map(([op]) => op);
    if (waiting.length && !approved) return { ok: false, kind: "approval", ops: waiting };
    return { ok: true };
  };
}
