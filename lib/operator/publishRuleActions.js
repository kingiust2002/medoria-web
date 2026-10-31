"use server";
// lib/operator/publishRuleActions.js — Health panel: save the publish quality rule. Session first (this panel's own), then the shared work.
import { getSession } from "@/lib/operator/auth";
import { warehouseCtx } from "@/lib/warehouse/panelCtx";
import { savePublishRules } from "@/lib/operator/publishRulesCore";

export async function savePublishRulesAction(rules, expectedVersion) {
  const session = await getSession();
  const a = await warehouseCtx("health", async () => session);
  return a.ok ? savePublishRules(a.ctx, rules, expectedVersion) : a;
}
