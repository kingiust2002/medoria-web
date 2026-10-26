// app/api/internal/quote-reminders/route.js — the reminder run, triggered by a host cron:
//   curl -fsS -X POST -H "Authorization: Bearer $QUOTE_REMINDER_TOKEN" https://medoriaco.com/api/internal/quote-reminders
// Off (404) until QUOTE_REMINDER_TOKEN is set. 401 for a wrong token, 200 when every house that has
// something to report was told, 502 when a notice could not be delivered (so the cron's failure ping fires).
// The answer holds counts only. See docs/QUOTE_MANAGEMENT.md.
import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { runQuoteReminders } from "@/lib/notify/reminders";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };
const digest = (v) => createHash("sha256").update(String(v)).digest();

function tokenMatches(given, expected) {
  return timingSafeEqual(digest(given), digest(expected));
}

export async function POST(request) {
  const expected = (process.env.QUOTE_REMINDER_TOKEN || "").trim();
  if (expected.length < 24) return new NextResponse(null, { status: 404, headers: NO_STORE });

  const header = request.headers.get("authorization") || "";
  const given = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!given || !tokenMatches(given, expected)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401, headers: NO_STORE });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503, headers: NO_STORE });

  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const report = await runQuoteReminders({ db });
  return NextResponse.json(report, { status: report.ok ? 200 : 502, headers: NO_STORE });
}
