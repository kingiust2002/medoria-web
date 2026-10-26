// app/api/operator/logout/route.js — ends the Health session on the server and clears the cookie.
// POST-only + origin check so a cross-site page can't log the operator out.
import { OP_COOKIE, signSession, verifySession, sessionTtlMs } from "@/lib/operator/session";
import { verifyCredentials, isOperatorConfigured, sessionCookieOptions, credentialsVersion, isSameOrigin } from "@/lib/operator/auth";
import { handleLogout } from "@/lib/operator/loginFlow";

export const runtime = "nodejs";

const config = {
  panel: "health", cookieName: OP_COOKIE, role: "admin",
  auth: { verifyCredentials, isConfigured: isOperatorConfigured, sessionCookieOptions, credentialsVersion, isSameOrigin },
  session: { signSession, verifySession, sessionTtlMs },
};

export const POST = (req) => handleLogout(req, config);
