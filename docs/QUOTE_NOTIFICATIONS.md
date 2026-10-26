# New-inquiry notifications (Telegram, one group per house)

Every customer inquiry is stored in `quote_requests` (Health) or
`beauty_quote_requests` (Beauty) and appears in the matching operator panel, but nobody
is told. With this feature each new inquiry also posts a short notice to a **private
Telegram group**: Health inquiries to the Health group, Beauty inquiries to the Beauty
group. The team sees a lead within seconds, and each group is a second copy of the
lead (the daily backup can be up to 24 h old).

It is **off by default**. A house sends nothing until it has a chat id; merging the code
changes nothing in production.

## Status

| Date | State |
| --- | --- |
| 2026-10-24 | Code merged ([#175](https://github.com/kingiust2002/medoria-web/pull/175)) and deployed (`main` `a3c8924`). Setup parts A–C below were done on the server: bot token and the two private group ids (Health, Beauty) are in `deploy/.env`, the env preflight passed, `deploy.sh` finished and the app container is healthy. |
| 2026-10-24 — owner-confirmed | The owner confirmed that both contact forms and Telegram work correctly, after being asked to test Health and Beauty delivery to their matching groups. Panel visibility and deletion of the test rows are still awaiting confirmation: the panels had no delete option, which is added by [#178](https://github.com/kingiust2002/medoria-web/pull/178) (merged 2026-10-24, not yet deployed); after deploying, delete the test rows with the new button (part D step 12). |
| 2026-10-25 — **final** | The owner declared the notifications **final and done**. The delete option ([#178](https://github.com/kingiust2002/medoria-web/pull/178)) and the archive/spam/bulk screen ([#181](https://github.com/kingiust2002/medoria-web/pull/181), migration 29) are deployed; the test and old inquiries were deleted (owner's report). Part D is complete, including the cleanup that was pending on 2026-10-24. |

For the full part D acceptance check (forms and delivery are already owner-confirmed), verify all of the following: (1) a `TEST Health` inquiry from
`/health/en/contact` is stored, appears in `/operator` → Quotes, and its notice arrives in
the **Health group only**; (2) a `TEST Beauty` inquiry from `/beauty/en/contact` is stored,
appears in `/beauty/operator` → Quotes, and its notice arrives in the **Beauty group
only**; (3) both test rows are deleted afterwards. The form/delivery confirmation is recorded above and in runbook §23.7.3; record panel
visibility and cleanup when confirmed to close the remaining part of §22.7 item 3b. If a notice does not arrive,
use the log check in part D; a failed notice never blocks the inquiry itself.

The token and chat ids are not written in this repository; they exist only in
`deploy/.env` on the server (which is also kept, encrypted, in every backup snapshot).

## Design

- **One bot, two private groups.** One token to protect and one bot to create; the groups
  keep the two houses' leads and teams apart. (A separate bot per house is possible with
  `TELEGRAM_BOT_TOKEN_HEALTH` / `TELEGRAM_BOT_TOKEN_BEAUTY`, each overrides the shared
  token for its house.)
- **No shared fallback chat.** The old single `TELEGRAM_CHAT_ID` is ignored (and the
  preflight rejects it), so a Beauty inquiry can never end up in the Health group by
  misconfiguration.
- Each house is switched on independently: set only `TELEGRAM_CHAT_ID_HEALTH` to start
  with Health alone.

## What is sent

```text
Medoria Health: new inquiry #12
Name: <name>
Organization: <organization>
Product: <product> (<SKU>) x <quantity>
Prefers: whatsapp (tg)
Open: https://medoriaco.com/operator/quotes
```

Beauty inquiries say `Medoria Beauty` and link to `/beauty/operator/quotes`.
**The phone number and the message text are not included** unless you set
`TELEGRAM_INCLUDE_DETAILS=true` (applies to both houses). The notice is plain text (no
markup) and every visitor-typed field is trimmed and length-capped.

The name and organization a visitor types do leave the server and reach Telegram's
servers: keep both groups private, limit them to the people who answer inquiries, and
decide consciously about `TELEGRAM_INCLUDE_DETAILS`.

## Failure behaviour

The inquiry is saved first. The notice is sent afterwards with a 2.5 s timeout and can
never fail or slow the form: if Telegram is unreachable or refuses, the server log gets
one line (`telegram notice failed: HTTP 401`, `HTTP 403`, `... TimeoutError`; never the
token, the URL or the inquiry) and the visitor still sees success.

## Setup, step by step

Do this **after** the pull request with this feature is merged and deployed (until then
the variables would simply be ignored). *As of 2026-10-24 the code is deployed and A–C are
done in production; this list stays as the procedure for a new server or a changed bot
or group. Step 10 can equally be done by running `scripts/self-host/deploy.sh`, which was
the method used.* Each step says where it happens. The bot token
is a password: it goes from Telegram straight into the server's `deploy/.env`. Never
paste it into a chat, a ticket, an e-mail or a command line.

### A. In Telegram (phone or desktop)

1. Open **@BotFather**, send `/newbot`, choose a display name and a username ending in
   `bot`. BotFather replies with the **token** (`123456789:AA...`). Keep that message
   open; do not forward or screenshot it.
2. Create the group **"Medoria Health inquiries"** (a normal private group): add the
   people who answer Health inquiries, then add your bot as a member. Make sure the group
   has no public link.
3. Create the group **"Medoria Beauty inquiries"** the same way, with the Beauty team,
   and add the same bot.
4. In **each** group send `/start@<your bot username>` once. (This lets the bot see the
   group so its id can be looked up; the bot only ever *posts* afterwards.)

### B. On Windows (PowerShell)

5. Connect to the server with your key:

   ```powershell
   ssh root@91.107.182.97
   ```

   The prompt becomes `root@…#`: every command below is typed there.

### C. On the server (the SSH window)

6. Go to the app checkout and make sure there are no Telegram lines yet:

   ```bash
   cd /home/medoria/apps/medoria-staging
   grep -c '^TELEGRAM_' deploy/.env      # expect 0
   ```

7. Store the token without showing it or saving it in the shell history (paste the token
   from Telegram when asked; nothing is echoed; press Enter):

   ```bash
   read -rsp "Paste the bot token, then press Enter: " TG; echo
   printf 'TELEGRAM_BOT_TOKEN=%s\n' "$TG" >> deploy/.env; unset TG
   ```

8. Find the two group ids (this prints only ids and group names, never the token):

   ```bash
   node scripts/telegram-chat-ids.mjs deploy/.env
   ```

   Groups have a **negative** number such as `-1001234567890`. Note which one is the
   Health group and which is the Beauty group. If the list is empty, repeat step 4 and
   run it again.

9. Add the two ids (they are not secret), replacing the example numbers:

   ```bash
   printf 'TELEGRAM_CHAT_ID_HEALTH=%s\nTELEGRAM_CHAT_ID_BEAUTY=%s\n' -1001111111111 -1002222222222 >> deploy/.env
   ```

   To start with one house only, add just that line.

10. Validate and apply (the container reads `deploy/.env` only when it is created):

    ```bash
    npm run check:self-host-env -- deploy/.env        # must end with "preflight passed"
    docker compose --env-file deploy/.env -f deploy/compose.app.yml up -d app
    docker compose --env-file deploy/.env -f deploy/compose.app.yml ps   # app must be healthy
    ```

### D. Test (browser on Windows, then the panels)

11. Open `https://medoriaco.com/health/en/contact` and send an inquiry with an obvious
    name such as `TEST Health`; then the same on `/beauty/en/contact` with `TEST Beauty`.
    The first notice must appear in the Health group only, the second in the Beauty group
    only.
12. Open the operator panels (`/operator` and `/beauty/operator`, Quotes) and delete the
    two test rows.

If nothing arrives, on the server:

```bash
docker logs --since 10m medoria-app-app-1 2>&1 | grep "telegram notice failed"
```

`HTTP 401` = wrong or revoked token. `HTTP 400`/`403` = wrong chat id or the bot is not in
that group. No line at all and no message = that house has no chat id (or the container
was not recreated in step 10).

## Turn it off or roll back

Remove the `TELEGRAM_*` lines from `deploy/.env` (or empty a house's chat id to stop just
that house) and recreate the app container (step 10). To revoke the bot completely, send
`/revoke` to @BotFather. Also, if the token ever appears somewhere it should not, revoke it
there and create a new one.

## Not included (on purpose)

An e-mail channel (needs a transactional-mail provider and SPF/DKIM records), per-person
assignment, and follow-up reminders: add them when the team is larger than the current one
or two people.
