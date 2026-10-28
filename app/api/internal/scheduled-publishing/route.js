// app/api/internal/scheduled-publishing/route.js — applies the due publish / archive schedules of products (migration 39), triggered by a host cron:
//   curl -fsS -X POST -H "Authorization: Bearer $SCHEDULE_TOKEN" https://medoriaco.com/api/internal/scheduled-publishing
// Off (404) until SCHEDULE_TOKEN (at least 24 characters) is set. 401 for a wrong token, 200 when the run finished (also when nothing was due or
// a house has not applied the migration yet), 502 when a house could not be read. The answer holds counts only. See docs/SCHEDULED_PUBLISHING.md.
import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { runScheduledPublishing } from "@/lib/operator/scheduledPublishing";
import { writeAudit } from "@/lib/operator/security";
import { revalidateHealthPublic } from "@/lib/health/revalidate";
import { revalidateBeautyPublic } from "@/lib/beauty/revalidate";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };
const digest = (v) => createHash("sha256").update(String(v)).digest();
const tokenMatches = (given, expected) => timingSafeEqual(digest(given), digest(expected));

export async function POST(request) {
  const expected = (process.env.SCHEDULE_TOKEN || "").trim();
  if (expected.length < 24) return new NextResponse(null, { status: 404, headers: NO_STORE });

  const header = request.headers.get("authorization") || "";
  const given = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!given || !tokenMatches(given, expected)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401, headers: NO_STORE });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503, headers: NO_STORE });

  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const report = await runScheduledPublishing({
    admin,
    audit: (entry) => writeAudit(admin, entry),
    revalidate: { health: () => revalidateHealthPublic(), beauty: () => revalidateBeautyPublic() },
  });
  return NextResponse.json(report, { status: report.ok ? 200 : 502, headers: NO_STORE });
}
