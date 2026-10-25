#!/usr/bin/env node
// Set up two-step login for an operator panel. Run it ON THE SERVER, in your own terminal:
//
//   node scripts/operator-2fa.mjs health [--account <label>] [--append-to deploy/.env]
//   node scripts/operator-2fa.mjs beauty [--account <label>] [--append-to deploy/.env]
//
// It prints (once, to your terminal only):
//   • the setup key and an otpauth:// address for an authenticator app (Google Authenticator, Aegis,
//     Authy, 1Password ...): add the account by typing the key, or paste the address if the app allows
//   • 8 recovery codes: each works ONCE if the phone is lost. Store them offline (printed, in a safe).
// and (with --append-to) adds these two lines to the env file, refusing if they already exist:
//   OPERATOR_TOTP_SECRET=...  OPERATOR_RECOVERY_CODE_HASHES=...      (BEAUTY_OPERATOR_* for beauty)
// The file only ever gets the secret and the HASHES of the recovery codes, never the codes.
// Never paste the printed key or codes into a chat, ticket or e-mail. Then recreate the app container.
//
// To turn it off again: remove the two lines and recreate the container. Nothing is written to the
// database, and the repository never sees any of this.
import fs from "node:fs";
import { generateTotpSecret, otpauthUri, generateRecoveryCodes, totpAt, stepOf } from "../lib/operator/security.js";

const args = process.argv.slice(2);
const house = args[0];
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };

if (!["health", "beauty"].includes(house)) {
  console.error("Usage: node scripts/operator-2fa.mjs <health|beauty> [--account label] [--append-to deploy/.env]");
  process.exit(2);
}
const prefix = house === "health" ? "OPERATOR" : "BEAUTY_OPERATOR";
const target = opt("--append-to");

if (target) {
  const existing = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "";
  const used = [`${prefix}_TOTP_SECRET`, `${prefix}_RECOVERY_CODE_HASHES`].filter((k) => new RegExp(`^${k}=.+`, "m").test(existing));
  if (used.length) {
    console.error(`Refusing to overwrite: ${used.join(", ")} already set in ${target}. Remove those lines first if you really want new ones.`);
    process.exit(1);
  }
}

const secret = generateTotpSecret();
const codes = generateRecoveryCodes(8);
const account = opt("--account") || `${house}-panel`;
const issuer = `Medoria ${house === "health" ? "Health" : "Beauty"}`;

console.log(`\n${issuer} — two-step login\n`);
console.log("1) In your authenticator app add an account by typing this setup key (spaces do not matter):");
console.log(`\n     ${secret.match(/.{1,4}/g).join(" ")}\n`);
console.log("   or use this address if the app can read it:");
console.log(`\n     ${otpauthUri({ secret, account, issuer })}\n`);
console.log("2) Recovery codes, each works ONCE. Store them offline, never in a chat or e-mail:\n");
for (const c of codes) console.log(`     ${c.code}`);
console.log("");

const lines = `${prefix}_TOTP_SECRET=${secret}\n${prefix}_RECOVERY_CODE_HASHES=${codes.map((c) => c.hash).join(",")}\n`;
if (target) {
  fs.appendFileSync(target, `${fs.existsSync(target) && !fs.readFileSync(target, "utf8").endsWith("\n") ? "\n" : ""}${lines}`);
  console.log(`3) Added ${prefix}_TOTP_SECRET and ${prefix}_RECOVERY_CODE_HASHES to ${target}.`);
} else {
  console.log("3) Add these two lines to deploy/.env (they hold the secret and the HASHES of the codes):\n");
  process.stdout.write(lines.split("\n").filter(Boolean).map((l) => `     ${l}`).join("\n") + "\n");
}
console.log(`\n4) Check it before relying on it: right now your authenticator app should show ${totpAt(secret, stepOf(Date.now()))} (it changes every 30 seconds). If it does not match, the key was typed wrongly.`);
console.log("5) npm run check:self-host-env -- deploy/.env, then recreate the app container, then clear this screen (clear).\n");
