"use server";
// lib/beauty/operator/opsActions.js — beauty panel: the main manager says they RECEIVED the deliberate test alert (N13). Session first, then the global right users.manage; the statement is
// stored with their name and the database's clock, and written to the activity log. It is never shown as verified.
import { getSession } from "@/lib/beauty/operator/auth";
import { warehouseCtx } from "@/lib/warehouse/panelCtx";
import { requireUsersManage } from "@/lib/operator/access";
import { confirmAlert } from "@/lib/ops/ingest";

export async function confirmAlertReceived(note) {
  const session = await getSession();
  const a = await warehouseCtx("beauty", async () => session);
  if (!a.ok) return a;
  const refusal = await requireUsersManage({ session: a.ctx.session, panel: "beauty", audit: a.ctx.audit });
  if (refusal) return refusal;
  const label = a.ctx.session.user?.username || "owner";
  const res = await confirmAlert(a.ctx.admin, { label, note });
  try { await a.ctx.audit("ops.alert_confirmed", { entity: "ops_status", result: res.ok ? "success" : "failure" }); } catch { /* the row records who */ }
  return res;
}
