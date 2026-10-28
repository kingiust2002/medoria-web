// app/api/beauty-operator/login/route.js — Beauty panel login (the flow itself: lib/operator/loginFlow.js).
// Its own cookie, secret, credentials and second factor — independent from the Health panel.
import { BOP_COOKIE, signSession, verifySession, sessionTtlMs } from "@/lib/beauty/operator/session";
import { verifyCredentials, isBeautyOperatorConfigured, sessionCookieOptions, credentialsVersion, isSameOrigin } from "@/lib/beauty/operator/auth";
import { handleLogin } from "@/lib/operator/loginFlow";

export const runtime = "nodejs";

const config = {
  panel: "beauty", cookieName: BOP_COOKIE, role: "beauty-admin", limiterPrefix: "boplogin",
  env: { totp: "BEAUTY_OPERATOR_TOTP_SECRET", recovery: "BEAUTY_OPERATOR_RECOVERY_CODE_HASHES", username: "BEAUTY_OPERATOR_USERNAME", passwordHash: "BEAUTY_OPERATOR_PASSWORD_HASH" },
  auth: { verifyCredentials, isConfigured: isBeautyOperatorConfigured, sessionCookieOptions, credentialsVersion, isSameOrigin },
  session: { signSession, verifySession, sessionTtlMs },
};

export const POST = (req) => handleLogin(req, config);
