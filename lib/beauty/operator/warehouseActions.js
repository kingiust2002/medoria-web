"use server";
// lib/beauty/operator/warehouseActions.js — Beauty panel: the warehouse server actions. Session first (this panel's own), then the shared work in lib/warehouse/actionsCore.js,
// which asks the permission of each operation at the moment of use. The Beauty warehouse is separate data from the other house's.
import { getSession } from "@/lib/beauty/operator/auth";
import { warehouseCtx } from "@/lib/warehouse/panelCtx";
import * as core from "@/lib/warehouse/actionsCore";

const ctxFor = () => warehouseCtx("beauty", getSession);

export async function postMovement(input) {
  const a = await ctxFor();
  return a.ok ? core.postMovement(a.ctx, input) : a;
}

export async function reverseMovement(input) {
  const a = await ctxFor();
  return a.ok ? core.reverseMovement(a.ctx, input) : a;
}

export async function reserveStock(input) {
  const a = await ctxFor();
  return a.ok ? core.reserveStock(a.ctx, input) : a;
}

export async function releaseReservation(input) {
  const a = await ctxFor();
  return a.ok ? core.releaseReservation(a.ctx, input) : a;
}

export async function createLocation(input) {
  const a = await ctxFor();
  return a.ok ? core.createLocation(a.ctx, input) : a;
}

export async function updateLocation(id, input, expectedVersion) {
  const a = await ctxFor();
  return a.ok ? core.updateLocation(a.ctx, id, input, expectedVersion) : a;
}
