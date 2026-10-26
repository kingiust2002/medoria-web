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

test("accepts the per-house contact addresses and leaves empty ones alone", async () => {
  const { code, stdout } = await runChecker({
    NEXT_PUBLIC_SITE_URL: "https://medoriaco.com",
    NEXT_PUBLIC_EMAIL: "",
    NEXT_PUBLIC_EMAIL_HEALTH: "health@medoria.co",
    NEXT_PUBLIC_EMAIL_BEAUTY: "beauty@medoria.co",
    NEXT_PUBLIC_EMAIL_INFO: "info@medoria.co",
  });
  assert.equal(code, 0);
  assert.match(stdout, /preflight passed/);
});

test("fails on the '.con' typo in a contact address", async () => {
  const { code, stderr } = await runChecker({
    NEXT_PUBLIC_SITE_URL: "https://medoriaco.com",
    NEXT_PUBLIC_EMAIL: "someone@gmail.con",
  });
  assert.equal(code, 1);
  assert.match(stderr, /NEXT_PUBLIC_EMAIL ends in "\.con"/);
});

test("fails on a contact address that is not an e-mail address", async () => {
  const { code, stderr } = await runChecker({
    NEXT_PUBLIC_SITE_URL: "https://medoriaco.com",
    NEXT_PUBLIC_EMAIL_HEALTH: "health-at-medoria.co",
  });
  assert.equal(code, 1);
  assert.match(stderr, /NEXT_PUBLIC_EMAIL_HEALTH is not a valid e-mail address/);
});

const TG_TOKEN = "123456789:AAH-testtoken_testtoken_testtoken_1234";

test("Telegram notice variables: everything empty, or a valid one-bot/two-groups setup, passes", async () => {
  const site = { NEXT_PUBLIC_SITE_URL: "https://medoriaco.com" };
  assert.equal((await runChecker({ ...site, TELEGRAM_BOT_TOKEN: "", TELEGRAM_CHAT_ID_HEALTH: "", TELEGRAM_CHAT_ID_BEAUTY: "" })).code, 0);
  assert.equal((await runChecker({ ...site, TELEGRAM_BOT_TOKEN: TG_TOKEN, TELEGRAM_CHAT_ID_HEALTH: "-1001111111111", TELEGRAM_CHAT_ID_BEAUTY: "-1002222222222" })).code, 0);
  // one house only is fine
  assert.equal((await runChecker({ ...site, TELEGRAM_BOT_TOKEN: TG_TOKEN, TELEGRAM_CHAT_ID_HEALTH: "-1001111111111" })).code, 0);
  assert.equal((await runChecker({ ...site, TELEGRAM_BOT_TOKEN: TG_TOKEN, TELEGRAM_CHAT_ID_BEAUTY: "@medoria_beauty" })).code, 0);
  // a separate bot per house instead of the shared one
  assert.equal((await runChecker({ ...site, TELEGRAM_BOT_TOKEN_HEALTH: TG_TOKEN, TELEGRAM_BOT_TOKEN_BEAUTY: TG_TOKEN, TELEGRAM_CHAT_ID_HEALTH: "-1001111111111", TELEGRAM_CHAT_ID_BEAUTY: "-1002222222222" })).code, 0);
});

test("Telegram notice variables: half-finished or malformed setups fail without printing the values", async () => {
  const site = { NEXT_PUBLIC_SITE_URL: "https://medoriaco.com" };
  const noChat = await runChecker({ ...site, TELEGRAM_BOT_TOKEN: TG_TOKEN });
  assert.equal(noChat.code, 1);
  assert.match(noChat.stderr, /no TELEGRAM_CHAT_ID_HEALTH/);
  const noToken = await runChecker({ ...site, TELEGRAM_CHAT_ID_BEAUTY: "-1002222222222" });
  assert.equal(noToken.code, 1);
  assert.match(noToken.stderr, /TELEGRAM_CHAT_ID_BEAUTY is set but there is no bot token/);
  const legacy = await runChecker({ ...site, TELEGRAM_BOT_TOKEN: TG_TOKEN, TELEGRAM_CHAT_ID: "-1001111111111" });
  assert.equal(legacy.code, 1);
  assert.match(legacy.stderr, /TELEGRAM_CHAT_ID is not used any more/);
  const badToken = await runChecker({ ...site, TELEGRAM_BOT_TOKEN: "not-a-token", TELEGRAM_CHAT_ID_HEALTH: "-100123456" });
  assert.equal(badToken.code, 1);
  assert.match(badToken.stderr, /TELEGRAM_BOT_TOKEN does not look like a bot token/);
  assert.ok(!badToken.stderr.includes("not-a-token"));
  const badChat = await runChecker({ ...site, TELEGRAM_BOT_TOKEN: TG_TOKEN, TELEGRAM_CHAT_ID_HEALTH: "my group" });
  assert.equal(badChat.code, 1);
  assert.match(badChat.stderr, /TELEGRAM_CHAT_ID_HEALTH must be a numeric chat id/);
  assert.ok(!badChat.stderr.includes("my group"));
});

test("GEMINI_API_KEY must look like a Google AI Studio key; a retired GEMINI_MODEL is a warning; empty is fine", async () => {
  const ok = await runChecker({ NEXT_PUBLIC_SITE_URL: "https://medoriaco.com",  GEMINI_API_KEY: "AIzaSyTESTKEYTESTKEYTESTKEYTESTKEY_12345", GEMINI_MODEL: "" });
  assert.equal(ok.code, 0, ok.stderr);
  for (const bad of ["AIzaSy TEST KEY", "sk-ant-not-a-gemini-key-000000000000", "AIza"]) {
    const r = await runChecker({ NEXT_PUBLIC_SITE_URL: "https://medoriaco.com",  GEMINI_API_KEY: bad });
    assert.notEqual(r.code, 0, `${bad} must be refused`);
    assert.match(r.stderr + r.stdout, /GEMINI_API_KEY does not look like/);
    assert.ok(!(r.stderr + r.stdout).includes(bad.replace(/"/g, "")) || bad.length < 6, "the value is not printed");
  }
  const old = await runChecker({ NEXT_PUBLIC_SITE_URL: "https://medoriaco.com",  GEMINI_API_KEY: "AIzaSyTESTKEYTESTKEYTESTKEYTESTKEY_12345", GEMINI_MODEL: "gemini-2.0-flash" });
  assert.equal(old.code, 0);
  assert.match(old.stderr + old.stdout, /retired Gemini model/);
  assert.equal((await runChecker({ NEXT_PUBLIC_SITE_URL: "https://medoriaco.com" })).code, 0, "no AI key at all stays valid");
});
