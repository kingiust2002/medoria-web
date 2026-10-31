// lib/operator/variantActions.js — create / edit one variant of a product, for BOTH houses. Plain module: the action files own the session and
// the permission check and pass `a` = { admin, session, audit, evaluate, file, needsApproval } (the context of `authed(op, { approvable: true })`).
//
// A variant is a product row (migration 44), so it follows the SAME rules as a product: creating one is `products.create` (and `products.publish`
// when it is active), editing it is `products.content` plus `products.price` / `products.stock_flag` / `products.publish` / `products.archive`
// for what really changes; a person whose policy says "needs approval" files a request that carries the whole new row (or only the changed fields
// with their old values, prepared against the version they saw); a newer change is never overwritten; the history keeps before and after.
import { diffRow, productOps } from "./approvalExecutors.js";
import { recordVersion } from "./productVersions.js";
import { conflictInfo, whoOf } from "./productRestoreCore.js";
import { buildVariantRow, optionsKey, VARIANT_LIMITS, VARIANT_MESSAGES } from "./variants.js";

const positive = (v) => { const n = Number(v); return Number.isSafeInteger(n) && n > 0 ? n : null; };
const escapeLike = (s) => String(s).replace(/[\\%_]/g, "\\$&");
const missingColumn = (e) => e && (e.code === "42703" || e.code === "PGRST204" || /variant_(of|options|sort)/.test(String(e.message || "")));

// the database's own refusals (migration 44) in the person's words
export function variantDbError(error) {
  const msg = String(error?.message || error || "");
  if (!error) return VARIANT_MESSAGES.generic;
  if (missingColumn(error)) return VARIANT_MESSAGES.needsMigration;
  if (/variant:parent_is_variant/.test(msg)) return VARIANT_MESSAGES.parentIsVariant;
  if (/variant:parent_missing/.test(msg) || error.code === "23503") return VARIANT_MESSAGES.badParent;
  if (error.code === "23505" || /duplicate key/i.test(msg)) return VARIANT_MESSAGES.skuTaken;
  return VARIANT_MESSAGES.generic;
}

export async function listVariantRows(admin, table, parentId) {
  const { data, error } = await admin.from(table).select("*").eq("variant_of", parentId).order("variant_sort", { ascending: true }).order("id", { ascending: true }).limit(VARIANT_LIMITS.perProduct + 1);
  if (error) return missingColumn(error) ? { ok: false, error: VARIANT_MESSAGES.needsMigration, needsMigration: true } : { ok: false, error: VARIANT_MESSAGES.generic };
  return { ok: true, variants: data || [] };
}

