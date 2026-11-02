"use server";
// lib/beauty/operator/savedViewActions.js — beauty panel: save and delete the signed-in person's own list views. Session first (this panel's own), then the shared work.
import { getSession } from "@/lib/beauty/operator/auth";
import { warehouseCtx } from "@/lib/warehouse/panelCtx";
import { saveView, deleteView } from "@/lib/operator/savedViewsCore";

export async function saveListView(list, name, params) {
  const session = await getSession();
  const a = await warehouseCtx("beauty", async () => session);
  return a.ok ? saveView(a.ctx, list, name, params) : a;
}

export async function deleteListView(list, id) {
  const session = await getSession();
  const a = await warehouseCtx("beauty", async () => session);
  return a.ok ? deleteView(a.ctx, list, id) : a;
}
