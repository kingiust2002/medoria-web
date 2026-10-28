"use server";
// lib/operator/previewActions.js — Health panel: the server action behind the "preview on the site" button of the product form.
import { getSession } from "@/lib/operator/auth";
import { getAdminClient } from "@/lib/operator/supabaseAdmin";
import { auditEvent } from "@/lib/operator/audit";
import { createPreview } from "@/lib/operator/previewCore";
import { tr } from "../panel/i18n.js";

export async function createProductPreview(id, input) {
  const session = await getSession();
  if (!session) return { ok: false, error: tr("نشست معتبر نیست. دوباره وارد شوید.") };
  const admin = getAdminClient();
  return createPreview({ house: "health", session, id, input, audit: (action, meta = {}) => admin && auditEvent({ admin, panel: "health", session, action, ...meta }) });
}
