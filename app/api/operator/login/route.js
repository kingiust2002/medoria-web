// app/api/operator/login/route.js — Health panel login (the flow itself: lib/operator/loginFlow.js).
// Lives under /api so middleware never locale-rewrites or auth-gates it.
import { OP_COOKIE, signSession, verifySession, sessionTtlMs } from "@/lib/operator/session";
import { verifyCredentials, isOperatorConfigured, sessionCookieOptions, credentialsVersion, isSameOrigin } from "@/lib/operator/auth";
import { handleLogin } from "@/lib/operator/loginFlow";

export const runtime = "nodejs";

const config = {
  panel: "health", cookieName: OP_COOKIE, role: "admin", limiterPrefix: "oplogin",
  env: { totp: "OPERATOR_TOTP_SECRET", recovery: "OPERATOR_RECOVERY_CODE_HASHES" },
  auth: { verifyCredentials, isConfigured: isOperatorConfigured, sessionCookieOptions, credentialsVersion, isSameOrigin },
  session: { signSession, verifySession, sessionTtlMs },
};

export const POST = (req) => handleLogin(req, config);
