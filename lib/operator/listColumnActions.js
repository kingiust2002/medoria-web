"use server";
// lib/operator/listColumnActions.js — health panel: save / reset the signed-in person's own columns for a list. Session first (this panel's own), then the shared work.
import { getSession } from "@/lib/operator/auth";
import { warehouseCtx } from "@/lib/warehouse/panelCtx";
import { saveColumns, resetColumns } from "@/lib/operator/listColumnsCore";

export async function saveListColumns(list, columns) {
  const session = await getSession();
  const a = await warehouseCtx("health", async () => session);
  return a.ok ? saveColumns(a.ctx, list, columns) : a;
}

export async function resetListColumns(list) {
  const session = await getSession();
  const a = await warehouseCtx("health", async () => session);
  return a.ok ? resetColumns(a.ctx, list) : a;
}
