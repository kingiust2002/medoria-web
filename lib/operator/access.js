// lib/operator/access.js — who may do what, asked at the moment of doing it. Plain module (no Next imports; the audit writer is
// passed in) so the whole matrix is unit-tested. Every operator server action, page and data reader asks THIS module; the pure
// rules live in authz.js.
//
//   * the person comes from the verified session (sessionGate): a personal account, or the old single env account, which keeps
//     its previous full power in its own house until personal accounts are switched on;
//   * default closed: no account, no house, no role, no permission = refusal;
//   * a refusal is written to the activity log (`access.denied`, result `rejected`, with the operation) and tells the person;
//   * "needs approval" is a refusal until the approval queue exists (S2f): nothing is half-done.
import { can, decide, HOUSES } from "./authz.js";
import { tr } from "../panel/i18n.js";

export const ACCESS_MESSAGES = {
  denied: tr("اجازهٔ انجام این کار را ندارید."),
  needsApproval: tr("این کار باید تأیید شود و صف تأیید هنوز فعال نیست؛ انجام نشد."),
};

// The old env account is an owner of its own house with nothing to approve (= its behaviour before personal accounts).
const legacyOwner = (panel) => ({ id: null, status: "active", role: "owner", houses: [panel], allow: [], deny: [], approval: { [panel]: [] } });

export function actorOf(session, panel) {
  if (!session || !HOUSES.includes(panel)) return null;
  if (session.user) return session.user;
  if (typeof session.uid === "string") return null;        // claims to be a person but was not resolved: nobody
  return legacyOwner(panel);
}

// null = allowed now; otherwise the refusal to return from the action ({ ok:false, denied:true, error }).
// `audit(action, meta)` is optional and never throws into the caller.
export async function requireOperation({ session, panel, operation, audit }) {
  const decision = decide(actorOf(session, panel), panel, operation);
  if (decision.mode === "direct") return null;
  try { await audit?.("access.denied", { result: "rejected", detail: { reason: operation, method: decision.mode } }); } catch { /* the refusal stands */ }
  return { ok: false, denied: true, error: decision.mode === "approval" ? ACCESS_MESSAGES.needsApproval : ACCESS_MESSAGES.denied };
}

// All of several operations (e.g. a product edit that also changes the price).
export async function requireAll({ session, panel, operations, audit }) {
  for (const operation of operations) {
    const refusal = await requireOperation({ session, panel, operation, audit });
    if (refusal) return refusal;
  }
  return null;
}

// For pages and readers: may this person see this resource, e.g. "products.view", "quotes.view", "audit.view"?
export function mayView(session, panel, rel) {
  const actor = actorOf(session, panel);
  return Boolean(actor) && can(actor, `${panel}.${rel}`);
}
// Any permission of the house (the dashboard, settings): used to build menus
export function permissionsOf(session, panel, rels) {
  return Object.fromEntries(rels.map((r) => [r, mayView(session, panel, r)]));
}
