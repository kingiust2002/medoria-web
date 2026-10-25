// lib/notify/record.js — remember what happened to the Telegram notice of one request, so a
// notice that never arrived is visible in the panel and in the reminder (not just in a log line).
// Never throws. A table without the migration-32 columns is ignored (the previous behaviour).
//
// Stored: 'sent' | 'failed' | 'skipped' and a short reason class (http_401, network, …):
// never a URL, a token, an error message or any customer text.

export function notifyOutcome(result) {
  if (result?.sent) return { status: "sent", detail: null };
  if (result?.reason === "not_configured") return { status: "skipped", detail: null };
  const detail = String(result?.reason || "error").toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 40) || "error";
  return { status: "failed", detail };
}

export async function recordNotifyResult(db, table, id, result) {
  try {
    if (!db || !id) return false;
    const { status, detail } = notifyOutcome(result);
    const { error } = await db.from(table).update({ notify_status: status, notify_detail: detail }).eq("id", id);
    return !error;
  } catch {
    return false;
  }
}
