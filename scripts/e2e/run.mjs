#!/usr/bin/env node
// End-to-end runner: builds the app against a FAKE database, starts both, runs the
// browser tests in tests/e2e/*.e2e.mjs and tears everything down.
//
//   npm run test:e2e                 build (into .next-e2e) + run
//   E2E_SKIP_BUILD=1 npm run test:e2e   reuse the last e2e build
//
// Nothing here touches production: the app's Supabase URL points at 127.0.0.1 and the
// keys are dummy values. Needs Playwright's Chromium (`npx playwright install chromium`
// outside the Claude Code sandbox, where it is pre-installed).
import { spawn, spawnSync } from "node:child_process";
import { scryptSync, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createFakeDb, ANON_KEY, SERVICE_KEY } from "../../tests/e2e/fakeDb.mjs";
import { seed } from "../../tests/e2e/seed.mjs";
import { generateTotpSecret, generateRecoveryCodes } from "../../lib/operator/security.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DB_PORT = Number(process.env.E2E_DB_PORT || 54399);
const APP_PORT = Number(process.env.E2E_APP_PORT || 3950);
const DIST = ".next-e2e";

// same scrypt parameters as scripts/hash-operator-password.mjs
const hash = (password) => {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, 32, { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 });
  return `scrypt:131072:8:1:${salt.toString("hex")}:${key.toString("hex")}`;
};
const secret = () => randomBytes(24).toString("hex");

const creds = {
  health: { user: "e2e-health", password: `pw-${secret()}` },
  beauty: { user: "e2e-beauty", password: `pw-${secret()}` },
};

// The Beauty panel runs WITH two-step login, the Health panel without: both modes are exercised.
const beautyTotp = { secret: generateTotpSecret(), recovery: generateRecoveryCodes(3) };

const baseEnv = {
  ...process.env,
  NO_PROXY: "localhost,127.0.0.1", no_proxy: "localhost,127.0.0.1",
  NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${DB_PORT}`,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY,
  NEXT_PUBLIC_SITE_URL: `http://127.0.0.1:${APP_PORT}`,
  NEXT_DIST_DIR: DIST,
};
const reminderToken = `e2e-${secret()}`;   // throw-away value for the reminder endpoint test
const serverEnv = {
  ...baseEnv,
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
  QUOTE_REMINDER_TOKEN: reminderToken,
  OPERATOR_USERNAME: creds.health.user, OPERATOR_PASSWORD_HASH: hash(creds.health.password), OPERATOR_SESSION_SECRET: secret(),
  BEAUTY_OPERATOR_USERNAME: creds.beauty.user, BEAUTY_OPERATOR_PASSWORD_HASH: hash(creds.beauty.password), BEAUTY_OPERATOR_SESSION_SECRET: secret(),
  BEAUTY_OPERATOR_TOTP_SECRET: beautyTotp.secret, BEAUTY_OPERATOR_RECOVERY_CODE_HASHES: beautyTotp.recovery.map((c) => c.hash).join(","),
};
for (const k of Object.keys(serverEnv)) if (/^(TELEGRAM_|UPSTASH_)/.test(k)) delete serverEnv[k];

if (!process.env.E2E_SKIP_BUILD || !fs.existsSync(path.join(root, DIST))) {
  console.log("▶ building the app against the fake database …");
  const b = spawnSync("npx", ["next", "build"], { cwd: root, env: baseEnv, stdio: "inherit" });
  if (b.status !== 0) { console.error("✗ build failed"); process.exit(b.status || 1); }
}

const db = createFakeDb(seed);
await db.start(DB_PORT);
const app = spawn("npx", ["next", "start", "-p", String(APP_PORT), "-H", "127.0.0.1"], { cwd: root, env: serverEnv, stdio: ["ignore", "pipe", "pipe"] });
let appLog = "";
app.stdout.on("data", (d) => { appLog += d; });
app.stderr.on("data", (d) => { appLog += d; });

const stop = async (code) => {
  app.kill("SIGTERM");
  // `npx` wraps next-server; make sure nothing keeps the port
  spawnSync("pkill", ["-f", `next start -p ${APP_PORT}`]);
  spawnSync("pkill", ["-f", `next-server`]);
  await db.stop().catch(() => {});
  process.exit(code);
};

try {
  const base = `http://127.0.0.1:${APP_PORT}`;
  let up = false;
  for (let i = 0; i < 60 && !up; i++) {
    try { up = (await fetch(`${base}/api/health`)).ok; } catch { /* not yet */ }
    if (!up) await new Promise((r) => setTimeout(r, 500));
  }
  if (!up) { console.error("✗ the app did not start\n" + appLog.slice(-2000)); await stop(1); }

  const only = (process.env.E2E_FILES || "").split(",").filter(Boolean);   // run some files: E2E_FILES=security,panel-flows
  const files = fs.readdirSync(path.join(root, "tests/e2e")).filter((f) => f.endsWith(".e2e.mjs") && (!only.length || only.some((o) => f.startsWith(o)))).map((f) => path.join("tests/e2e", f));
  // async spawn: the fake database lives in THIS process and must keep answering while the tests run
  const code = await new Promise((resolve) => {
    const t = spawn(process.execPath, ["--test", "--test-concurrency=1", ...files], {
      cwd: root, stdio: "inherit",
      env: {
        ...process.env,
        E2E_BASE_URL: base, E2E_DB_URL: `http://127.0.0.1:${DB_PORT}`,
        E2E_HEALTH_USER: creds.health.user, E2E_HEALTH_PASSWORD: creds.health.password,
        E2E_HEALTH_SESSION_SECRET: serverEnv.OPERATOR_SESSION_SECRET, E2E_HEALTH_PASSWORD_HASH: serverEnv.OPERATOR_PASSWORD_HASH,
        E2E_REMINDER_TOKEN: reminderToken,
        E2E_BEAUTY_USER: creds.beauty.user, E2E_BEAUTY_PASSWORD: creds.beauty.password,
        E2E_BEAUTY_TOTP_SECRET: beautyTotp.secret, E2E_BEAUTY_RECOVERY_CODES: beautyTotp.recovery.map((c) => c.code).join(","),
      },
    });
    t.on("exit", (c) => resolve(c ?? 1));
  });
  await stop(code);
} catch (e) {
  console.error(e);
  await stop(1);
}
