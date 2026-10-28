"use server";
// lib/beauty/operator/documentActions.js — Beauty panel: the product-document actions (N8). Session first (this panel's own), then the shared work in lib/operator/documentsCore.js.
import { getSession } from "@/lib/beauty/operator/auth";
import { warehouseCtx } from "@/lib/warehouse/panelCtx";
import * as core from "@/lib/operator/documentsCore";
import { revalidateBeautyPublic } from "@/lib/beauty/revalidate";

async function ctxFor() {
  const session = await getSession();
  const a = await warehouseCtx("beauty", async () => session);
  return a.ok ? { ok: true, ctx: { ...a.ctx, revalidate: () => revalidateBeautyPublic() } } : a;
}

export async function addProductDocument(productId, formData) {
  const a = await ctxFor();
  return a.ok ? core.addDocument(a.ctx, productId, formData) : a;
}

export async function updateProductDocument(id, input, expectedVersion) {
  const a = await ctxFor();
  return a.ok ? core.updateDocument(a.ctx, id, input, expectedVersion) : a;
}

export async function setProductDocumentPublished(id, publish, expectedVersion) {
  const a = await ctxFor();
  return a.ok ? core.setDocumentPublished(a.ctx, id, publish, expectedVersion) : a;
}

export async function deleteProductDocument(id, expectedVersion) {
  const a = await ctxFor();
  return a.ok ? core.deleteDocument(a.ctx, id, expectedVersion) : a;
}