// ctx: { house, table, parentId, variantId (null = new), input, revalidate(slug), uniqueSlug(base) }
export async function saveVariantCore(a, { house, table, parentId, variantId = null, input, revalidate, uniqueSlug }) {
  const pid = positive(parentId);
  if (!pid) return { ok: false, error: VARIANT_MESSAGES.badParent };
  const parentRes = await a.admin.from(table).select("*").eq("id", pid).maybeSingle();
  if (parentRes.error) return { ok: false, error: variantDbError(parentRes.error) };
  if (!parentRes.data) return { ok: false, error: VARIANT_MESSAGES.badParent };
  const parent = parentRes.data;
  if (parent.variant_of != null) return { ok: false, error: VARIANT_MESSAGES.parentIsVariant };

  let existing = null;
  if (variantId != null) {
    const vid = positive(variantId);
    if (!vid) return { ok: false, error: VARIANT_MESSAGES.notFound };
    const got = await a.admin.from(table).select("*").eq("id", vid).eq("variant_of", pid).maybeSingle();
    if (got.error) return { ok: false, error: variantDbError(got.error) };
    if (!got.data) return { ok: false, error: VARIANT_MESSAGES.notFound };
    existing = got.data;
  }

  const built = buildVariantRow(parent, input, existing);
  if (!built.ok) return built;
  const row = built.row;

  // the siblings: a SKU is unique across the whole table (the database enforces it; this gives the friendly answer), and two variants of one
  // product with the same options would be indistinguishable on the page
  const siblings = await a.admin.from(table).select("id,variant_options").eq("variant_of", pid).limit(VARIANT_LIMITS.perProduct + 1);
  if (siblings.error) return { ok: false, error: variantDbError(siblings.error) };
  const others = (siblings.data || []).filter((s) => s.id !== existing?.id);
  if (!existing && others.length >= VARIANT_LIMITS.perProduct) return { ok: false, error: VARIANT_MESSAGES.tooMany };
  if (others.some((s) => optionsKey(s.variant_options) === optionsKey(row.variant_options))) return { ok: false, error: VARIANT_MESSAGES.sameOptions };
  const sameSku = await a.admin.from(table).select("id").ilike("sku", escapeLike(row.sku)).limit(2);
  if (sameSku.error) return { ok: false, error: variantDbError(sameSku.error) };
  if ((sameSku.data || []).some((s) => s.id !== existing?.id)) return { ok: false, error: VARIANT_MESSAGES.skuTaken };

  if (!existing) {
    // creating: a new variant is a new product; one that is live at once is a publication too
    let needsApproval = Boolean(a.needsApproval);
    const ops = ["products.create"];
    if (row.is_active) {
      const ev = await a.evaluate(["products.publish"]);
      if (ev.mode === "denied") return ev.refusal;
      if (ev.mode === "approval") needsApproval = true;
      ops.push("products.publish");
    }
    row.slug = await uniqueSlug(row.slug, null);
    if (needsApproval) {
      return a.file({ operation: "products.create", ops, entity: table, entityId: null, subject: row.sku, before: null, proposed: row, baseUpdatedAt: null });
    }
    const ins = await a.admin.from(table).insert(row).select().single();
    if (ins.error) return { ok: false, error: variantDbError(ins.error) };
    revalidate?.(parent.slug);
    await a.audit("product.variant.create", { entity: table, ids: [ins.data?.id], detail: { parent: pid, options: Object.keys(row.variant_options) } });
    return { ok: true, id: ins.data?.id };
  }

  // editing: the optimistic lock first, then what really changes decides which rights are asked
  const expected = input?.__expectedUpdatedAt;
  if (expected && String(existing.updated_at) !== String(expected)) return conflictInfo(a.admin, house, existing.id, existing);
  const { variant_of: _fixed, slug: _slug, ...patch } = row;             // the parent and the address of an existing variant never change
  const extra = [...productOps(existing, patch)];
  let needsApproval = Boolean(a.needsApproval);
  if (extra.length) {
    const ev = await a.evaluate(extra);
    if (ev.mode === "denied") return ev.refusal;
    if (ev.mode === "approval") needsApproval = true;
  }
  const { changed, old } = diffRow(existing, patch);
  if (!Object.keys(changed).length) return { ok: true, id: existing.id };
  if (needsApproval) {
    return a.file({ operation: "products.content", ops: ["products.content", ...extra], entity: table, entityId: existing.id, subject: existing.sku, before: old, proposed: changed, baseUpdatedAt: existing.updated_at });
  }
  let q = a.admin.from(table).update(changed).eq("id", existing.id).eq("variant_of", pid);
  if (expected) q = q.eq("updated_at", existing.updated_at);
  const upd = await q.select().maybeSingle();
  if (upd.error) return { ok: false, error: variantDbError(upd.error) };
  if (!upd.data) return conflictInfo(a.admin, house, existing.id, existing);
  revalidate?.(parent.slug);
  await recordVersion(a.admin, house, { productId: existing.id, kind: "update", before: old, after: changed, who: whoOf(a.session) });
  await a.audit("product.variant.update", { entity: table, ids: [existing.id], result: "success", before: old, after: changed, detail: { parent: pid, fields: Object.keys(changed) } });
  return { ok: true, id: existing.id };
}
