// Stage-6 guards (docs/SECURITY_DECISIONS.md, docs/PRIVACY_AND_ANALYTICS.md):
//   * the CSP allows Google / Yandex hosts only when the matching analytics id is configured
//   * the env preflight warns (exit 0, id never printed) when an analytics id is set
//   * rate-limit keys group IPv6 by /64 and a flood of keys evicts the oldest quarter, not everything
//   * CI runs the browser flows and triggers on the paths that can break them
//   * example env files carry no retired domain or Vercel-only instruction
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { rateLimit, clientIpFromHeaders, normalizeClientIp } from "../lib/security/rateLimit.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const require = createRequire(import.meta.url);
const execFileAsync = promisify(execFile);

// ── CSP ─────────────────────────────────────────────────────────────────────

async function cspWith(env) {
  const keys = ["NEXT_PUBLIC_GA_MEASUREMENT_ID", "NEXT_PUBLIC_YANDEX_METRICA_ID"];
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  for (const k of keys) delete process.env[k];
  Object.assign(process.env, env);
  const file = require.resolve("../next.config.js");
  delete require.cache[file];
  try {
    const cfg = require(file);
    const headers = (await cfg.headers())[0].headers;
    return headers.find((h) => h.key === "Content-Security-Policy").value;
  } finally {
    for (const k of keys) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
    delete require.cache[file];
  }
}

test("CSP: with no analytics id nothing from Google or Yandex is allowed anywhere", async () => {
  const csp = await cspWith({});
  assert.ok(!/google|doubleclick|yandex/i.test(csp), csp);
  assert.match(csp, /script-src 'self' 'unsafe-inline'(;|$)/);
  assert.match(csp, /frame-src 'self'(;|$)/);
  for (const must of ["object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'self'", "default-src 'self'"]) assert.ok(csp.includes(must), must);
  assert.ok(!csp.includes("'unsafe-eval'"), "no unsafe-eval in a production policy");
});

test("CSP: each id opens exactly its own provider", async () => {
  const ga = await cspWith({ NEXT_PUBLIC_GA_MEASUREMENT_ID: "G-TEST123456" });
  assert.match(ga, /script-src [^;]*https:\/\/www\.googletagmanager\.com/);
  assert.match(ga, /connect-src [^;]*https:\/\/www\.google-analytics\.com/);
  assert.ok(!/yandex/i.test(ga));
  const ym = await cspWith({ NEXT_PUBLIC_YANDEX_METRICA_ID: "12345678" });
  assert.match(ym, /script-src [^;]*https:\/\/mc\.yandex\.ru/);
  assert.match(ym, /frame-src 'self' https:\/\/mc\.yandex\.ru/);
  assert.ok(!/google|doubleclick/i.test(ym));
  const both = await cspWith({ NEXT_PUBLIC_GA_MEASUREMENT_ID: "G-TEST123456", NEXT_PUBLIC_YANDEX_METRICA_ID: "12345678" });
  assert.ok(/googletagmanager/.test(both) && /mc\.yandex\.ru/.test(both));
});

test("the analytics component and the CSP read the same two ids", () => {
  const comp = read("components/shared/AnalyticsScripts.jsx");
  const cfg = read("next.config.js");
  for (const id of ["NEXT_PUBLIC_GA_MEASUREMENT_ID", "NEXT_PUBLIC_YANDEX_METRICA_ID"]) {
    assert.ok(comp.includes(id) && cfg.includes(id), id);
    assert.ok(read("Dockerfile").includes(`ARG ${id}`), `${id} must reach the build as a build arg`);
  }
});

// ── env preflight ───────────────────────────────────────────────────────────

