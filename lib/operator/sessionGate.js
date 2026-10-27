// lib/operator/sessionGate.js — from a verified cookie payload to "who is this, right now?". Plain module (dependencies are passed
// in) so every branch is unit-tested. Used by getSession() of both panels.
//
//   personal-account session (payload.uid)   valid only while OPERATOR_USERS=on, the account is active, in THIS house, still at the
//                                            authz_version it was issued with, and its registry row is valid
//   old env-account session (no uid)         valid only while the panel is in legacy / bootstrap mode (OPERATOR_USERS off, migration 34
//                                            not applied, or no owner yet); once personal accounts rule, the old cookies are dead
// Every doubt (outage, unreadable database) is a refusal.
import { resolveSessionUser, usersMode } from "./accounts.js";

export const usersEnabled = () => process.env.OPERATOR_USERS === "on";

export async function sessionGate({ payload, panel, admin, status, legacyVersionOk, enabled = usersEnabled() }) {
  if (!payload) return null;
  if (typeof payload.uid === "string") {
    if (!enabled) return null;
    const who = await resolveSessionUser(admin, { panel, uid: payload.uid, av: payload.av });
    if (!who.ok || !who.user) return null;
    if ((await status()) !== "valid") return null;          // personal sessions always live in the registry
    return { ...payload, user: who.user };
  }
  if (!legacyVersionOk) return null;                         // credentials rotated
  if (enabled) {
    const mode = await usersMode(admin, { enabled });
    if (mode !== "legacy" && mode !== "bootstrap") return null;
  }
  if ((await status()) === "invalid") return null;          // revoked, expired, unknown, or issued before the registry existed
  return payload;
}
