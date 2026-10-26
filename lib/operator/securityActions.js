"use server";
// lib/operator/securityActions.js — Health panel: end other sessions / all sessions.
// Session check first, this panel's rows only (the Beauty panel has its own copy of this file).
import { getSession } from "@/lib/operator/auth";
import { getAdminClient } from "@/lib/operator/supabaseAdmin";
import { revokeSessions } from "@/lib/operator/security";
import { auditEvent } from "@/lib/operator/audit";

const NO_SESSION = { ok: false, error: "نشست معتبر نیست. دوباره وارد شوید." };

export async function revokeOtherSessions() {
  const session = await getSession();
  if (!session) return NO_SESSION;
  const admin = getAdminClient();
  const r = await revokeSessions(admin, { panel: "health", exceptSid: session.sid });
  if (!r.ok) return { ok: false, error: "ابطال نشست‌ها ناموفق بود." };
  await auditEvent({ admin, panel: "health", session, action: "auth.sessions_revoked", count: r.count, detail: { kept: "this" } });
  return { ok: true, count: r.count };
}

export async function revokeAllSessions() {
  const session = await getSession();
  if (!session) return NO_SESSION;
  const admin = getAdminClient();
  await auditEvent({ admin, panel: "health", session, action: "auth.sessions_revoked", detail: { kept: "none" } });
  const r = await revokeSessions(admin, { panel: "health" });
  if (!r.ok) return { ok: false, error: "ابطال نشست‌ها ناموفق بود." };
  return { ok: true, count: r.count, loggedOut: true };
}
