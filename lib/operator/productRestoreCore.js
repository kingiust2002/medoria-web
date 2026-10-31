// lib/operator/productRestoreCore.js — "revert this change" and the conflict answer, for BOTH houses. Plain module: the action files own the
// session / permission check and pass `a` = { admin, session, audit, evaluate, file, needsApproval }.
import { diffRow, productOps } from "./approvalExecutors.js";
import { gateOne } from "./publishGate.js";
import { getVersion, listVersions, recordVersion, revertPlan, VERSION_MESSAGES } from "./productVersions.js";

export const whoOf = (session) => ({ userId: session?.user?.id ?? null, label: session?.user?.username || session?.username || "operator" });

// Somebody saved the product after this screen was loaded. → the refusal to return (nothing was written)
export async function conflictInfo(admin, panel, productId, current) {
  let lastChange = null;
  try {
    const v = await listVersions(admin, panel, productId, 1);
    const last = v.ok ? v.versions[0] : null;
    if (last) lastChange = { at: last.created_at, who: last.actor_label || "", kind: last.kind, fields: last.changed || [] };
  } catch { /* the answer still says "changed" */ }
  return { ok: false, conflict: true, error: VERSION_MESSAGES.conflict, currentUpdatedAt: current?.updated_at ?? null, lastChange };
}

// Reverts one recorded change. `expectedUpdatedAt` (optional) is the version of the product the person was looking at.
export async function restoreVersion(a, { panel, table, productId, versionId, expectedUpdatedAt, revalidate }) {
  const vid = Number(versionId);
  if (!Number.isInteger(vid) || vid <= 0) return { ok: false, error: VERSION_MESSAGES.notFound };
  const got = await getVersion(a.admin, panel, productId, vid);
  if (!got.ok) return got;
  const { data: current, error } = await a.admin.from(table).select("*").eq("id", productId).maybeSingle();
  if (error || !current) return { ok: false, error: VERSION_MESSAGES.notFound };
  if (expectedUpdatedAt && String(current.updated_at) !== String(expectedUpdatedAt)) return conflictInfo(a.admin, panel, productId, current);

  const plan = revertPlan(current, got.version);
  if (!Object.keys(plan.fields).length) return { ok: false, error: VERSION_MESSAGES.nothing };
  const merged = { ...current, ...plan.fields };
  const blocked = await gateOne({ admin: a.admin, house: panel, before: current, after: merged });      // reverting may make the product public again: the same publish rule
  if (blocked) return blocked;
  const extra = [...productOps(current, merged)];
  let needsApproval = Boolean(a.needsApproval);
  if (extra.length) {
    const ev = await a.evaluate(extra);
    if (ev.mode === "denied") return ev.refusal;
    if (ev.mode === "approval") needsApproval = true;
  }
  const { changed, old } = diffRow(current, merged);
  if (needsApproval) {
    return a.file({
      operation: "products.content", ops: ["products.content", "products.restore_version", ...extra], entity: table, entityId: productId,
      subject: current.sku || current.name_en || current.name_fa, before: old, proposed: changed, baseUpdatedAt: current.updated_at, reason: `restore #${vid}`,
    });
  }
  const res = await a.admin.from(table).update(plan.fields).eq("id", productId).eq("updated_at", current.updated_at).select().maybeSingle();
  if (res.error) return { ok: false, error: VERSION_MESSAGES.conflict };
  if (!res.data) return conflictInfo(a.admin, panel, productId, (await a.admin.from(table).select("updated_at").eq("id", productId).maybeSingle()).data || current);
  if (revalidate) revalidate(res.data.slug);
  await recordVersion(a.admin, panel, { productId, kind: "restore", before: old, after: changed, who: whoOf(a.session), revertsId: vid });
  await a.audit("product.restore", { entity: table, ids: [productId], result: "success", before: old, after: changed, detail: { version: vid, fields: Object.keys(changed) } });
  return { ok: true, fields: Object.keys(changed), changedSince: plan.changedSince };
}
