import fs from "node:fs";
import path from "node:path";

const envPath = path.resolve(process.argv[2] || "deploy/.env");

function fail(message) {
  console.error(`[self-host-env] ${message}`);
  process.exitCode = 1;
}

// A warning never changes the exit code: it names something the owner must decide, not a broken setup.
function warn(message) {
  console.error(`[self-host-env] WARNING ${message}`);
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

// Public contact addresses end up in mailto: links on the live site, so a typo
// ships straight to customers (a ".con" address sat in production for weeks).
// Empty is fine (the link is simply hidden); a non-empty value must look like
// an address and must not use the classic ".con" typo.
for (const key of [
  "NEXT_PUBLIC_EMAIL",
  "NEXT_PUBLIC_EMAIL_HEALTH",
  "NEXT_PUBLIC_EMAIL_BEAUTY",
  "NEXT_PUBLIC_EMAIL_INFO",
]) {
  const value = values.get(key);
  if (!value) continue;
  if (!/^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(value)) {
    fail(`${key} is not a valid e-mail address`);
  } else if (/\.con$/i.test(value)) {
    fail(`${key} ends in ".con" -- did you mean ".com"?`);
  }
}

// Visitor analytics (docs/PRIVACY_AND_ANALYTICS.md): off unless an id is set. Turning one on sends every
// visitor's page views to Google / Yandex, which needs a privacy notice (and, depending on the visitors'
// countries, consent) first. Only a reminder: the ids are not printed.
{
  const on = ["NEXT_PUBLIC_GA_MEASUREMENT_ID", "NEXT_PUBLIC_YANDEX_METRICA_ID"].filter((k) => values.get(k));
  if (on.length) {
    warn(`${on.join(" and ")} ${on.length > 1 ? "are" : "is"} set: visitor analytics will be active. Publish a privacy notice (and consent if required) BEFORE deploying this; see docs/PRIVACY_AND_ANALYTICS.md`);
  }
}

// Optional Telegram notices for new customer inquiries (docs/QUOTE_NOTIFICATIONS.md):
// one bot token (shared, optionally overridden per house) and one private group per house.
// A house with a chat id needs a token; a token without any chat id is a half-finished setup.
// Values are never printed.
{
  const TOKEN_RE = /^\d{6,}:[A-Za-z0-9_-]{30,}$/;
  const CHAT_RE = /^(-?\d{5,}|@[A-Za-z][A-Za-z0-9_]{4,})$/;
  const get = (key) => values.get(key) || "";
  const shared = get("TELEGRAM_BOT_TOKEN");

  if (get("TELEGRAM_CHAT_ID")) {
    fail("TELEGRAM_CHAT_ID is not used any more: set TELEGRAM_CHAT_ID_HEALTH and/or TELEGRAM_CHAT_ID_BEAUTY (one private group per house)");
  }
  for (const key of ["TELEGRAM_BOT_TOKEN", "TELEGRAM_BOT_TOKEN_HEALTH", "TELEGRAM_BOT_TOKEN_BEAUTY"]) {
    if (get(key) && !TOKEN_RE.test(get(key))) {
      fail(`${key} does not look like a bot token (<digits>:<35 characters>)`);
    }
  }
  let anyChat = false;
  for (const house of ["HEALTH", "BEAUTY"]) {
    const chat = get(`TELEGRAM_CHAT_ID_${house}`);
    if (!chat) continue;
    anyChat = true;
    if (!CHAT_RE.test(chat)) {
      fail(`TELEGRAM_CHAT_ID_${house} must be a numeric chat id (groups start with -) or @channelusername`);
    }
    if (!get(`TELEGRAM_BOT_TOKEN_${house}`) && !shared) {
      fail(`TELEGRAM_CHAT_ID_${house} is set but there is no bot token (set TELEGRAM_BOT_TOKEN)`);
    }
  }
  const anyToken = shared || get("TELEGRAM_BOT_TOKEN_HEALTH") || get("TELEGRAM_BOT_TOKEN_BEAUTY");
  if (anyToken && !anyChat) {
    fail("a Telegram bot token is set but no TELEGRAM_CHAT_ID_HEALTH / TELEGRAM_CHAT_ID_BEAUTY (or leave all Telegram variables empty)");
  }
}

// Optional two-step login of the operator panels (docs/OPERATOR_SECURITY.md): a base32 TOTP secret per
// panel and the SHA-256 hashes of its one-time recovery codes (scripts/operator-2fa.mjs prints both).
// Half-configured states are refused: recovery hashes without a secret do nothing, and a secret
// without recovery hashes leaves no way back in when the phone is lost. Values are never printed.
{
  const get = (key) => values.get(key) || "";
  for (const prefix of ["OPERATOR", "BEAUTY_OPERATOR"]) {
    const secret = get(`${prefix}_TOTP_SECRET`);
    const hashes = get(`${prefix}_RECOVERY_CODE_HASHES`);
    if (secret && !/^[A-Z2-7]{26,64}$/.test(secret.toUpperCase().replace(/[\s=-]/g, ""))) {
      fail(`${prefix}_TOTP_SECRET is not a valid base32 secret (generate it with scripts/operator-2fa.mjs)`);
    }
    if (hashes) {
      const list = hashes.split(/[\s,]+/).filter(Boolean);
      if (!list.length || !list.every((h) => /^[0-9a-fA-F]{64}$/.test(h))) {
        fail(`${prefix}_RECOVERY_CODE_HASHES must be a comma-separated list of 64-character hex hashes (scripts/operator-2fa.mjs)`);
      }
    }
    if (hashes && !secret) fail(`${prefix}_RECOVERY_CODE_HASHES is set but ${prefix}_TOTP_SECRET is not`);
    if (secret && !hashes) fail(`${prefix}_TOTP_SECRET is set without ${prefix}_RECOVERY_CODE_HASHES: there would be no way in if the phone is lost`);
  }
}

// deploy/Caddyfile routes these hosts to the app service directly. Keep this
// set in sync with the site block there -- NEXT_PUBLIC_SITE_URL pointing at
// a host Caddy doesn't route is a real outage, not a style nit (see the
// STAGING_HOST/ambiguous-site-definition incident in
// docs/PRODUCTION_MIGRATION_AND_OPERATIONS.md §18.2).
const CADDY_ROUTED_APP_HOSTS = new Set([
  "medoriaco.com",
  "www.medoriaco.com",
  "staging.medoriaco.com",
]);

const siteUrl = values.get("NEXT_PUBLIC_SITE_URL");
if (siteUrl) {
  try {
    const siteHost = new URL(siteUrl).hostname;
    if (!CADDY_ROUTED_APP_HOSTS.has(siteHost)) {
      fail(
        "NEXT_PUBLIC_SITE_URL hostname must be a host deploy/Caddyfile " +
          `routes to the app (${[...CADDY_ROUTED_APP_HOSTS].join(", ")})`,
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
