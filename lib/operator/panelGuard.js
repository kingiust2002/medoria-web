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
import { mayView, mayGlobal } from "@/lib/operator/access";

// `rel` is the permission the page or reader needs ("products.view", "quotes.view", "audit.view"), or a list of which ANY is enough.
// A signed-in person without it is sent to the "no access" page (the data is never read): default closed.
const mayAny = (session, panel, rel) => [].concat(rel).some((r) => (r.startsWith("users.") ? mayGlobal(session, panel, r) : mayView(session, panel, r)));

export async function requireHealthSession(rel) {
  const session = await healthSession();
  if (!session) redirect("/login/health");
  if (rel && !mayAny(session, "health", rel)) redirect("/operator/no-access");
  return session;
}

export async function requireBeautySession(rel) {
  const session = await beautySession();
  if (!session) redirect("/login/beauty");
  if (rel && !mayAny(session, "beauty", rel)) redirect("/beauty/operator/no-access");
  return session;
}
