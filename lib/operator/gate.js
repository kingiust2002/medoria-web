// lib/operator/gate.js — SERVER ONLY. The permission check for server actions that do not use the `authed()` helper of their file
// (imports/exports, helpers shared by both panels). Session first (the caller's job), then this: the operation must be allowed for
// the person right now, otherwise the action returns the refusal and the attempt is written to the activity log.
import "server-only";
import { auditEvent } from "@/lib/operator/audit";
import { getAdminClient } from "@/lib/operator/supabaseAdmin";
import { requireAll } from "@/lib/operator/access";

// → null when allowed, else the refusal object to return.
export async function gate(session, panel, operations) {
  const admin = getAdminClient();
  return requireAll({
    session, panel, operations: [].concat(operations),
    audit: (action, meta = {}) => auditEvent({ admin, panel, session, action, ...meta }),
  });
}
