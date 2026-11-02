// app/api/internal/ops-report/route.js — the server's own scripts report what they did (N13, docs/PANEL_SYSTEM_STATUS.md):
//   curl -fsS -X POST -H "Authorization: Bearer $OPS_REPORT_TOKEN" -H "Content-Type: application/json" \
//        -d '{"kind":"backup","status":"pass","detail":"snapshot 20261028T023001Z"}' https://medoriaco.com/api/internal/ops-report
// Off (404) until OPS_REPORT_TOKEN is set (24+ characters). 401 for a wrong token. kind: backup · backup_check · restore_drill · heartbeat · alert_test;
// status: pass | fail (alert_test: sent). The time is the database's clock. A report never contains secrets: URLs in the detail are removed.
import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ingestReport } from "@/lib/ops/ingest";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };
const MAX_BODY = 2048;
const digest = (v) => createHash("sha256").update(String(v)).digest();
const tokenMatches = (given, expected) => timingSafeEqual(digest(given), digest(expected));

export async function POST(request) {
  const expected = (process.env.OPS_REPORT_TOKEN || "").trim();
  if (expected.length < 24) return new NextResponse(null, { status: 404, headers: NO_STORE });
  const header = request.headers.get("authorization") || "";
  const given = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!given || !tokenMatches(given, expected)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401, headers: NO_STORE });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503, headers: NO_STORE });

  let text = "";
  try { text = await request.text(); } catch { /* handled below */ }
  if (!text || text.length > MAX_BODY) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400, headers: NO_STORE });
  let body = null;
  try { body = JSON.parse(text); } catch { return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400, headers: NO_STORE }); }

  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const res = await ingestReport(db, body);
  return NextResponse.json(res.ok ? { ok: true, kind: res.kind, status: res.status } : { ok: false, error: "rejected" }, { status: res.ok ? 200 : res.status, headers: NO_STORE });
}
