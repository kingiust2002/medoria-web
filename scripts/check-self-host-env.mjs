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

// deploy/Caddyfile now routes these hosts to the app service directly,
// alongside the temporary {$STAGING_HOST} block. Once a host is wired in
// there, NEXT_PUBLIC_SITE_URL is allowed to point at it even though it no
// longer equals STAGING_HOST -- that equality was only ever a stand-in for
// "Caddy will actually answer for this host". Keep this list in sync with
// the site block in deploy/Caddyfile.
const CADDY_ROUTED_APP_HOSTS = new Set([
  "medoriaco.com",
  "www.medoriaco.com",
  "staging.medoriaco.com",
]);

const siteUrl = values.get("NEXT_PUBLIC_SITE_URL");
const stagingHost = values.get("STAGING_HOST");
if (siteUrl && stagingHost) {
  try {
    const siteHost = new URL(siteUrl).hostname;
    if (siteHost !== stagingHost && !CADDY_ROUTED_APP_HOSTS.has(siteHost)) {
      fail(
        "NEXT_PUBLIC_SITE_URL hostname must equal STAGING_HOST (temporary " +
          "staging), or be a host deploy/Caddyfile already routes to the " +
          `app (${[...CADDY_ROUTED_APP_HOSTS].join(", ")})`,
      );
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
