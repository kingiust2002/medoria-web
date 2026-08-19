import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const BASE_ENV = {
  ACME_EMAIL: "ops@medoriaco.com",
  NEXT_PUBLIC_SUPABASE_URL: "https://api.medoriaco.com",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key-value",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key-value",
  OPERATOR_USERNAME: "operator",
  OPERATOR_PASSWORD_HASH: "hash-value",
  OPERATOR_SESSION_SECRET: "a".repeat(32),
  BEAUTY_OPERATOR_USERNAME: "beauty-operator",
  BEAUTY_OPERATOR_PASSWORD_HASH: "hash-value",
  BEAUTY_OPERATOR_SESSION_SECRET: "b".repeat(32),
  CAPTCHA_SECRET: "captcha-secret-value",
};

function renderEnv(overrides) {
  const merged = { ...BASE_ENV, ...overrides };
  return Object.entries(merged)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

async function runChecker(overrides) {
  const dir = await mkdtemp(join(tmpdir(), "self-host-env-"));
  const envPath = join(dir, ".env");
  await writeFile(envPath, renderEnv(overrides), "utf8");

  try {
    const result = await execFileAsync(
      process.execPath,
      ["scripts/check-self-host-env.mjs", envPath],
      { cwd: process.cwd() },
    );
    return { code: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    return { code: error.code, stdout: error.stdout, stderr: error.stderr };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("passes when NEXT_PUBLIC_SITE_URL is a host deploy/Caddyfile routes to the app", async () => {
  const { code, stdout } = await runChecker({
    NEXT_PUBLIC_SITE_URL: "https://medoriaco.com",
  });
  assert.equal(code, 0);
  assert.match(stdout, /preflight passed/);
});

test("passes for the www and staging hosts too", async () => {
  for (const host of ["www.medoriaco.com", "staging.medoriaco.com"]) {
    const { code, stdout } = await runChecker({
      NEXT_PUBLIC_SITE_URL: `https://${host}`,
    });
    assert.equal(code, 0, `expected ${host} to pass`);
    assert.match(stdout, /preflight passed/);
  }
});

test("fails when NEXT_PUBLIC_SITE_URL is not a host deploy/Caddyfile routes to the app", async () => {
  const { code, stderr } = await runChecker({
    NEXT_PUBLIC_SITE_URL: "https://typo-domain.example.com",
  });
  assert.equal(code, 1);
  assert.match(stderr, /NEXT_PUBLIC_SITE_URL hostname must be a host deploy\/Caddyfile routes/);
});
