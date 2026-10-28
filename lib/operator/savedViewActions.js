"use server";
// lib/operator/savedViewActions.js — health panel: save and delete the signed-in person's own list views. Session first (this panel's own), then the shared work.
import { getSession } from "@/lib/operator/auth";
import { warehouseCtx } from "@/lib/warehouse/panelCtx";
import { saveView, deleteView } from "@/lib/operator/savedViewsCore";

export async function saveListView(list, name, params) {
  const session = await getSession();
  const a = await warehouseCtx("health", async () => session);
  return a.ok ? saveView(a.ctx, list, name, params) : a;
}

export async function deleteListView(list, id) {
  const session = await getSession();
  const a = await warehouseCtx("health", async () => session);
  return a.ok ? deleteView(a.ctx, list, id) : a;
}
