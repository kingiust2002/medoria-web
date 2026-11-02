"use server";
// lib/beauty/operator/preferenceActions.js — beauty panel: save the signed-in person's own start page and pinned shortcuts. Session first (this panel's own), then the shared work.
import { getSession } from "@/lib/beauty/operator/auth";
import { warehouseCtx } from "@/lib/warehouse/panelCtx";
import { savePreferences } from "@/lib/operator/preferencesCore";

export async function savePreferencesAction(input) {
  const session = await getSession();
  const a = await warehouseCtx("beauty", async () => session);
  return a.ok ? savePreferences(a.ctx, input) : a;
}
