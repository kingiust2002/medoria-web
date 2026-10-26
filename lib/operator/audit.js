// lib/operator/audit.js — SERVER ONLY. Connects the activity log (security.js) to a request:
// reads the client address from the request headers (stored only as a keyed hash) and the
// session id from the verified session. Used by every operator action.
import "server-only";
import { headers } from "next/headers";
import { writeAudit } from "@/lib/operator/security";

export const SESSION_SECRET_ENV = { health: "OPERATOR_SESSION_SECRET", beauty: "BEAUTY_OPERATOR_SESSION_SECRET" };

export async function requestIp() {
  try {
    const h = await headers();
    const real = h.get("x-real-ip");
    if (real && real.trim()) return real.trim();
    return (h.get("x-forwarded-for") || "").split(",")[0].trim() || "";
  } catch {
    return "";   // outside a request (tests, scripts)
  }
}

// One entry. Never throws. Returns { ok } | { ok:false, unavailable? }.
export async function auditEvent({ admin, panel, session, ...entry }) {
  return writeAudit(admin, { panel, sid: session?.sid, ip: await requestIp(), secret: process.env[SESSION_SECRET_ENV[panel]], ...entry });
}

// For the shared helpers in quoteDelete.js: an `audit(entry)` bound to one panel.
export function makeAudit(panel, getSession, getAdminClient) {
  return async (entry) => auditEvent({ admin: getAdminClient(), panel, session: await getSession(), ...entry });
}
