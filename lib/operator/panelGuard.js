// lib/operator/panelGuard.js — SERVER ONLY. The session check for panel PAGES and for the data readers behind them.
//
// Why this exists: the layout of each panel redirects visitors without a session, but a layout is not a security
// boundary. Next.js renders layouts and pages side by side, and on a client-side navigation it renders only the page, so
// a page that reads customer data on its own would hand it to ANYONE who sends a cookie with the right name (the
// middleware only checks that the cookie exists) or to a session that was already ended. Every page and every reader
// that uses the service-role client therefore checks the session itself, before it touches the database.
import "server-only";
import { redirect } from "next/navigation";
import { getSession as healthSession } from "@/lib/operator/auth";
import { getSession as beautySession } from "@/lib/beauty/operator/auth";

export async function requireHealthSession() {
  const session = await healthSession();
  if (!session) redirect("/login/health");
  return session;
}

export async function requireBeautySession() {
  const session = await beautySession();
  if (!session) redirect("/login/beauty");
  return session;
}
