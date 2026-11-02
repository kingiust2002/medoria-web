// lib/operator/gate.js — SERVER ONLY. The permission check for server actions that do not use the `authed()` helper of their file
// (imports/exports, helpers shared by both panels). Session first (the caller's job), then this: the operation must be allowed for
// the person right now, otherwise the action returns the refusal and the attempt is written to the activity log.
import "server-only";
import { auditEvent } from "@/lib/operator/audit";
import { getAdminClient } from "@/lib/operator/supabaseAdmin";
import { requireAll, evaluateAll } from "@/lib/operator/access";

// → null when allowed, else the refusal object to return.
export async function gate(session, panel, operations) {
  const admin = getAdminClient();
  return requireAll({
    session, panel, operations: [].concat(operations),
    audit: (action, meta = {}) => auditEvent({ admin, panel, session, action, ...meta }),
  });
}

// For the read-only helpers of an action that can file a change request (the import screens: read a file, dry run, template, SKU check): allowed when the
// person may do it directly OR may ask for it to be approved; only "denied" is a refusal. Writing is still gate()'s business.
export async function gateAsk(session, panel, operations) {
  const admin = getAdminClient();
  const ev = await evaluateAll({
    session, panel, operations: [].concat(operations),
    audit: (action, meta = {}) => auditEvent({ admin, panel, session, action, ...meta }),
  });
  return ev.mode === "denied" ? ev.refusal : null;
}
