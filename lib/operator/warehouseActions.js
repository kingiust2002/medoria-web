"use server";
// lib/operator/warehouseActions.js — Health panel: the warehouse server actions. Session first (this panel's own), then the shared work in lib/warehouse/actionsCore.js,
// which asks the permission of each operation at the moment of use. The Health warehouse is separate data from the other house's.
import { getSession } from "@/lib/operator/auth";
import { warehouseCtx } from "@/lib/warehouse/panelCtx";
import * as core from "@/lib/warehouse/actionsCore";
import * as counts from "@/lib/warehouse/countsActions";

const ctxFor = () => warehouseCtx("health", getSession);

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

export async function setMinLevel(input) {
  const a = await ctxFor();
  return a.ok ? counts.setMinLevel(a.ctx, input) : a;
}

export async function startCount(input) {
  const a = await ctxFor();
  return a.ok ? counts.startCount(a.ctx, input) : a;
}

export async function saveCounted(input) {
  const a = await ctxFor();
  return a.ok ? counts.saveCounted(a.ctx, input) : a;
}

export async function addCountLine(input) {
  const a = await ctxFor();
  return a.ok ? counts.addCountLine(a.ctx, input) : a;
}

export async function cancelCount(input) {
  const a = await ctxFor();
  return a.ok ? counts.cancelCount(a.ctx, input) : a;
}

export async function closeCount(input) {
  const a = await ctxFor();
  return a.ok ? counts.closeCount(a.ctx, input) : a;
}

export async function exportStockCsv(input) {
  const a = await ctxFor();
  return a.ok ? counts.exportStockCsv(a.ctx, input) : a;
}

export async function exportMovementsCsv(input) {
  const a = await ctxFor();
  return a.ok ? counts.exportMovementsCsv(a.ctx, input) : a;
}

export async function exportCountCsv(input) {
  const a = await ctxFor();
  return a.ok ? counts.exportCountCsv(a.ctx, input) : a;
}
