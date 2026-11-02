// lib/ops/ingest.js — storing a report from the server's scripts (N13). Plain module (the client is passed in). The token check lives in the route; the
// time is stamped by the database (migration 52), never taken from the sender.
import { cleanReport, cleanDetail, OPS_MESSAGES } from "./status.js";

const missing = (e) => e && (["42P01", "PGRST205"].includes(e.code) || /ops_status|schema cache|does not exist/i.test(String(e.message || "")));

export async function ingestReport(admin, body) {
  const r = cleanReport(body);
  if (!r.ok) return { ok: false, error: r.error, status: 400 };
  const { error } = await admin.from("ops_status").upsert({ kind: r.kind, status: r.status, detail: r.detail, reported_by: "script" }, { onConflict: "kind" });
  if (error) return { ok: false, error: missing(error) ? OPS_MESSAGES.unavailable : OPS_MESSAGES.generic, status: missing(error) ? 503 : 500 };
  return { ok: true, kind: r.kind, status: r.status };
}

// The main manager says they RECEIVED the deliberate test alert. Stored as a statement (who, when — the database's clock, and a short note).
export async function confirmAlert(admin, { label, note }) {
  const test = await admin.from("ops_status").select("kind,reported_at").eq("kind", "alert_test").maybeSingle();
  if (test.error) return { ok: false, error: missing(test.error) ? OPS_MESSAGES.unavailable : OPS_MESSAGES.generic };
  if (!test.data) return { ok: false, error: OPS_MESSAGES.noTest };
  const raw = note == null ? "" : String(note);
  if (raw.length > 120) return { ok: false, error: OPS_MESSAGES.note };
  const text = cleanDetail(raw, 120);
  const { error } = await admin.from("ops_status").upsert({ kind: "alert_confirmed", status: "confirmed", detail: text, reported_by: cleanDetail(label, 80) || "owner" }, { onConflict: "kind" });
  return error ? { ok: false, error: OPS_MESSAGES.generic } : { ok: true };
}

export async function readOpsRows(admin) {
  const { data, error } = await admin.from("ops_status").select("kind,status,reported_at,last_pass_at,detail,reported_by");
  if (error) return { ok: false, error: missing(error) ? OPS_MESSAGES.unavailable : OPS_MESSAGES.generic, needsMigration: Boolean(missing(error)) };
  return { ok: true, rows: data || [] };
}
