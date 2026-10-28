// lib/ops/systemData.js — SERVER ONLY. Everything the System status screen shows, gathered when the page opens: what the app checks itself (database,
// migrations, settings) and what the server's scripts reported (migration 52). A part that cannot be read says so; nothing is assumed.
import "server-only";
import { getAdminClient } from "@/lib/operator/supabaseAdmin";
import { mayGlobal } from "@/lib/operator/access";
import { readOpsRows } from "@/lib/ops/ingest";
import { opsOverview } from "@/lib/ops/status";
import { databaseProbe, migrationProbes, configChecks } from "@/lib/operator/systemChecks";

export async function loadSystemStatus(session, panel) {
  const admin = getAdminClient();
  const config = configChecks(process.env);
  const canConfirm = mayGlobal(session, panel, "users.manage");
  if (!admin) return { ok: true, now: new Date().toISOString(), db: { state: "failed", ms: 0 }, migrations: [], config, canConfirm, reports: { ok: false, error: null, overview: opsOverview([]) } };
  const [db, migrations, reports] = await Promise.all([databaseProbe(admin), migrationProbes(admin), readOpsRows(admin)]);
  const overview = opsOverview(reports.ok ? reports.rows : []);
  return {
    ok: true, now: new Date().toISOString(), db, migrations, config, canConfirm,
    reports: { ok: reports.ok, error: reports.ok ? null : reports.error, needsMigration: Boolean(reports.needsMigration), overview },
  };
}
