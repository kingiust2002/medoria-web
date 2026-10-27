import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { hashPassword, verifyPasswordHash, passwordProblem, parseHash, DUMMY_HASH, normalizeUsername, USERNAME_RE } from "../lib/operator/passwords.js";
import { encryptSecret, decryptSecret, parseDataKey } from "../lib/operator/userSecrets.js";

test("a password verifies against its own hash only", () => {
  const h = hashPassword("correct horse battery 42");
  assert.ok(h.startsWith("scrypt:131072:8:1:"));
  assert.equal(verifyPasswordHash("correct horse battery 42", h), true);
  assert.equal(verifyPasswordHash("correct horse battery 43", h), false);
  assert.equal(verifyPasswordHash("", h), false);
  assert.equal(verifyPasswordHash("x".repeat(300), h), false);
  assert.equal(verifyPasswordHash("correct horse battery 42", "plain"), false);
  assert.equal(verifyPasswordHash("correct horse battery 42", "scrypt:1:2:3"), false);
  assert.equal(verifyPasswordHash("correct horse battery 42", null), false);
  assert.equal(verifyPasswordHash("anything at all 1", DUMMY_HASH), false);
});

test("hash parser rejects absurd cost parameters (no CPU/memory bomb from a stored value)", () => {
  assert.equal(parseHash("scrypt:4294967296:8:1:aa:bb"), null);
  assert.equal(parseHash("scrypt:131072:99:1:aa:bb"), null);
  assert.equal(parseHash("scrypt:131072:8:1:aa:bb").N, 131072);
});

test("password policy: length, trivial, username, uniform; long passphrase allowed without a digit", () => {
  assert.equal(passwordProblem("short1"), "too_short");
  assert.equal(passwordProblem("x".repeat(300)), "too_long");
  assert.equal(passwordProblem("password1234"), "too_common");
  assert.equal(passwordProblem("alice-is-here-9", { username: "alice" }), "contains_username");
  assert.equal(passwordProblem("aaaaaaaaaaaa1"), "too_uniform");
  assert.equal(passwordProblem("onlylettershere"), "needs_letter_and_digit");
  assert.equal(passwordProblem("a long passphrase of words"), null);
  assert.equal(passwordProblem("Kx9-secure-pass"), null);
  assert.equal(passwordProblem(12345), "bad_type");
});

test("usernames are trimmed, lower-cased and shaped", () => {
  assert.equal(normalizeUsername("  Ali.Rezaei "), "ali.rezaei");
  assert.ok(USERNAME_RE.test("ali.rezaei"));
  for (const bad of ["ab", "-abc", "has space", "ä", "a".repeat(65), ""]) assert.ok(!USERNAME_RE.test(bad), bad);
});

test("secrets: round trip, random nonce, tamper and wrong key give null", () => {
  const key = randomBytes(32);
  const a = encryptSecret("JBSWY3DPEHPK3PXP", key), b = encryptSecret("JBSWY3DPEHPK3PXP", key);
  assert.notEqual(a, b, "a fresh nonce each time");
  assert.equal(decryptSecret(a, key), "JBSWY3DPEHPK3PXP");
  assert.equal(decryptSecret(a, randomBytes(32)), null);
  const parts = a.split("."); parts[3] = parts[3].slice(0, -2) + (parts[3].endsWith("AA") ? "BB" : "AA");
  assert.equal(decryptSecret(parts.join("."), key), null, "a changed cipher text");
  for (const junk of ["", "v1", "v2.a.b.c", null, undefined, 5]) assert.equal(decryptSecret(junk, key), null);
  assert.throws(() => encryptSecret("x", null));
});

test("data key: exactly 32 bytes of base64", () => {
  assert.equal(parseDataKey(randomBytes(32).toString("base64")).length, 32);
  for (const bad of ["", "   ", randomBytes(16).toString("base64"), randomBytes(33).toString("base64"), undefined, 7]) assert.equal(parseDataKey(bad), null);
});
