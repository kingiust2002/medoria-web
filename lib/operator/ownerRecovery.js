// lib/operator/ownerRecovery.js — the EMERGENCY procedure for an owner who lost their own access (password AND second factor), run on the
// server by whoever administers it (scripts/self-host/owner-recovery.mjs). Plain module: it only builds the SQL; the operator pipes it into
// the database container. Nothing here reaches the database by itself, and nothing here knows a secret except the one-time password it just made.
//
// What the SQL does, in ONE transaction (any failure rolls everything back):
//   1. writes an "attempt" line to the activity log of BOTH panels — if the log cannot be written, nothing else happens (same rule as the panel);
//   2. checks that exactly one ACTIVE owner has this username (never a manager, never an archived / disabled account);
//   3. replaces the password with the hash of a new one-time password, clears the second-factor seed and every recovery code, requires the
//      second factor again, forces a password change, bumps authz_version;
//   4. ends every session of that account;
//   5. writes the "success" line to both logs.
// It is NOT a way around the second factor: the owner signs in with the one-time password, gets only the security screen, chooses a new
// password and enrols a NEW second factor before anything else opens (restrictedReason in lib/operator/access.js).
import { randomInt } from "node:crypto";
import { hashPassword, normalizeUsername, passwordProblem, USERNAME_RE } from "./passwords.js";

const ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";     // no look-alike characters

export function newOneTimePassword(username = "") {
  for (;;) {
    let s = "";
    for (let i = 0; i < 20; i++) s += ALPHABET[randomInt(ALPHABET.length)];
    if (/[a-z]/.test(s) && /[A-Z]/.test(s) && /[0-9]/.test(s) && !passwordProblem(s, { username })) return s;
  }
}

// → { ok:true, sql, password } | { ok:false, error }. `sql` contains the HASH of `password`, never the password.
export function buildOwnerRecovery({ username, password } = {}) {
  const name = normalizeUsername(username);
  if (!USERNAME_RE.test(name)) return { ok: false, error: "the username must be 3–64 characters: a-z, 0-9, dot, dash, underscore" };
  const pw = password || newOneTimePassword(name);
  const problem = passwordProblem(pw, { username: name });
  if (problem) return { ok: false, error: `the password is refused by the policy (${problem})` };
  const hash = hashPassword(pw);
  if (!/^scrypt:[0-9a-z:+/=_-]+$/i.test(hash)) return { ok: false, error: "unexpected password hash format" };
  const u = `'${name}'`;                                   // safe: USERNAME_RE allows only a-z 0-9 . _ -
  const log = (result) => ["health", "beauty"].map((panel) => `  INSERT INTO public.operator_audit_log (panel, action, entity, target_user_id, result, detail)
    VALUES ('${panel}', 'user.emergency_recovery', 'operator_users', who, '${result}', '{"method":"server_recovery"}'::jsonb);`).join("\n");
  const sql = `-- Medoria emergency owner recovery for ${name} — generated, one transaction, rolls back on any error
BEGIN;
DO $$
DECLARE
  who uuid;
  n integer;
BEGIN
  SELECT id INTO who FROM public.operator_users WHERE username = ${u} AND role = 'owner' AND status = 'active';
  IF who IS NULL THEN
    RAISE EXCEPTION 'no ACTIVE owner with the username ${name} (managers, archived or disabled accounts are not handled here)';
  END IF;
${log("attempt")}
  UPDATE public.operator_users
     SET password_hash = '${hash}', password_changed_at = now(), must_change_password = TRUE,
         totp_secret_enc = NULL, recovery_hashes = '{}', totp_last_step = 0, require_2fa = TRUE,
         authz_version = authz_version + 1
   WHERE id = who;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'expected to change exactly one owner, changed %', n; END IF;
  UPDATE public.operator_sessions SET revoked_at = now() WHERE user_id = who AND revoked_at IS NULL;
${log("success")}
END $$;
COMMIT;
`;
  return { ok: true, sql, password: pw, username: name };
}

// Read-only helper for the "before" look (no secrets): who the owners are and whether a second factor is set.
export const OWNER_CHECK_SQL = "SELECT username, status, (totp_secret_enc IS NOT NULL) AS has_second_factor, array_length(recovery_hashes, 1) AS recovery_codes, last_login_at FROM public.operator_users WHERE role = 'owner' ORDER BY created_at;";
