"use server";
// lib/operator/preferenceActions.js — health panel: save the signed-in person's own start page and pinned shortcuts. Session first (this panel's own), then the shared work.
import { getSession } from "@/lib/operator/auth";
import { warehouseCtx } from "@/lib/warehouse/panelCtx";
import { savePreferences } from "@/lib/operator/preferencesCore";

export async function savePreferencesAction(input) {
  const session = await getSession();
  const a = await warehouseCtx("health", async () => session);
  return a.ok ? savePreferences(a.ctx, input) : a;
}
