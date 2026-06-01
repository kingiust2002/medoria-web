#!/usr/bin/env node
// Generate an OPERATOR_PASSWORD_HASH value for the Medoria operator panel.
// Usage:  node scripts/hash-operator-password.mjs 'YourStrongPassword'
// Copy the printed "scrypt:salt:hash" string into .env.local as OPERATOR_PASSWORD_HASH.
import { scryptSync, randomBytes } from "node:crypto";

const password = process.argv[2];
if (!password) {
  console.error("Usage: node scripts/hash-operator-password.mjs 'YourStrongPassword'");
  process.exit(1);
}
const salt = randomBytes(16);
const key = scryptSync(String(password), salt, 32);
process.stdout.write(`scrypt:${salt.toString("hex")}:${key.toString("hex")}\n`);
