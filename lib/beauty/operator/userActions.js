"use server";
// lib/beauty/operator/userActions.js — Beauty panel: the "people" screen (create / change / archive / restore / reset password / reset two-step login / end sessions / move responsibilities).
// Session check first, then the permission to manage accounts (users.manage), then the shared work in userActionsCore.js.
// The Health panel has its own copy of this file (its own session, its own house).
import { getSession } from "@/lib/beauty/operator/auth";
import { getAdminClient } from "@/lib/operator/supabaseAdmin";
import { managerCtx } from "@/lib/operator/userManagerCtx";
import { requireUsersManage } from "@/lib/operator/access";
import * as core from "@/lib/operator/userActionsCore";
import { tr } from "../../panel/i18n.js";

const NO_SESSION = { ok: false, error: tr("نشست معتبر نیست. دوباره وارد شوید.") };

async function authedManager() {
  const session = await getSession();
  if (!session) return NO_SESSION;
  const admin = getAdminClient();
  if (!admin) return { ok: false, error: tr("کلید سرویس Supabase تنظیم نشده است (SUPABASE_SERVICE_ROLE_KEY).") };
  const ctx = managerCtx({ admin, session, panel: "beauty" });
  const refusal = await requireUsersManage({ session, panel: "beauty", audit: ctx.audit });
  if (refusal) return refusal;
  return { ok: true, ctx };
}

// Every sensitive action takes the manager's `reauth` ({ password, code }) as its LAST argument; userActionsCore asks for it again on the
// server, whatever the screen did. The screen is a convenience, not a gate.
export async function createPerson(input, reauth) {
  const a = await authedManager();
  if (!a.ok) return a;
  return core.createPerson(a.ctx, input, reauth);
}

export async function updatePerson(id, change, expectedVersion, reauth) {
  const a = await authedManager();
  if (!a.ok) return a;
  return core.updatePerson(a.ctx, id, change, expectedVersion, reauth);
}

export async function archivePerson(id, expectedVersion, reauth) {
  const a = await authedManager();
  if (!a.ok) return a;
  return core.archivePerson(a.ctx, id, expectedVersion, reauth);
}

export async function restorePerson(id, change, expectedVersion, reauth) {
  const a = await authedManager();
  if (!a.ok) return a;
  return core.restorePerson(a.ctx, id, change, expectedVersion, reauth);
}

export async function resetPersonPassword(id, reauth) {
  const a = await authedManager();
  if (!a.ok) return a;
  return core.resetPersonPassword(a.ctx, id, reauth);
}

export async function resetPersonTwoFactor(id, reauth) {
  const a = await authedManager();
  if (!a.ok) return a;
  return core.resetPersonTwoFactor(a.ctx, id, reauth);
}

export async function endPersonSessions(id) {
  const a = await authedManager();
  if (!a.ok) return a;
  return core.endPersonSessions(a.ctx, id);
}

export async function personResponsibilities(id) {
  const a = await authedManager();
  if (!a.ok) return a;
  return core.responsibilitiesOf(a.ctx, id);
}

export async function transferPersonResponsibilities(fromId, toId) {
  const a = await authedManager();
  if (!a.ok) return a;
  return core.transferResponsibilities(a.ctx, fromId, toId);
}
