#!/usr/bin/env node
// scripts/self-host/owner-recovery.mjs — EMERGENCY: an owner of the operator panels lost their password and second factor.
// Full procedure, prerequisites and what to check afterwards: docs/OPERATOR_ACCOUNTS.md ("Emergency: an owner lost their own access").
//
//   node scripts/self-host/owner-recovery.mjs --username <owner>             # dry run: explains, changes nothing, prints no SQL
//   node scripts/self-host/owner-recovery.mjs --username <owner> --apply \
//     | docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1
//
// stdout is the SQL (it holds only the HASH of the new password) — pipe it straight into psql, do not save it.
// stderr shows the ONE-TIME password exactly once, on your terminal. It forces a password change at the first sign-in.
// Needs only Node (no npm install, no database credentials: the database container's own superuser runs the SQL).
import { buildOwnerRecovery, OWNER_CHECK_SQL } from "../../lib/operator/ownerRecovery.js";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const username = value("--username");

if (flag("--help") || !username) {
  console.error("usage: owner-recovery.mjs --username <owner-username> [--apply]\n       owner-recovery.mjs --list     (prints the read-only SQL that lists the owners)");
  if (flag("--list")) console.log(OWNER_CHECK_SQL);
  process.exit(flag("--help") || flag("--list") ? 0 : 2);
}

const res = buildOwnerRecovery({ username });
if (!res.ok) { console.error(`ERROR: ${res.error}`); process.exit(2); }

if (!flag("--apply")) {
  console.error(`DRY RUN for owner "${res.username}". Nothing was changed and no SQL was printed.
With --apply this prints SQL that, in one transaction:
  - writes an "attempt" line to the activity log of both panels (no log line, no change),
  - checks that "${res.username}" is an ACTIVE owner,
  - replaces the password with a new one-time password, removes the second-factor seed and all recovery codes, requires a second factor again,
  - ends every session of that owner, and writes the "success" line.
Pipe it into the database container:  ... --apply | docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1`);
  process.exit(0);
}

process.stdout.write(res.sql);
console.error(`\nOne-time password for "${res.username}" (shown once; the first sign-in forces a new one):\n\n    ${res.password}\n\nThen sign in, choose a new password and set up a NEW two-step login. Check the activity log for "user.emergency_recovery".`);
