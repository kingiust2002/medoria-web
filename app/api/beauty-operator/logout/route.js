// app/api/beauty-operator/logout/route.js — clears the Beauty session cookie.
// POST-only + origin check so a cross-site page can't log the operator out.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { BOP_COOKIE } from "@/lib/beauty/operator/session";
import { isSameOrigin } from "@/lib/beauty/operator/auth";

export const runtime = "nodejs";

export async function POST(req) {
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: "درخواست نامعتبر است." }, { status: 403 });
  }
  cookies().set(BOP_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return NextResponse.json({ ok: true });
}