const BASE_ENV = {
  ACME_EMAIL: "ops@medoriaco.com", NEXT_PUBLIC_SITE_URL: "https://medoriaco.com",
  NEXT_PUBLIC_SUPABASE_URL: "https://api.medoriaco.com", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key-value",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key-value",
  OPERATOR_USERNAME: "operator", OPERATOR_PASSWORD_HASH: "hash-value", OPERATOR_SESSION_SECRET: "a".repeat(32),
  BEAUTY_OPERATOR_USERNAME: "beauty-operator", BEAUTY_OPERATOR_PASSWORD_HASH: "hash-value", BEAUTY_OPERATOR_SESSION_SECRET: "b".repeat(32),
  CAPTCHA_SECRET: "captcha-secret-value",
};
async function runChecker(overrides) {
  const dir = await mkdtemp(path.join(tmpdir(), "analytics-env-"));
  const envPath = path.join(dir, ".env");
  await writeFile(envPath, Object.entries({ ...BASE_ENV, ...overrides }).map(([k, v]) => `${k}=${v}`).join("\n"), "utf8");
  try {
    const r = await execFileAsync(process.execPath, ["scripts/check-self-host-env.mjs", envPath], { cwd: root });
    return { code: 0, stderr: r.stderr };
  } catch (e) { return { code: e.code, stderr: e.stderr }; }
  finally { await rm(dir, { recursive: true, force: true }); }
}

test("an analytics id only warns (exit 0) and is never printed; no id, no warning", async () => {
  const quiet = await runChecker({ NEXT_PUBLIC_GA_MEASUREMENT_ID: "", NEXT_PUBLIC_YANDEX_METRICA_ID: "" });
  assert.equal(quiet.code, 0);
  assert.ok(!/WARNING/.test(quiet.stderr));
  const on = await runChecker({ NEXT_PUBLIC_GA_MEASUREMENT_ID: "G-ABCDEF1234", NEXT_PUBLIC_YANDEX_METRICA_ID: "98765432" });
  assert.equal(on.code, 0, "a warning must not stop a deploy");
  assert.match(on.stderr, /WARNING NEXT_PUBLIC_GA_MEASUREMENT_ID and NEXT_PUBLIC_YANDEX_METRICA_ID are set/);
  assert.match(on.stderr, /docs\/PRIVACY_AND_ANALYTICS\.md/);
  assert.ok(!on.stderr.includes("G-ABCDEF1234") && !on.stderr.includes("98765432"));
  assert.match((await runChecker({ NEXT_PUBLIC_YANDEX_METRICA_ID: "98765432" })).stderr, /WARNING NEXT_PUBLIC_YANDEX_METRICA_ID is set/);
});

// ── rate-limit keys and eviction ────────────────────────────────────────────

test("normalizeClientIp: IPv4 unchanged, IPv4-mapped IPv6 is the IPv4, other IPv6 is its /64", () => {
  assert.equal(normalizeClientIp("203.0.113.9"), "203.0.113.9");
  assert.equal(normalizeClientIp("::ffff:203.0.113.9"), "203.0.113.9");
  assert.equal(normalizeClientIp("0:0:0:0:0:ffff:203.0.113.9"), "203.0.113.9");
  assert.equal(normalizeClientIp("2001:db8:abcd:12:aaaa:bbbb:cccc:dddd"), "v6:2001:0db8:abcd:0012");
  assert.equal(normalizeClientIp("2001:DB8:abcd:12::1"), "v6:2001:0db8:abcd:0012");
  assert.equal(normalizeClientIp("[2001:db8:abcd:12::ffff]"), "v6:2001:0db8:abcd:0012");
  assert.equal(normalizeClientIp("2001:db8:abcd:12:1:2:3:4%eth0"), "v6:2001:0db8:abcd:0012");
  assert.equal(normalizeClientIp("::1"), "v6:0000:0000:0000:0000");
  assert.equal(normalizeClientIp("2001:db8::"), "v6:2001:0db8:0000:0000");
  assert.equal(normalizeClientIp(""), "unknown");
  assert.equal(normalizeClientIp("not-an-ip:zz"), "not-an-ip:zz", "something we do not understand is kept as is");
});

