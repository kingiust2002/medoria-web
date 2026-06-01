// app/api/operator/logout/route.js — clears the operator session cookie.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { OP_COOKIE } from "@/lib/operator/session";

export const runtime = "nodejs";

export async function POST() {
  cookies().set(OP_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return NextResponse.json({ ok: true });
}
