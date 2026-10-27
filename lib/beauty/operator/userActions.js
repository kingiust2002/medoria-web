"use server";
// lib/beauty/operator/userActions.js — Beauty panel: the "people" screen (create / change / reset password / end sessions).
// Session check first, then the permission to manage accounts (users.manage), then the shared work in userActionsCore.js.
// The Health panel has its own copy of this file (its own session, its own house).
import { getSession } from "@/lib/beauty/operator/auth";
import { getAdminClient } from "@/lib/operator/supabaseAdmin";
import { auditEvent } from "@/lib/operator/audit";
import { requireUsersManage } from "@/lib/operator/access";
import * as core from "@/lib/operator/userActionsCore";
import { tr } from "../../panel/i18n.js";

const NO_SESSION = { ok: false, error: tr("نشست معتبر نیست. دوباره وارد شوید.") };

async function authedManager() {
  const session = await getSession();
  if (!session) return NO_SESSION;
  const admin = getAdminClient();
  if (!admin) return { ok: false, error: tr("کلید سرویس Supabase تنظیم نشده است (SUPABASE_SERVICE_ROLE_KEY).") };
  const audit = (action, meta = {}) => auditEvent({ admin, panel: "beauty", session, action, ...meta });
  const refusal = await requireUsersManage({ session, panel: "beauty", audit });
  if (refusal) return refusal;
  return { ok: true, ctx: { admin, session, audit, panel: "beauty" } };
}

export async function createPerson(input) {
  const a = await authedManager();
  if (!a.ok) return a;
  return core.createPerson(a.ctx, input);
}

export async function updatePerson(id, change, expectedVersion) {
  const a = await authedManager();
  if (!a.ok) return a;
  return core.updatePerson(a.ctx, id, change, expectedVersion);
}

export async function resetPersonPassword(id) {
  const a = await authedManager();
  if (!a.ok) return a;
  return core.resetPersonPassword(a.ctx, id);
}

export async function endPersonSessions(id) {
  const a = await authedManager();
  if (!a.ok) return a;
  return core.endPersonSessions(a.ctx, id);
}