test("two addresses of one IPv6 /64 share one limit; another /64 does not", async () => {
  const h = (ip) => ({ get: (n) => (n === "x-real-ip" ? ip : null) });
  const a = clientIpFromHeaders(h("2001:db8:aaaa:1::1")), b = clientIpFromHeaders(h("2001:db8:aaaa:1:ffff:ffff:ffff:ffff")), c = clientIpFromHeaders(h("2001:db8:aaaa:2::1"));
  assert.equal(a, b);
  assert.notEqual(a, c);
  const opts = { limit: 1, windowMs: 60_000 };
  assert.equal((await rateLimit(`v6:${a}`, opts)).ok, true);
  assert.equal((await rateLimit(`v6:${b}`, opts)).ok, false, "a second address in the same /64 is the same visitor");
  assert.equal((await rateLimit(`v6:${c}`, opts)).ok, true);
  // x-forwarded-for fallback is normalised too, and still never outranks x-real-ip
  assert.equal(clientIpFromHeaders({ get: (n) => (n === "x-forwarded-for" ? "::ffff:198.51.100.7, 10.0.0.1" : null) }), "198.51.100.7");
  assert.equal(clientIpFromHeaders({ get: (n) => ({ "x-real-ip": "198.51.100.1", "x-forwarded-for": "1.1.1.1" })[n] ?? null }), "198.51.100.1");
});

test("a flood of distinct keys evicts the oldest quarter, not every counter", async () => {
  const opts = { limit: 1, windowMs: 3_600_000 };
  const tag = `flood${process.pid}`;
  // 2500 old keys, then the witness (blocked: it has been hit twice), then enough newer keys to pass the
  // 5000-bucket ceiling. A store that wipes everything when full would forget the witness.
  for (let i = 0; i < 2500; i++) await rateLimit(`${tag}:old:${i}`, opts);
  assert.equal((await rateLimit(`${tag}:witness`, opts)).ok, true);
  assert.equal((await rateLimit(`${tag}:witness`, opts)).ok, false);
  for (let i = 0; i < 2700; i++) await rateLimit(`${tag}:new:${i}`, opts);
  assert.equal((await rateLimit(`${tag}:witness`, opts)).ok, false, "the witness's counter survived the eviction");
  assert.equal((await rateLimit(`${tag}:new:2699`, opts)).ok, false, "the newest counters survived too");
  assert.equal((await rateLimit(`${tag}:fresh`, opts)).ok, true, "a new caller is still served");
});

// ── CI ──────────────────────────────────────────────────────────────────────

test("CI runs the browser flows as its own job and triggers on the paths that can break them", () => {
  const wf = read(".github/workflows/self-hosting-ci.yml");
  const paths = wf.slice(wf.indexOf("paths:"), wf.indexOf("workflow_dispatch"));
  for (const p of ["app/**", "components/**", "lib/**", "migrations/**", "middleware.js", "tests/**", "scripts/**", "next.config.js", "package-lock.json", "deploy/**"]) {
    assert.ok(paths.includes(`"${p}"`), `the CI path filter is missing ${p}`);
  }
  assert.match(wf, /^  validate:/m);
  const job = wf.slice(wf.indexOf("  browser-flows:"));
  assert.ok(job.length > 0, "browser-flows job missing");
  assert.match(job, /npx playwright install --with-deps chromium/);
  assert.match(job, /run: npm run test:e2e/);
  assert.match(job, /timeout-minutes: \d+/);
  assert.ok(!/secrets\./.test(job), "the browser job must not use any secret");
  assert.match(wf, /permissions:\s*\n\s+contents: read/);
});

// ── stale references ────────────────────────────────────────────────────────

test("the example env files and key code comments carry no retired domain and no Vercel-only instruction", () => {
  const ex = read(".env.local.example");
  assert.ok(!/medoria\.(tj|co|com)\b/.test(ex), "retired domain in .env.local.example");
  assert.ok(!/vercel/i.test(ex.replace(/NEVER point this at a vercel\.app URL/i, "")), "Vercel instruction in .env.local.example");
  assert.match(ex, /medoriaco\.com/);
  for (const f of ["lib/operator/importCore.js", "lib/beauty/catalog.js", "app/api/chat/route.js", "app/api/beauty-chat/route.js"]) {
    assert.ok(!/vercel/i.test(read(f)), `${f} still describes Vercel behaviour`);
  }
});
