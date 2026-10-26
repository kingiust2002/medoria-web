# Operator panel security (Health and Beauty)

Three additions, the same for both panels and fully separate between them (own cookie, own secret,
own session list, own log, own two-step login):

1. **A real logout and "end sessions".** Every login is now a registered session. Logout, "end other
   sessions" and "end all sessions" end it **on the server**, so a copied or stolen cookie stops
   working (before, logout only erased the cookie in your own browser and a copy stayed valid for up
   to 8 hours).
2. **An activity log** (`/operator/activity`, `/beauty/operator/activity`): what was done, when, how many items,
   from which session. Not who, and never customer data.
3. **Optional two-step login:** the 6-digit code of an authenticator app after the password, plus one-time
   recovery codes for a lost phone. Off until you switch it on, per panel.

## Honest limits

- Each panel has **one shared account**. The log and the session list can say "a session logged in from network
  `ab12cd`", never "Mr. X did this". The log does not guess who someone is, and nothing here can tell apart two people who
  share the password. If you need that, the next step is one account per person (not built).
- The log holds actions, table names, record numbers and counts only (price changes include the new price, which is public).
  Customer names, phone numbers, message texts and e-mail addresses are never stored there; the code drops anything that
  looks like them even under an allowed field. The "network" hint is a keyed hash of the address, not the address.
- A session that was revoked on one server process is noticed by another within about 20 seconds (a short cache); on this
  single server revocation is immediate.
- Two-step login protects against a guessed or leaked **password**. It does not help if someone already has a live session
  cookie (use "end all sessions") or controls the server.
- If the log cannot be written, **deleting** is refused (a database hiccup must not allow an untraceable delete);
  other changes still go through and only lose their log line. If the log table does not exist yet (before migration 30),
  nothing is refused: the old behaviour applies.

## Switching it on (one time, in this order)

**1. Database (SSH on the server).** Back up first (`production-backup.sh`, §23.6 step 0), then run migration 30. It only
creates four private tables (RLS on, no policy, service role only), changes nothing existing, and can be run twice:

```bash
docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f - < /home/medoria/apps/medoria-staging/migrations/30_operator_security.sql
```

Expected: `BEGIN`, a few `CREATE TABLE`/`DO`, `COMMIT`. Check: `npm run check:rls` should now also say
`anon CANNOT read operator_…` four times.

**2. Deploy the code** as usual (§23.6 step 3: tag the current image, `git pull --ff-only`, `deploy.sh`). **Everyone logs in
once more** afterwards: sessions from before have no registered id and are refused. (If you deploy before step 1 nothing breaks:
without the tables the panels keep the old behaviour and just show "run migration 30" in Settings.)

**3. Look at it.** Log in, open *Settings*: you should see "این نشست" in the sessions list, and *تاریخچه* (History) in the menu.

## Two-step login

Do this for one panel at a time, on the server, in your own terminal (the key and codes are printed once, on your screen only):

```bash
cd /home/medoria/apps/medoria-staging
node scripts/operator-2fa.mjs health --append-to deploy/.env      # or: beauty
```

1. In your phone's authenticator app (Google Authenticator, Aegis, Authy, 1Password) add an account by typing the **setup key**.
2. Write down the **8 recovery codes** on paper and keep them somewhere safe. Each works once. Do not photograph them into a chat.
3. Check that the six digits in your app equal the "right now" code the script prints.
4. Validate and apply (the container reads `deploy/.env` only when it is created):

   ```bash
   npm run check:self-host-env -- deploy/.env        # must end with "preflight passed"
   docker compose --env-file deploy/.env -f deploy/compose.app.yml up -d app
   ```
5. `clear` the terminal. Open the login page in a private window: after the password it asks for the code.
   Test **one recovery code** too (it is then used up).

The script refuses to overwrite an existing secret. The file receives the secret and the **hashes** of the recovery codes,
never the codes.

**Lost phone:** use a recovery code on the login page ("کد را ندارم — استفاده از کد بازیابی"). Out of codes too: on the server remove
the two `*_TOTP_SECRET` / `*_RECOVERY_CODE_HASHES` lines of that panel from `deploy/.env`, recreate the app container, log in with the
password, then run the script again for a new setup. (That requires SSH access to the server, which is why that access is key-only.)

**Turn it off:** remove those two lines and recreate the container.

## Ending sessions

Settings → *نشست‌ها*: "پایان نشست‌های دیگر" keeps you logged in and ends everyone else; "پایان همهٔ نشست‌ها" ends yours too.
Use the second one when a password, a phone or a computer may have fallen into the wrong hands, **and change the password too**
(`scripts/hash-operator-password.mjs`; changing `OPERATOR_PASSWORD_HASH` also ends every session on its own).

### Failures are never read as success (review 2026-10-26)

- **An outage is not a missing table.** The session check skips itself only when the registry table really does not exist (Postgres `42P01`, PostgREST `PGRST205`: migration 30 not applied yet). Every other failure refuses: a database outage, a connection error (`PGRST000`/`PGRST001`), a schema cache that cannot be built (`PGRST002`, "Could not query the database for the schema cache"), a permission error, a network failure. The bare words "schema cache" used to count as "missing table", so during a `PGRST002` outage every correctly signed cookie opened the panel; a cookie with a random signature never did. The same classifier decides login (refused while sessions cannot be recorded), the second-factor replay memory (a code is refused if its use cannot be recorded), "end session(s)" (reports failure) and the activity log (a deletion is refused while the log cannot be written). A session already checked is trusted for at most 20 seconds, so a short outage does not log people out mid-click.
- **Logout is confirmed by the server.** If the server cannot end the session (HTTP 503 `{ ok: false }`), the browser cookie is **kept** (so a retry can still end it), nothing is logged as `auth.logout` (the failure is logged as `auth.logout_failed`), and the panel stays open and says so with a retry button, in both panels (sidebar button and the settings page button). Only `{ ok: true }` from the server sends the user to the login page. The idle auto-logout uses the same path, so after 20 idle minutes with the server failing, the panel shows the error instead of pretending to have left.

## Reading the log

*تاریخچه* lists the last 200 events of that panel: logins (and failed ones with the reason `password`, `bad_code`, `replay`,
`recovery_used`), logouts, session endings, recovery-code use, deletions, status changes, product and category edits, imports.
Several failed logins you do not recognise, or a recovery-code use you did not do yourself, are the signals to end all sessions and
change the password. There is no automatic clean-up; at this size the table stays small (a few thousand rows a year).

## Rollback

Application: the previous image (§23.6 step 6). Everyone will have to log in again. Database (only if the previous release is
running): `DROP TABLE operator_recovery_used, operator_totp_state, operator_sessions, operator_audit_log;` — not needed to go
back, because the previous code ignores these tables.

## What the tests prove

`tests/panel-security.test.mjs` (RFC 6238 vectors, replay, recovery codes, registry, log hygiene, wiring) and
`tests/e2e/security.e2e.mjs` (real browser and a fake database): a copied cookie stops working after logout and after "end
sessions"; a cookie without a registered session is refused; the Beauty panel's two-step login with a wrong code, a replayed code and
single-use recovery codes; ending Health sessions leaves Beauty alone; the log carries ids, counts and session ids and no customer data;
a delete is refused while the log is broken and allowed while the table does not exist. With the server-side session check switched
off, exactly the three session tests fail.
