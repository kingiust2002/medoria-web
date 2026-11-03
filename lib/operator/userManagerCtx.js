// lib/operator/userManagerCtx.js — SERVER ONLY. The context the "people" server actions of BOTH panels hand to userActionsCore.js:
// the admin client, the session, the activity-log writer bound to this panel, and the manager's RE-AUTHENTICATION check
// (their own password and, when they have one, a second-factor code), rate-limited per manager so a stolen open session cannot guess.
import "server-only";
import { auditEvent } from "@/lib/operator/audit";
import { reauthenticate } from "@/lib/operator/selfSecurity";
import { dataKeyFromEnv } from "@/lib/operator/userSecrets";
import { rateLimit } from "@/lib/security/rateLimit";

export function managerCtx({ admin, session, panel }) {
  const audit = (action, meta = {}) => auditEvent({ admin, panel, session, action, ...meta });
  const reauthenticateManager = async ({ password, code }) => {
    if (!(await rateLimit(`usersreauth:${session.user.id}`, { limit: 8, windowMs: 15 * 60_000 })).ok) return { ok: false, error: "tooMany" };
    const r = await reauthenticate(admin, { userId: session.user.id, password, code, key: dataKeyFromEnv() });
    return r.ok ? { ok: true } : { ok: false, error: r.error };      // never hand the loaded account row (it holds the hash) to the caller
  };
  return { admin, session, audit, panel, reauthenticate: reauthenticateManager };
}
