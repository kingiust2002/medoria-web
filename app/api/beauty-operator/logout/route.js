// app/api/beauty-operator/logout/route.js — ends the Beauty session on the server and clears the cookie.
// POST-only + origin check so a cross-site page can't log the operator out.
import { BOP_COOKIE, signSession, verifySession, sessionTtlMs } from "@/lib/beauty/operator/session";
import { verifyCredentials, isBeautyOperatorConfigured, sessionCookieOptions, credentialsVersion, isSameOrigin } from "@/lib/beauty/operator/auth";
import { handleLogout } from "@/lib/operator/loginFlow";

export const runtime = "nodejs";

const config = {
  panel: "beauty", cookieName: BOP_COOKIE, role: "beauty-admin",
  auth: { verifyCredentials, isConfigured: isBeautyOperatorConfigured, sessionCookieOptions, credentialsVersion, isSameOrigin },
  session: { signSession, verifySession, sessionTtlMs },
};

export const POST = (req) => handleLogout(req, config);
