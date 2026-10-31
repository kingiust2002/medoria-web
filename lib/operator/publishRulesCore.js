// lib/operator/publishRulesCore.js — saving the publish quality rule of ONE house (N6). The action files own the session; they pass
// ctx = { admin, session, panel, audit, require } (the warehouse context). The right: products.rules (operation "products.publish_rules"),
// direct only — a rule that decides what may go public is never a request waiting for someone else.
// Optimistic lock: the `version` the screen showed must still be current; the first save creates the row (version 1).
import { cleanRules, PUBLISH_MESSAGES } from "./publishRules.js";
import { readRules } from "./publishGate.js";

const whoOf = (ctx) => {
  const u = ctx.session?.user;
  return { id: u?.id ?? null, label: String(u?.username || ctx.session?.username || "operator").slice(0, 80) };
};

export async function savePublishRules(ctx, rules, expectedVersion) {
  const refusal = await ctx.require("products.publish_rules");
  if (refusal) return refusal;
  const clean = cleanRules(rules);
  if (!clean.ok) return clean;
  const ver = Number(expectedVersion);
  if (!Number.isInteger(ver) || ver < 0) return { ok: false, error: PUBLISH_MESSAGES.conflict };
  const cur = await readRules(ctx.admin, ctx.panel);
  if (cur.state === "none") return { ok: false, error: PUBLISH_MESSAGES.notReady };
  if (cur.state === "error") return { ok: false, error: PUBLISH_MESSAGES.generic };
  if (cur.version !== ver) return { ok: false, error: PUBLISH_MESSAGES.conflict, conflict: true };
  const who = whoOf(ctx);
  let row = null, error = null;
  if (cur.version === 0) {
    ({ data: row, error } = await ctx.admin.from("publish_rules").insert({ house: ctx.panel, blocking: clean.rules, updated_by: who.id, updated_label: who.label }).select("version,blocking,updated_at").single());
    if (error?.code === "23505") return { ok: false, error: PUBLISH_MESSAGES.conflict, conflict: true };       // somebody created it first
  } else {
    const res = await ctx.admin.from("publish_rules").update({ blocking: clean.rules, updated_by: who.id, updated_label: who.label }).eq("house", ctx.panel).eq("version", ver).select("version,blocking,updated_at");
    error = res.error; row = res.data?.[0] ?? null;
    if (!error && !row) return { ok: false, error: PUBLISH_MESSAGES.conflict, conflict: true };
  }
  if (error || !row) {
    try { await ctx.audit("publish_rules.update", { entity: "publish_rules", result: "failure" }); } catch { /* nothing changed */ }
    return { ok: false, error: PUBLISH_MESSAGES.generic };
  }
  try { await ctx.audit("publish_rules.update", { entity: "publish_rules", result: "success", before: { rules: cur.rules }, after: { rules: clean.rules }, detail: { count: clean.rules.length } }); } catch { /* the row records who changed it last */ }
  return { ok: true, rules: clean.rules, version: row.version };
}
