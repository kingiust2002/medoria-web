// The credentials fingerprint that session tokens carry (see credentialsVersion() in lib/operator/auth.js),
// without the Next-only imports of auth.js, so tests can mint tokens. Keep the two in sync: a test pins it.
import { createHash } from "node:crypto";

export function credentialsVersion(env = process.env) {
  return createHash("sha256")
    .update(`${env.OPERATOR_USERNAME || ""}\u0000${env.OPERATOR_PASSWORD_HASH || ""}`)
    .digest("hex")
    .slice(0, 16);
}
