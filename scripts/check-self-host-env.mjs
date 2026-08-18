import fs from "node:fs";
import path from "node:path";

const envPath = path.resolve(process.argv[2] || "deploy/.env");

function fail(message) {
  console.error(`[self-host-env] ${message}`);
  process.exitCode = 1;
}

function parseEnv(text) {
  const values = new Map();

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separator = line.indexOf("=");
    if (separator < 1) continue;

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values.set(key, value);
  }

  return values;
}

if (!fs.existsSync(envPath)) {
  fail(`environment file not found: ${envPath}`);
  process.exit();
}

const values = parseEnv(fs.readFileSync(envPath, "utf8"));

const required = [
  "STAGING_HOST",
  "ACME_EMAIL",
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "OPERATOR_USERNAME",
  "OPERATOR_PASSWORD_HASH",
  "OPERATOR_SESSION_SECRET",
  "BEAUTY_OPERATOR_USERNAME",
  "BEAUTY_OPERATOR_PASSWORD_HASH",
  "BEAUTY_OPERATOR_SESSION_SECRET",
  "CAPTCHA_SECRET",
];

const placeholderPattern = /^(replace|change-me|example|todo|xxx)|example\.com/i;

for (const key of required) {
  const value = values.get(key) || "";
  if (!value) {
    fail(`missing required variable: ${key}`);
  } else if (placeholderPattern.test(value)) {
    fail(`placeholder value remains for: ${key}`);
  }
}

for (const key of ["OPERATOR_SESSION_SECRET", "BEAUTY_OPERATOR_SESSION_SECRET"]) {
  const value = values.get(key) || "";
  if (value && value.length < 32) {
    fail(`${key} must contain at least 32 characters`);
  }
}

for (const key of ["NEXT_PUBLIC_SITE_URL", "NEXT_PUBLIC_SUPABASE_URL"]) {
  const value = values.get(key);
  if (!value) continue;

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:") {
      fail(`${key} must use https`);
    }
  } catch {
    fail(`${key} is not a valid URL`);
  }
}

const siteUrl = values.get("NEXT_PUBLIC_SITE_URL");
const stagingHost = values.get("STAGING_HOST");
if (siteUrl && stagingHost) {
  try {
    if (new URL(siteUrl).hostname !== stagingHost) {
      fail("NEXT_PUBLIC_SITE_URL hostname must match STAGING_HOST during app staging");
    }
  } catch {
    // Invalid URL is reported above.
  }
}

if (process.exitCode) {
  console.error("[self-host-env] preflight failed; no secret values were printed");
} else {
  console.log(`[self-host-env] preflight passed for ${envPath}`);
}
