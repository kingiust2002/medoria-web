"use server";
// lib/operator/accountActions.js — Health panel: "my password / my two-step login". Self-service: it needs a personal session, not a
// permission of the catalog (every person looks after their own sign-in), and it works while the account is still "restricted"
// (must change the password / must set up two-step) — that is exactly what unlocks it.
import { getSession } from "@/lib/operator/auth";
import { getAdminClient } from "@/lib/operator/supabaseAdmin";
import { auditEvent } from "@/lib/operator/audit";
import { rateLimit } from "@/lib/security/rateLimit";
import { dataKeyFromEnv } from "@/lib/operator/userSecrets";
import * as core from "@/lib/operator/accountSecurityCore";
import { tr } from "../panel/i18n.js";

const NO_SESSION = { ok: false, error: tr("نشست معتبر نیست. دوباره وارد شوید.") };

async function ctxFor() {
  const session = await getSession();
  if (!session) return NO_SESSION;
  const admin = getAdminClient();
  if (!admin) return { ok: false, error: tr("کلید سرویس Supabase تنظیم نشده است (SUPABASE_SERVICE_ROLE_KEY).") };
  const audit = (action, meta = {}) => auditEvent({ admin, panel: "health", session, action, ...meta });
  const limit = async () => (await rateLimit(`selfsec:${session.user?.id || "legacy"}`, { limit: 10, windowMs: 15 * 60_000 })).ok;
  return { ok: true, ctx: { admin, session, audit, key: dataKeyFromEnv(), limit } };
}

export async function changeMyPassword(input) {
  const a = await ctxFor();
  return a.ok ? core.changeMyPassword(a.ctx, input) : a;
}
export async function startMyTwoStep(input) {
  const a = await ctxFor();
  return a.ok ? core.startMyTwoStep(a.ctx, input) : a;
}
export async function confirmMyTwoStep(input) {
  const a = await ctxFor();
  return a.ok ? core.confirmMyTwoStep(a.ctx, input) : a;
}
export async function disableMyTwoStep(input) {
  const a = await ctxFor();
  return a.ok ? core.disableMyTwoStep(a.ctx, input) : a;
}
export async function newMyRecoveryCodes(input) {
  const a = await ctxFor();
  return a.ok ? core.newMyRecoveryCodes(a.ctx, input) : a;
}
