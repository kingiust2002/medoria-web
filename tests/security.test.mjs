// tests/security.test.mjs — security-critical pure modules.
// Runs with the built-in Node test runner (no framework): `npm test`.
// Only alias-free modules are imported directly; the Next-coupled server
// action (lib/actions/quote.js) is covered via the units it composes
// (sanitize, captcha, rateLimit) — see SECURITY-CHECKLIST.md for the manual
// end-to-end steps.
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.CAPTCHA_SECRET = "test-secret-test-secret"; // ≥16 chars, set before use

const { clean, normalizeDigits } = await import("../lib/security/sanitize.js");
const { createCaptchaChallenge, verifyCaptchaAnswer } = await import("../lib/security/captcha.js");
const { rateLimit } = await import("../lib/security/rateLimit.js");
const { safeJsonLd } = await import("../lib/seo.js");
const { toCsv } = await import("../lib/operator/csv.js");
const { str, strArray, parseSpecs, slugify } = await import("../lib/operator/validation.js");

function solve(question) {
  // question looks like "7 + 5 = ?" (minus is U+2212)
  const [x, op, y] = question.split(" ");
  return op === "+" ? Number(x) + Number(y) : Number(x) - Number(y);
}

// ── captcha ──────────────────────────────────────────────────────────────────
test("captcha: correct answer verifies once, replay is rejected", () => {
  const { token, question } = createCaptchaChallenge();
  const answer = solve(question);
  assert.equal(verifyCaptchaAnswer(token, String(answer)).ok, true);
  const replay = verifyCaptchaAnswer(token, String(answer));
  assert.equal(replay.ok, false);
  assert.equal(replay.reason, "replayed");
});

test("captcha: wrong answer fails but stays retryable, then succeeds", () => {
  const { token, question } = createCaptchaChallenge();
  const answer = solve(question);
  assert.equal(verifyCaptchaAnswer(token, String(answer + 1)).ok, false);
  assert.equal(verifyCaptchaAnswer(token, String(answer)).ok, true);
});

test("captcha: Persian digits are accepted", () => {
  const { token, question } = createCaptchaChallenge();
  const answer = String(solve(question)).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
  assert.equal(verifyCaptchaAnswer(token, answer).ok, true);
});

test("captcha: tampered token and garbage input are rejected", () => {
  const { token, question } = createCaptchaChallenge();
  const answer = String(solve(question));
  const [body, sig] = token.split(".");
  const flipped = (body[0] === "A" ? "B" : "A") + body.slice(1);
  assert.equal(verifyCaptchaAnswer(`${flipped}.${sig}`, answer).ok, false);
  assert.equal(verifyCaptchaAnswer("not-a-token", "5").ok, false);
  assert.equal(verifyCaptchaAnswer(null, "5").ok, false);
  assert.equal(verifyCaptchaAnswer(token, "abc").ok, false);
});

test("captcha: expired token is rejected", () => {
  const { token, question } = createCaptchaChallenge();
  const answer = String(solve(question));
  const realNow = Date.now;
  try {
    Date.now = () => realNow() + 11 * 60 * 1000; // past the 10-minute TTL
    const res = verifyCaptchaAnswer(token, answer);
    assert.equal(res.ok, false);
    assert.equal(res.reason, "expired");
  } finally {
    Date.now = realNow;
  }
});

// ── quote input sanitation ───────────────────────────────────────────────────
test("clean(): strips control chars, keeps newlines, caps length, nulls empties", () => {
  assert.equal(clean("a\u0007b\u0000c", 100), "abc");
  assert.equal(clean("line1\nline2", 100), "line1\nline2");
  assert.equal(clean("x".repeat(500), 150).length, 150);
  assert.equal(clean("   ", 100), null);
  assert.equal(clean(null, 100), null);
});

test("normalizeDigits(): Persian and Arabic-Indic digits become ASCII", () => {
  assert.equal(normalizeDigits("۱۲۳"), "123");
  assert.equal(normalizeDigits("٤٥٦"), "456");
});

// ── JSON-LD escaping (stored XSS guard) ─────────────────────────────────────
test("safeJsonLd(): '<' is escaped so '</script>' cannot break out", () => {
  const out = safeJsonLd({ description: 'x</script><script>alert(1)</script>' });
  assert.ok(!out.includes("<"));
  assert.ok(out.includes("\\u003c/script"));
});

// ── CSV formula-injection guard ──────────────────────────────────────────────
test("toCsv(): leading = + @ are neutralized with apostrophe", () => {
  const csv = toCsv(["a"], [["=SUM(A1)"], ["+1+2"], ["@cmd"], ["safe"]]);
  assert.ok(csv.includes("'=SUM(A1)"));
  assert.ok(csv.includes("'+1+2"));
  assert.ok(csv.includes("'@cmd"));
  assert.ok(!csv.includes("'safe"));
});

// ── operator validation caps ─────────────────────────────────────────────────
test("validation: field/array/spec caps hold", () => {
  assert.equal(str("x".repeat(300), 200).length, 200);
  assert.equal(strArray(Array.from({ length: 50 }, (_, i) => `t${i}`)).length, 30);
  const specs = parseSpecs(Array.from({ length: 80 }, (_, i) => ({ key: `k${i}`, value: "v" })));
  assert.equal(Object.keys(specs).length, 60);
  assert.equal(slugify("Hello, World! 42"), "hello-world-42");
});

// ── rate limiter (memory store) ──────────────────────────────────────────────
test("rateLimit: blocks over the limit and resets after the window", async () => {
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  const opts = { limit: 2, windowMs: 60 };
  assert.equal((await rateLimit("t:win", opts)).ok, true);
  assert.equal((await rateLimit("t:win", opts)).ok, true);
  const third = await rateLimit("t:win", opts);
  assert.equal(third.ok, false);
  assert.ok(third.retryAfterMs > 0);
  await new Promise((r) => setTimeout(r, 80));
  assert.equal((await rateLimit("t:win", opts)).ok, true);
});

test("rateLimit: independent keys do not interfere", async () => {
  const opts = { limit: 1, windowMs: 1000 };
  assert.equal((await rateLimit("t:a", opts)).ok, true);
  assert.equal((await rateLimit("t:b", opts)).ok, true);
  assert.equal((await rateLimit("t:a", opts)).ok, false);
});
