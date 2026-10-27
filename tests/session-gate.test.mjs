// sessionGate: from a verified cookie payload to a person, in every mode. Runs the real module against an in-memory database.
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createMemoryAdmin } from "./helpers/memoryAdmin.mjs";
import { sessionGate } from "../lib/operator/sessionGate.js";
import { clearModeCache, invalidateSessionUser } from "../lib/operator/accounts.js";

const ID = "00000000-0000-4000-8000-000000000001";
const row = (o = {}) => ({
  id: ID, username: "alice", display_name: "Alice", password_hash: "scrypt:1:2:3:aa:bb", status: "active", role: "owner", houses: ["health", "beauty"], allow_perms: [], deny_perms: [],
  approval: {}, require_2fa: false, totp_secret_enc: null, recovery_hashes: [], must_change_password: false, authz_version: 4, version: 1, ...o,
});
const db = (rows = []) => createMemoryAdmin({ operator_users: rows });
const valid = async () => "valid";
const invalid = async () => "invalid";
const unavailable = async () => "unavailable";
beforeEach(() => { clearModeCache(); invalidateSessionUser(); });

const gate = (over) => (invalidateSessionUser(), sessionGate)({ panel: "health", admin: db([row()]), status: valid, legacyVersionOk: true, enabled: true, ...over });

test("no payload = nobody", async () => {
  assert.equal(await gate({ payload: null }), null);
});

test("personal session: the CURRENT account state decides", async () => {
  const p = { uid: ID, av: 4, sid: "x" };
  const ok = await gate({ payload: p });
  assert.equal(ok.user.id, ID);
  assert.equal(ok.uid, ID);
  assert.equal(await gate({ payload: { ...p, av: 3 } }), null, "issued before the last change of power");
  assert.equal(await gate({ payload: p, status: invalid }), null, "revoked / expired registry row");
  assert.equal(await gate({ payload: p, status: unavailable }), null, "personal sessions need the registry");
  assert.equal(await gate({ payload: p, panel: "beauty", admin: db([row({ houses: ["health"] })]) }), null, "wrong house");
  assert.equal(await gate({ payload: p, admin: db([row({ status: "disabled" })]) }), null);
  assert.equal(await gate({ payload: p, admin: db([row({ status: "blocked" })]) }), null);
  assert.equal(await gate({ payload: p, admin: db([]) }), null, "account gone");
  const out = db([row()]); out.fail = () => ({ code: "PGRST002", message: "schema cache" });
  assert.equal(await gate({ payload: p, admin: out }), null, "outage");
  assert.equal(await gate({ payload: p, admin: null }), null, "no database");
  assert.equal(await gate({ payload: { uid: 5, av: 4 } }), null, "a uid that is not a string");
});

test("a personal-session cookie is dead when the feature is switched off", async () => {
  assert.equal(await gate({ payload: { uid: ID, av: 4, sid: "x" }, enabled: false }), null);
});

test("old env-account session: fine in legacy / bootstrap, dead once personal accounts rule", async () => {
  const legacy = { ver: "v", sid: "x" };
  assert.deepEqual(await gate({ payload: legacy, enabled: false, admin: db([row()]) }), legacy, "feature off");
  assert.deepEqual(await gate({ payload: legacy, admin: createMemoryAdmin({}) }), legacy, "migration 34 not applied");
  assert.deepEqual(await gate({ payload: legacy, admin: db([row({ role: "viewer" })]) }), legacy, "bootstrap: no active owner yet");
  clearModeCache();
  assert.equal(await gate({ payload: legacy, admin: db([row()]) }), null, "an active owner exists: env sessions are retired");
  clearModeCache();
  const out = db(); out.fail = () => ({ code: "XX000", message: "x" });
  assert.equal(await gate({ payload: legacy, admin: out }), null, "an outage never falls back to the weaker mode");
  clearModeCache();
  assert.equal(await gate({ payload: legacy, legacyVersionOk: false, enabled: false }), null, "rotated env credentials");
  assert.equal(await gate({ payload: legacy, enabled: false, status: invalid }), null, "revoked env session");
  assert.deepEqual(await gate({ payload: legacy, enabled: false, status: unavailable }), legacy, "registry table missing: previous behaviour");
});
