"use server";
// lib/beauty/operator/publishRuleActions.js — Beauty panel: save the publish quality rule. Session first (this panel's own), then the shared work.
import { getSession } from "@/lib/beauty/operator/auth";
import { warehouseCtx } from "@/lib/warehouse/panelCtx";
import { savePublishRules } from "@/lib/operator/publishRulesCore";

export async function savePublishRulesAction(rules, expectedVersion) {
  const session = await getSession();
  const a = await warehouseCtx("beauty", async () => session);
  return a.ok ? savePublishRules(a.ctx, rules, expectedVersion) : a;
}
