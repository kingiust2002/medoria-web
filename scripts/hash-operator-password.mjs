#!/usr/bin/env node
// Generate an OPERATOR_PASSWORD_HASH / BEAUTY_OPERATOR_PASSWORD_HASH value.
// Usage:  node scripts/hash-operator-password.mjs 'YourStrongPassword'
// Copy the printed "scrypt:N:r:p:salt:hash" string into the matching env var.
//
// Cost follows OWASP 2024/2025 guidance (scrypt N=2^17, r=8, p=1). The params
// are embedded in the output so verification always uses the same N that
// created the hash. maxmem must be raised or Node rejects an N this large.
import { scryptSync, randomBytes } from "node:crypto";

const N = 131072, r = 8, p = 1, maxmem = 256 * 1024 * 1024;

const password = process.argv[2];
if (!password) {
  console.error("Usage: node scripts/hash-operator-password.mjs 'YourStrongPassword'");
  process.exit(1);
}
const salt = randomBytes(16);
const key = scryptSync(String(password), salt, 32, { N, r, p, maxmem });
process.stdout.write(`scrypt:${N}:${r}:${p}:${salt.toString("hex")}:${key.toString("hex")}\n`);
