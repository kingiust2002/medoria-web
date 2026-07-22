// tests/operator-hardening.test.mjs
// Regression tests for the operator security-hardening helpers.
// Pure functions only (no "server-only" / Next imports), so they load directly.
import { test } from "node:test";
import assert from "node:assert/strict";
import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";
import { safeUrlRef, sniffImageType } from "../lib/operator/validation.js";

test("safeUrlRef accepts http(s) URLs and bare storage paths", () => {
  assert.equal(safeUrlRef("https://example.com/a.jpg"), "https://example.com/a.jpg");
  assert.equal(safeUrlRef("http://example.com"), "http://example.com");
  assert.equal(safeUrlRef("products/2026-abc.webp"), "products/2026-abc.webp");
});

test("safeUrlRef blocks script-capable and traversal schemes", () => {
  for (const bad of [
    "javascript:alert(1)",
    " javascript:alert(1) ",
    "JavaScript:alert(1)",
    "data:text/html,<script>1</script>",
    "vbscript:msgbox(1)",
    "//evil.com/x.jpg",     // protocol-relative
    "/abs/path",            // leading slash
    "../secret",            // traversal
    "products/../../etc",   // traversal in a path
    "",
    null,
    undefined,
  ]) {
    assert.equal(safeUrlRef(bad), null, `expected null for ${JSON.stringify(bad)}`);
  }
});

test("sniffImageType detects the allowed image formats by magic bytes", () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const bytes = (s) => Uint8Array.from([...s].map((c) => c.charCodeAt(0)));
  const webp = bytes("RIFF\x00\x00\x00\x00WEBPVP8 ");
  const avif = bytes("\x00\x00\x00\x20ftypavif");
  assert.equal(sniffImageType(jpeg), "image/jpeg");
  assert.equal(sniffImageType(png), "image/png");
  assert.equal(sniffImageType(webp), "image/webp");
  assert.equal(sniffImageType(avif), "image/avif");
});

test("sniffImageType rejects non-images and short buffers", () => {
  const bytes = (s) => Uint8Array.from([...s].map((c) => c.charCodeAt(0)));
  assert.equal(sniffImageType(bytes("<html><body>x")), null); // HTML labelled as image
  assert.equal(sniffImageType(bytes("%PDF-1.7\n%aaa")), null); // PDF
  assert.equal(sniffImageType(new Uint8Array([0xff, 0xd8])), null); // too short
  assert.equal(sniffImageType(null), null);
});

// Mirrors lib/operator/auth.js verifyPassword parsing: proves the new 6-part
// format round-trips AND legacy 3-part hashes still verify (backward compat).
function verify(password, stored) {
  const parts = stored.split(":");
  if (parts[0] !== "scrypt") return false;
  let N = 16384, r = 8, p = 1, saltHex, keyHex;
  if (parts.length === 3) { [, saltHex, keyHex] = parts; }
  else if (parts.length === 6) {
    N = Number(parts[1]); r = Number(parts[2]); p = Number(parts[3]);
    saltHex = parts[4]; keyHex = parts[5];
    if (![N, r, p].every(Number.isInteger)) return false;
  } else return false;
  try {
    const derived = scryptSync(String(password), Buffer.from(saltHex, "hex"), 32, { N, r, p, maxmem: 256 * 1024 * 1024 });
    const expected = Buffer.from(keyHex, "hex");
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch { return false; }
}

test("scrypt new 6-part format (N=2^17) round-trips and rejects wrong password", () => {
  const salt = randomBytes(16);
  const key = scryptSync("Correct#Horse2026", salt, 32, { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 });
  const stored = `scrypt:131072:8:1:${salt.toString("hex")}:${key.toString("hex")}`;
  assert.equal(verify("Correct#Horse2026", stored), true);
  assert.equal(verify("wrong", stored), false);
});

test("legacy 3-part scrypt hash still verifies (no forced re-hash of live env)", () => {
  const salt = randomBytes(16);
  const key = scryptSync("OldPass!", salt, 32); // Node defaults, as the old generator produced
  const stored = `scrypt:${salt.toString("hex")}:${key.toString("hex")}`;
  assert.equal(verify("OldPass!", stored), true);
  assert.equal(verify("nope", stored), false);
});
